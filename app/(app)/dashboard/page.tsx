"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Clock,
  Download,
  PackageCheck,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Wallet,
  Warehouse,
} from "lucide-react"

import { Button } from "@/components/atoms/Button"
import { MiniBarSparkline } from "@/components/atoms/MiniBarSparkline"
import { MiniProgress } from "@/components/atoms/MiniProgress"
import { Card } from "@/components/molecules/Card"
import { ChartCard } from "@/components/molecules/ChartCard"
import { DashboardFilterBar } from "@/components/molecules/DashboardFilterBar"
import { DashboardMiniStat } from "@/components/molecules/DashboardMiniStat"
import { DashboardScoreCard } from "@/components/molecules/DashboardScoreCard"
import { DashboardSpotlight, type SpotlightMetric } from "@/components/molecules/DashboardSpotlight"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { ErrorState } from "@/components/molecules/ErrorState"
import { InsightBanner } from "@/components/molecules/InsightBanner"
import { LoadingState } from "@/components/molecules/LoadingState"
import { PageHeader } from "@/components/molecules/PageHeader"
import { SectionHeading } from "@/components/molecules/SectionHeading"
import { ShareBar, type ShareBarItem } from "@/components/molecules/ShareBar"
import { StatCard } from "@/components/molecules/StatCard"
import { TrendChart } from "@/components/molecules/TrendChart"
import { CHART_OTHER, CHART_SERIES, PAYMENT_METHOD_COLORS } from "@/lib/chartPalette"
import { downloadCsv } from "@/lib/csv"
import { jumlahHari } from "@/lib/dateRange"
import { angka, labelRentang, persen, rentangBulanIni, rupiah, rupiahRingkas } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { useMounted } from "@/lib/useMounted"
import api from "@/lib/axios"

type TopInstrument = {
  instrument_id: number
  code: string | null
  name: string
  total: number
  percent: number
}

type TopRoom = {
  room_id: number
  code: string | null
  name: string
  total: number
  percent: number
}

type CssdData = {
  date_from: string
  date_to: string
  summary: {
    instrument_types: number
    sterile_ready: number
    incoming_orders: number
    currently_borrowed: number
    period_orders: number
  }
  borrow_chart: { date: string; day: number; total: number }[]
  top_instruments: TopInstrument[]
  top_rooms: TopRoom[]
}

type NafsulData = {
  date_from: string
  date_to: string
  year: number
  summary: {
    range_income: number
    range_receipts: number
    year_income: number
    month_average: number
    year_receipts: number
  }
  monthly_income: { month: number; label: string; total: number; count: number }[]
  daily_income: { date: string; day: number; label: string; total: number }[]
  validation: {
    valid: number
    invalid: number
    total: number
    valid_percent: number
    valid_amount: number
    invalid_amount: number
  }
  payment_methods: { method: string; label: string; count: number; total: number; percent: number }[]
}

type Hasil = { kunci: string; cssd: CssdData | null; nafsul: NafsulData | null }

export default function DashboardPage() {
  const t = useT()
  // `disabled` tombol ekspor bergantung pada data yang baru ada di klien.
  // Nilainya baru dipasang setelah hidrasi supaya HTML server dan render
  // pertama klien sama-sama tidak membawa atribut tersebut.
  const mounted = useMounted()

  const [rentang, setRentang] = useState(rentangBulanIni)
  // Penghitung percobaan ikut menjadi bagian kunci: menekan "Coba lagi" tanpa
  // mengubah tanggal tetap harus memicu permintaan baru, dan data lama tidak
  // boleh tampil seolah-olah sudah diperbarui.
  const [percobaan, setPercobaan] = useState(0)
  const kunci = `${rentang.from}|${rentang.to}|${percobaan}`
  const [hasil, setHasil] = useState<Hasil | null>(null)

  useEffect(() => {
    let aktif = true
    const params = { date_from: rentang.from, date_to: rentang.to }

    // Kedua modul diminta bersamaan, tetapi kegagalan salah satunya tidak
    // menjatuhkan yang lain: masing-masing `.catch` menjadi null, dan bagian
    // yang gagal menampilkan tombol coba lagi sendiri.
    Promise.all([
      api
        .get("/cssd/dashboard", { params })
        .then((r) => r.data.data as CssdData)
        .catch(() => null),
      api
        .get("/nafsul/dashboard", { params })
        .then((r) => r.data.data as NafsulData)
        .catch(() => null),
    ]).then(([cssd, nafsul]) => {
      if (aktif) setHasil({ kunci, cssd, nafsul })
    })

    return () => {
      aktif = false
    }
  }, [kunci, rentang.from, rentang.to])

  const data = hasil?.kunci === kunci ? hasil : null
  const loading = data === null
  const cssd = data?.cssd ?? null
  const nafsul = data?.nafsul ?? null
  const gagalSemua = !loading && !cssd && !nafsul

  function tampil(v: number | undefined, ada: boolean, f: (n: number) => string) {
    if (loading) return "…"
    return ada ? f(v ?? 0) : "—"
  }

  const cNum = (v?: number) => tampil(v, !!cssd, angka)
  const nNum = (v?: number) => tampil(v, !!nafsul, angka)
  const nRp = (v?: number) => tampil(v, !!nafsul, rupiah)
  const nPct = (v?: number) => tampil(v, !!nafsul, persen)

  const periode = labelRentang(rentang.from, rentang.to)
  const hari = Math.max(1, jumlahHari(rentang.from, rentang.to))
  const rataHarian = Math.round((cssd?.summary.period_orders ?? 0) / hari)
  const tahun = nafsul?.year ?? Number(rentang.from.slice(0, 4))

  const sparkOrder = (cssd?.borrow_chart ?? []).slice(-14).map((h) => h.total)
  const topInstruments = (cssd?.top_instruments ?? []).slice(0, 5)
  // `top_instruments.percent` dari backend diukur terhadap instrumen TERLARIS,
  // bukan terhadap total. Untuk kolom "Porsi" kita hitung sendiri porsi unit
  // terhadap seluruh daftar, supaya angka 100%/98,2%/98,2% tidak terbaca sebagai
  // porsi keseluruhan padahal hanya panjang batang relatif.
  const totalTopUnits = (cssd?.top_instruments ?? []).reduce((total, row) => total + row.total, 0)

  const instrumentMetrics: SpotlightMetric[] = (cssd?.top_instruments ?? [])
    .slice(0, 4)
    .map((row) => ({
      label: row.name,
      value: `${angka(row.total)} ${t("dashboardCssd.unitSuffix")}`,
      hint: row.code ?? undefined,
    }))

  // Tiga ruangan teratas + "Ruangan lain" supaya legenda tetap terbaca dalam
  // satu baris dan batangnya tidak terpecah menjadi belasan garis rambut.
  const roomItems: ShareBarItem[] = []
  if (cssd) {
    const teratas = cssd.top_rooms.slice(0, 4)
    teratas.forEach((r, i) => {
      roomItems.push({
        key: String(r.room_id),
        label: r.name,
        value: r.total,
        percent: r.percent,
        color: CHART_SERIES[i],
      })
    })

    if (cssd.top_rooms.length > teratas.length) {
      const sisa = cssd.top_rooms.slice(teratas.length)
      roomItems.push({
        key: "lainnya",
        label: t("dashboard.otherRooms"),
        value: sisa.reduce((total, r) => total + r.total, 0),
        percent: Math.max(0, 100 - teratas.reduce((total, r) => total + r.percent, 0)),
        color: CHART_OTHER,
      })
    }
  }

  // Label cara bayar berasal dari kamus, bukan dari `label` backend yang selalu
  // berbahasa Indonesia. Kalau kuncinya belum ada, label backend dipakai sebagai
  // cadangan supaya layar tidak pernah menampilkan kunci mentah.
  function caraBayar(method: string, fallback: string) {
    const key = `nafsulTransaksi.method_${method}`
    const label = t(key)
    return label === key ? fallback : label
  }

  const scoreItems = nafsul
    ? [
        {
          key: "validation",
          label: t("dashboard.validatedReceipts"),
          value: nafsul.validation.valid_percent,
          display: persen(nafsul.validation.valid_percent),
          color: "#0d8b7d",
        },
        ...nafsul.payment_methods.map((m) => ({
          key: m.method,
          label: caraBayar(m.method, m.label),
          value: m.percent,
          display: persen(m.percent),
          color: PAYMENT_METHOD_COLORS[m.method] ?? "#94a3b8",
        })),
      ]
    : []

  const kolomInstrumen: Column<TopInstrument>[] = [
    {
      header: t("dashboard.rank"),
      className: "w-12",
      cell: (_row, i) => (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#075489]/10 text-[11px] font-semibold text-[#075489]">
          {i + 1}
        </span>
      ),
    },
    {
      header: t("dashboard.instrument"),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{row.name}</p>
          {row.code && <p className="text-[11px] text-gray-400">{row.code}</p>}
        </div>
      ),
    },
    {
      header: t("dashboard.totalBorrowed"),
      className: "text-right",
      cell: (row) => (
        <span className="font-semibold tabular-nums text-gray-900">
          {angka(row.total)}{" "}
          <span className="text-xs font-normal text-gray-400">{t("dashboardCssd.unitSuffix")}</span>
        </span>
      ),
    },
    {
      header: t("dashboard.share"),
      className: "w-40",
      cell: (row) => {
        const share = totalTopUnits > 0 ? (row.total / totalTopUnits) * 100 : 0
        return (
          <div className="flex items-center gap-2">
            <MiniProgress value={share} className="flex-1" />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-500">
              {persen(share)}
            </span>
          </div>
        )
      },
    },
  ]

  const pendingOrders = cssd?.summary.incoming_orders ?? 0
  const pendingReceipts = nafsul?.validation.invalid ?? 0
  const validationTone =
    !nafsul || nafsul.validation.total === 0
      ? "default"
      : nafsul.validation.valid_percent >= 80
        ? "success"
        : "warning"
  const alertParts: string[] = []
  if (pendingOrders > 0) {
    alertParts.push(t("dashboard.alertPendingOrders", { orders: angka(pendingOrders) }))
  }
  if (pendingReceipts > 0) {
    alertParts.push(t("dashboard.alertPendingReceipts", { receipts: angka(pendingReceipts) }))
  }

  const bannerTitle = loading
    ? t("dashboard.loadingTitle")
    : alertParts.length > 0
      ? t("dashboard.alertTitle")
      : t("dashboard.alertTitleClear")
  const bannerDescription = loading
    ? t("common.loading")
    : alertParts.length > 0
      ? alertParts.join(" ")
      : t("dashboard.alertAllClear")
  // Kalau salah satu modul gagal dimuat, bilah ini disembunyikan: kalimat "semua
  // beres" tidak boleh muncul hanya karena bagian yang bermasalah tidak punya data.
  const tampilkanBanner = !gagalSemua && (loading || (!!cssd && !!nafsul))

  function muatUlang() {
    setPercobaan((n) => n + 1)
  }

  function resetRentang() {
    setRentang(rentangBulanIni())
    setPercobaan((n) => n + 1)
  }

  function ekspor() {
    if (!cssd && !nafsul) return

    const rows: (string | number)[][] = []
    const tambah = (bagian: string, metrik: string, nilai: string | number) =>
      rows.push([bagian, metrik, nilai])

    if (cssd) {
      const bagian = t("dashboard.cssdSection")
      tambah(bagian, t("dashboardCssd.statPeriodOrders"), angka(cssd.summary.period_orders))
      tambah(bagian, t("dashboardCssd.statInstrumentTypes"), angka(cssd.summary.instrument_types))
      tambah(bagian, t("dashboardCssd.statSterileReady"), angka(cssd.summary.sterile_ready))
      tambah(bagian, t("dashboardCssd.statIncoming"), angka(cssd.summary.incoming_orders))
      tambah(bagian, t("dashboardCssd.statBorrowed"), angka(cssd.summary.currently_borrowed))
      tambah(bagian, t("dashboard.avgDailyOrders"), angka(rataHarian))
      topInstruments.forEach((row, i) => {
        tambah(
          bagian,
          `${t("dashboard.rank")} ${i + 1} · ${row.name}`,
          `${angka(row.total)} ${t("dashboardCssd.unitSuffix")}`,
        )
      })
      cssd.top_rooms.forEach((row, i) => {
        tambah(
          bagian,
          `${t("dashboard.rank")} ${i + 1} · ${row.name}`,
          `${angka(row.total)} ${t("dashboardCssd.orderSuffix")} · ${persen(row.percent)}`,
        )
      })
    }

    if (nafsul) {
      const bagian = t("dashboard.nafsulSection")
      tambah(bagian, t("dashboardNafsul.statRangeIncome"), rupiah(nafsul.summary.range_income))
      tambah(bagian, t("dashboardNafsul.statYearIncome"), rupiah(nafsul.summary.year_income))
      tambah(bagian, t("dashboardNafsul.statMonthAverage"), rupiah(nafsul.summary.month_average))
      tambah(bagian, t("dashboardNafsul.statReceipts"), angka(nafsul.summary.year_receipts))
      tambah(bagian, t("dashboardNafsul.valid"), angka(nafsul.validation.valid))
      tambah(bagian, t("dashboardNafsul.invalid"), angka(nafsul.validation.invalid))
      tambah(bagian, t("dashboard.validationRate"), persen(nafsul.validation.valid_percent))
      tambah(bagian, t("dashboard.validAmount"), rupiah(nafsul.validation.valid_amount))
      tambah(bagian, t("dashboard.invalidAmount"), rupiah(nafsul.validation.invalid_amount))
      nafsul.payment_methods.forEach((m) => {
        tambah(bagian, caraBayar(m.method, m.label), `${persen(m.percent)} · ${rupiah(m.total)}`)
      })
    }

    downloadCsv(
      `dashboard-${rentang.from}-${rentang.to}.csv`,
      [t("dashboard.exportSection"), t("dashboard.exportMetric"), t("dashboard.exportValue")],
      rows,
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <DashboardFilterBar
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={resetRentang}>
              <RotateCcw className="h-4 w-4" />
              {t("common.reset")}
            </Button>
            <Button
              onClick={ekspor}
              disabled={mounted && (loading || (!cssd && !nafsul))}
              className="bg-[#075489] text-white hover:bg-[#075489]/90"
            >
              <Download className="h-4 w-4" />
              {t("dashboard.export")}
            </Button>
          </div>
        }
      >
        <DateRangeFields
          from={rentang.from}
          to={rentang.to}
          onFromChange={(v) => setRentang((r) => ({ ...r, from: v }))}
          onToChange={(v) => setRentang((r) => ({ ...r, to: v }))}
        />
      </DashboardFilterBar>

      {tampilkanBanner && (
        <InsightBanner
          title={bannerTitle}
          description={bannerDescription}
          icon={alertParts.length > 0 ? AlertTriangle : Sparkles}
          tone={alertParts.length > 0 ? "warning" : "info"}
        />
      )}

      {gagalSemua ? (
        <Card>
          <ErrorState message={t("dashboard.loadFailed")} onRetry={muatUlang} />
        </Card>
      ) : (
        <>
          <section className="space-y-4" aria-label={t("dashboard.cssdSection")}>
            <SectionHeading
              icon={Warehouse}
              title={t("dashboard.cssdSection")}
              description={t("dashboard.cssdSectionDesc")}
              action={
                <Button asChild variant="ghost" size="sm" className="text-[#075489] hover:bg-[#075489]/10">
                  <Link href="/dashboard/cssd">
                    {t("dashboard.viewDetail")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              }
            />

            {!loading && !cssd ? (
              <Card>
                <ErrorState message={t("dashboard.loadFailedCssd")} onRetry={muatUlang} />
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                  <DashboardSpotlight
                    className="xl:col-span-8"
                    title={t("dashboard.spotlightTitle")}
                    subtitle={t("dashboard.updatedAt", { period: periode })}
                    icon={Activity}
                    value={cNum(cssd?.summary.period_orders)}
                    unit={t("dashboardCssd.orderSuffix")}
                    hint={`${t("dashboardCssd.statInstrumentTypes")}: ${cNum(cssd?.summary.instrument_types)}`}
                    chart={
                      loading ? (
                        <LoadingState className="py-20" />
                      ) : (
                        <TrendChart
                          variant="line"
                          height={210}
                          data={(cssd?.borrow_chart ?? []).map((h) => ({
                            label: String(h.day),
                            value: h.total,
                          }))}
                          formatValue={(v) => `${angka(v)} ${t("dashboardCssd.orderSuffix")}`}
                          formatAxis={(v) => angka(Math.round(v))}
                          emptyLabel={t("dashboardCssd.emptyChart")}
                        />
                      )
                    }
                    metrics={instrumentMetrics}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-2">
                    <DashboardMiniStat
                      title={t("dashboard.avgDailyOrders")}
                      value={cNum(rataHarian)}
                      icon={TrendingUp}
                      hint={t("dashboard.avgDailyOrdersHint")}
                      visual={<MiniBarSparkline data={sparkOrder} />}
                    />
                    <DashboardMiniStat
                      title={t("dashboardCssd.statSterileReady")}
                      value={cNum(cssd?.summary.sterile_ready)}
                      icon={PackageCheck}
                      tone={cssd && cssd.summary.sterile_ready > 0 ? "success" : "default"}
                      hint={t("dashboardCssd.hintReady")}
                    />
                    <DashboardMiniStat
                      title={t("dashboardCssd.statIncoming")}
                      value={cNum(cssd?.summary.incoming_orders)}
                      icon={Clock}
                      tone={cssd && cssd.summary.incoming_orders > 0 ? "warning" : "default"}
                      hint={t("dashboardCssd.hintNow")}
                    />
                    <DashboardMiniStat
                      title={t("dashboardCssd.statBorrowed")}
                      value={cNum(cssd?.summary.currently_borrowed)}
                      icon={ArrowLeftRight}
                      hint={t("dashboardCssd.hintNow")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                  <ChartCard
                    className="xl:col-span-8"
                    title={t("dashboardCssd.topInstruments")}
                    subtitle={`${t("dashboardCssd.topInstrumentsSub")} · ${t("dashboard.shareListSub")}`}
                  >
                    {loading ? (
                      <LoadingState className="py-10" />
                    ) : (
                      <DataTable
                        columns={kolomInstrumen}
                        data={topInstruments}
                        hideRowNumber
                        emptyMessage={t("dashboardCssd.emptyRank")}
                      />
                    )}
                  </ChartCard>

                  <ChartCard
                    className="xl:col-span-4"
                    title={t("dashboard.roomDistribution")}
                    subtitle={t("dashboard.roomDistributionSub")}
                  >
                    {loading ? (
                      <LoadingState className="py-10" />
                    ) : (
                      <ShareBar
                        items={roomItems}
                        formatValue={(v) => `${angka(v)} ${t("dashboardCssd.orderSuffix")}`}
                        emptyLabel={t("dashboardCssd.emptyRank")}
                      />
                    )}
                  </ChartCard>
                </div>
              </>
            )}
          </section>

          <section className="space-y-4" aria-label={t("dashboard.nafsulSection")}>
            <SectionHeading
              icon={Wallet}
              title={t("dashboard.nafsulSection")}
              description={t("dashboard.nafsulSectionDesc")}
              action={
                <Button asChild variant="ghost" size="sm" className="text-[#075489] hover:bg-[#075489]/10">
                  <Link href="/dashboard/nafsul">
                    {t("dashboard.viewDetail")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              }
            />

            {!loading && !nafsul ? (
              <Card>
                <ErrorState message={t("dashboard.loadFailedNafsul")} onRetry={muatUlang} />
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    title={t("dashboardNafsul.statRangeIncome")}
                    value={nRp(nafsul?.summary.range_income)}
                    icon={Wallet}
                    hint={periode}
                  />
                  <StatCard
                    title={t("dashboardNafsul.statYearIncome")}
                    value={nRp(nafsul?.summary.year_income)}
                    icon={CalendarDays}
                    tone={nafsul && nafsul.summary.year_income > 0 ? "success" : "default"}
                    hint={`${t("dashboardNafsul.hintFromPaid")} · ${tahun}`}
                  />
                  <StatCard
                    title={t("dashboardNafsul.valid")}
                    value={nNum(nafsul?.validation.valid)}
                    icon={BadgeCheck}
                    tone={nafsul && nafsul.validation.valid > 0 ? "success" : "default"}
                    hint={`${nPct(nafsul?.validation.valid_percent)} · ${nRp(nafsul?.validation.valid_amount)}`}
                  />
                  <StatCard
                    title={t("dashboardNafsul.invalid")}
                    value={nNum(nafsul?.validation.invalid)}
                    icon={Clock}
                    tone={nafsul && nafsul.validation.invalid > 0 ? "warning" : "default"}
                    hint={nRp(nafsul?.validation.invalid_amount)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <ChartCard
                    className="lg:col-span-2"
                    title={t("dashboardNafsul.monthlyTitle")}
                    subtitle={t("dashboardNafsul.monthlySub", { year: String(tahun) })}
                    action={
                      <span className="text-xs text-gray-400">
                        {nNum(nafsul?.summary.year_receipts)} {t("dashboardNafsul.receiptSuffix")}
                      </span>
                    }
                  >
                    {loading ? (
                      <LoadingState className="py-20" />
                    ) : (
                      <TrendChart
                        variant="bar"
                        height={300}
                        data={(nafsul?.monthly_income ?? []).map((b) => ({
                          label: b.label,
                          value: b.total,
                          hint: `${angka(b.count ?? 0)} ${t("dashboardNafsul.receiptSuffix")}`,
                        }))}
                        formatValue={rupiah}
                        formatAxis={rupiahRingkas}
                        emptyLabel={t("dashboardNafsul.emptyChart")}
                      />
                    )}
                  </ChartCard>

                  {loading ? (
                    <Card className="flex items-center justify-center">
                      <LoadingState className="py-20" />
                    </Card>
                  ) : (
                    <DashboardScoreCard
                      title={t("dashboard.performanceTitle")}
                      subtitle={t("dashboard.performanceSub")}
                      icon={BadgeCheck}
                      value={nPct(nafsul?.validation.valid_percent)}
                      hint={t("dashboard.validatedReceiptsHint", {
                        valid: nNum(nafsul?.validation.valid),
                        total: nNum(nafsul?.validation.total),
                      })}
                      note={t("dashboard.scoreNote")}
                      items={scoreItems}
                      tone={validationTone}
                    />
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

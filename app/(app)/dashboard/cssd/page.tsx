"use client"

import { useEffect, useState } from "react"
import { Stethoscope, Warehouse, Hourglass, ArrowLeftRight } from "lucide-react"
import { PageHeader } from "@/components/molecules/PageHeader"
import { StatCard } from "@/components/molecules/StatCard"
import { ChartCard } from "@/components/molecules/ChartCard"
import { TrendChart } from "@/components/molecules/TrendChart"
import { RankList } from "@/components/molecules/RankList"
import { DashboardFilterBar } from "@/components/molecules/DashboardFilterBar"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Button } from "@/components/atoms/Button"
import { CHART_COLORS } from "@/lib/chartPalette"
import { angka, rentangBulanIni } from "@/lib/format"
import { useT } from "@/lib/i18n"
import api from "@/lib/axios"

type Peringkat = { code: string | null; name: string; total: number; percent: number }

type Data = {
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
  top_instruments: (Peringkat & { instrument_id: number })[]
  top_rooms: (Peringkat & { room_id: number })[]
}

export default function DashboardCssdPage() {
  const t = useT()

  const [rentang, setRentang] = useState(rentangBulanIni)

  // Hasil disimpan BERSAMA kunci periodenya, dan `loading` diturunkan dari
  // perbandingan kunci. Dengan begitu tidak ada setState di badan effect —
  // yang memicu render beruntun dan dilarang aturan react-hooks — sekaligus
  // menutup celah lama: angka periode sebelumnya tidak sempat terpampang
  // sebagai angka periode baru saat filter diganti.
  const kunci = `${rentang.from}|${rentang.to}`
  const [hasil, setHasil] = useState<{ kunci: string; isi: Data | null } | null>(null)

  useEffect(() => {
    let aktif = true
    api
      .get("/cssd/dashboard", { params: { date_from: rentang.from, date_to: rentang.to } })
      .then((r) => {
        if (aktif) setHasil({ kunci, isi: r.data.data })
      })
      .catch(() => {
        // Gagal pun kuncinya tetap ditandai selesai; kalau tidak, layar akan
        // memuat selamanya tanpa pernah memberi tahu apa pun.
        if (aktif) setHasil({ kunci, isi: null })
      })
    return () => {
      aktif = false
    }
  }, [kunci, rentang.from, rentang.to])

  const loading = hasil?.kunci !== kunci
  const data = hasil?.isi ?? null

  const n = (v: number | undefined) => (loading || !data ? "…" : angka(v ?? 0))

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboardCssd.title")} subtitle={t("dashboardCssd.subtitle")} />

      <DashboardFilterBar
        action={
          <Button variant="outline" onClick={() => setRentang(rentangBulanIni())}>
            {t("common.reset")}
          </Button>
        }
      >
        <DateRangeFields
          from={rentang.from}
          to={rentang.to}
          onFromChange={(v) => setRentang((r) => ({ ...r, from: v }))}
          onToChange={(v) => setRentang((r) => ({ ...r, to: v }))}
        />
      </DashboardFilterBar>

      {/* Dua kartu pertama = apa yang DIMILIKI, dua terakhir = apa yang sedang
          BERJALAN. Keduanya sengaja tidak ikut rentang tanggal: itu keadaan saat
          ini, dan menyaringnya per bulan akan menyembunyikan yang tertunggak. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("dashboardCssd.statInstrumentTypes")}
          value={n(data?.summary.instrument_types)}
          icon={Stethoscope}
        />
        <StatCard
          title={t("dashboardCssd.statSterileReady")}
          value={n(data?.summary.sterile_ready)}
          icon={Warehouse}
          tone="success"
          hint={t("dashboardCssd.hintReady")}
        />
        <StatCard
          title={t("dashboardCssd.statIncoming")}
          value={n(data?.summary.incoming_orders)}
          icon={Hourglass}
          tone="warning"
          hint={t("dashboardCssd.hintNow")}
        />
        <StatCard
          title={t("dashboardCssd.statBorrowed")}
          value={n(data?.summary.currently_borrowed)}
          icon={ArrowLeftRight}
          hint={t("dashboardCssd.hintNow")}
        />
      </div>

      <ChartCard
        title={t("dashboardCssd.chartTitle")}
        subtitle={t("dashboardCssd.chartSubtitle")}
        action={
          <span className="text-xs text-gray-400">
            {n(data?.summary.period_orders)} {t("dashboardCssd.orderSuffix")}
          </span>
        }
      >
        <TrendChart
          variant="bar"
          data={(data?.borrow_chart ?? []).map((h) => ({ label: String(h.day), value: h.total }))}
          formatValue={(v) => `${angka(v)} ${t("dashboardCssd.orderSuffix")}`}
          formatAxis={(v) => angka(Math.round(v))}
          emptyLabel={t("dashboardCssd.emptyChart")}
        />
      </ChartCard>

      {/* Dua peringkat berdampingan dan sama lebar — keduanya menjawab
          "siapa/apa yang paling sibuk", jadi tidak ada yang perlu lebih besar. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("dashboardCssd.topInstruments")}
          subtitle={t("dashboardCssd.topInstrumentsSub")}
        >
          <RankList
            items={(data?.top_instruments ?? []).map((a) => ({
              id: a.instrument_id,
              name: a.name,
              meta: a.code,
              value: a.total,
              percent: a.percent,
            }))}
            formatValue={(v) => `${angka(v)} ${t("dashboardCssd.unitSuffix")}`}
            emptyLabel={t("dashboardCssd.emptyRank")}
          />
        </ChartCard>

        <ChartCard title={t("dashboardCssd.topRooms")} subtitle={t("dashboardCssd.topRoomsSub")}>
          <RankList
            items={(data?.top_rooms ?? []).map((r) => ({
              id: r.room_id,
              name: r.name,
              meta: r.code,
              value: r.total,
              percent: r.percent,
            }))}
            formatValue={(v) => `${angka(v)} ${t("dashboardCssd.orderSuffix")}`}
            // Warna kedua palet, bukan warna yang sama dengan panel alat:
            // dua daftar bersebelahan yang mengukur hal berbeda (unit vs order)
            // tidak boleh terlihat seperti satu deret yang sama.
            color={CHART_COLORS[1]}
            emptyLabel={t("dashboardCssd.emptyRank")}
          />
        </ChartCard>
      </div>
    </div>
  )
}

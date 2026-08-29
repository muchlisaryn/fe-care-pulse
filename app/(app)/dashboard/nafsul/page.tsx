"use client"

import { useEffect, useState } from "react"
import { Wallet, CalendarDays, BadgeCheck, Clock } from "lucide-react"
import { PageHeader } from "@/components/molecules/PageHeader"
import { StatCard } from "@/components/molecules/StatCard"
import { ChartCard } from "@/components/molecules/ChartCard"
import { TrendChart } from "@/components/molecules/TrendChart"
import { DonutChart } from "@/components/molecules/DonutChart"
import { DashboardFilterBar } from "@/components/molecules/DashboardFilterBar"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Button } from "@/components/atoms/Button"
import { PAYMENT_METHOD_COLORS } from "@/lib/chartPalette"
import { rupiah, rupiahRingkas, angka, persen, rentangBulanIni, labelRentang } from "@/lib/format"
import { useT } from "@/lib/i18n"
import api from "@/lib/axios"

type Bulanan = { month: number; label: string; total: number; count: number }
type Harian = { date: string; day: number; label: string; total: number }
type CaraBayar = { method: string; label: string; count: number; total: number; percent: number }

type Data = {
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
  monthly_income: Bulanan[]
  daily_income: Harian[]
  validation: {
    valid: number
    invalid: number
    total: number
    valid_percent: number
    valid_amount: number
    invalid_amount: number
  }
  payment_methods: CaraBayar[]
}

export default function DashboardNafsulPage() {
  const t = useT()

  const [rentang, setRentang] = useState(rentangBulanIni)

  // Hasil disimpan BERSAMA kunci periodenya, dan `loading` diturunkan dari
  // perbandingan kunci. Dengan begitu tidak ada setState di badan effect —
  // yang memicu render beruntun dan dilarang aturan react-hooks — sekaligus
  // menutup celah lama: angka periode sebelumnya tidak sempat terpampang
  // sebagai angka periode baru saat rentangnya diganti.
  const kunci = `${rentang.from}|${rentang.to}`
  const [hasil, setHasil] = useState<{ kunci: string; isi: Data | null } | null>(null)

  useEffect(() => {
    let aktif = true
    api
      .get("/nafsul/dashboard", { params: { date_from: rentang.from, date_to: rentang.to } })
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

  const n = (v: number | undefined, f: (x: number) => string) => (loading || !data ? "…" : f(v ?? 0))

  const periode = labelRentang(rentang.from, rentang.to)
  const tahun = data?.year ?? new Date(rentang.from).getFullYear()
  const tunai = data?.payment_methods.find((m) => m.method === "cash")

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboardNafsul.title")} subtitle={t("dashboardNafsul.subtitle")} />

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

      {/* Baris angka: dua kartu uang, dua kartu keadaan kuitansi. Empat kolom di
          layar lebar, dua di tablet, menumpuk di ponsel. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("dashboardNafsul.statRangeIncome")}
          value={n(data?.summary.range_income, rupiah)}
          icon={Wallet}
          hint={periode}
        />
        <StatCard
          title={t("dashboardNafsul.statYearIncome")}
          value={n(data?.summary.year_income, rupiah)}
          icon={CalendarDays}
          tone="success"
          hint={`${t("dashboardNafsul.hintFromPaid")} · ${tahun}`}
        />
        <StatCard
          title={t("dashboardNafsul.valid")}
          value={n(data?.validation.valid, angka)}
          icon={BadgeCheck}
          tone="success"
          hint={`${persen(data?.validation.valid_percent ?? 0)} · ${n(data?.validation.valid_amount, rupiah)}`}
        />
        <StatCard
          title={t("dashboardNafsul.invalid")}
          value={n(data?.validation.invalid, angka)}
          // Kuning, bukan merah: kuitansi yang belum divalidasi itu pekerjaan
          // yang menunggu, bukan kesalahan.
          icon={Clock}
          tone="warning"
          hint={n(data?.validation.invalid_amount, rupiah)}
        />
      </div>

      {/* Pendapatan bulanan sepanjang tahun — batang, karena bulan adalah periode
          diskret yang dibandingkan satu sama lain. Sengaja SETAHUN penuh, bukan
          dipotong rentang: dipotong, ia menyusut jadi satu batang tunggal yang
          tidak menjawab apa pun. Tahunnya sendiri mengikuti tanggal awal rentang. */}
      <ChartCard
        title={t("dashboardNafsul.monthlyTitle")}
        subtitle={t("dashboardNafsul.monthlySub", { year: String(tahun) })}
        action={
          <span className="text-xs text-gray-400">
            {n(data?.summary.year_receipts, angka)} {t("dashboardNafsul.receiptSuffix")}
          </span>
        }
      >
        <TrendChart
          variant="bar"
          data={(data?.monthly_income ?? []).map((b) => ({
            label: b.label,
            value: b.total,
            hint: `${angka(b.count ?? 0)} ${t("dashboardNafsul.receiptSuffix")}`,
          }))}
          formatValue={rupiah}
          formatAxis={rupiahRingkas}
          emptyLabel={t("dashboardNafsul.emptyChart")}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Harian pakai GARIS, bukan batang: titiknya berdekatan dan dibaca
            sebagai alur naik-turun, sedangkan batang setipis itu hanya jadi pagar. */}
        <ChartCard
          className="lg:col-span-2"
          title={t("dashboardNafsul.dailyTitle")}
          subtitle={t("dashboardNafsul.dailySub", { period: periode })}
          action={
            <span className="text-xs text-gray-400">
              {n(data?.summary.range_receipts, angka)} {t("dashboardNafsul.receiptSuffix")}
            </span>
          }
        >
          <TrendChart
            variant="line"
            // Lebih tinggi dari bawaan 260 supaya kartunya setinggi panel Cara
            // Bayar di sebelahnya — cincin plus tiga baris legenda memang lebih
            // jangkung, dan grafik setinggi bawaan menyisakan pita kosong yang
            // membuat barisnya terlihat berat sebelah.
            height={340}
            data={(data?.daily_income ?? []).map((h) => ({
              label: h.label,
              value: h.total,
            }))}
            formatValue={rupiah}
            formatAxis={rupiahRingkas}
            emptyLabel={t("dashboardNafsul.emptyChart")}
          />
        </ChartCard>

        <ChartCard
          title={t("dashboardNafsul.paymentTitle")}
          subtitle={t("dashboardNafsul.paymentSub", { period: periode })}
        >
          <DonutChart
            // Angka tengah cincin = porsi TUNAI. Itu pertanyaan yang paling
            // sering diajukan atas panel ini, jadi ia yang dipajang, bukan total.
            centerValue={persen(tunai?.percent ?? 0)}
            centerLabel={t("dashboardNafsul.cashShare")}
            data={(data?.payment_methods ?? []).map((m) => ({
              key: m.method,
              label: m.label,
              value: m.total,
              percent: m.percent,
              color: PAYMENT_METHOD_COLORS[m.method] ?? "#94a3b8",
            }))}
            formatValue={rupiah}
            emptyLabel={t("dashboardNafsul.emptyChart")}
          />
        </ChartCard>
      </div>
    </div>
  )
}

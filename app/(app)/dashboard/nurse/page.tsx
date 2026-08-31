"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, ArrowLeftRight, PackageOpen, AlarmClock } from "lucide-react"
import { PageHeader } from "@/components/molecules/PageHeader"
import { StatCard } from "@/components/molecules/StatCard"
import { ChartCard } from "@/components/molecules/ChartCard"
import { StackedBarChart } from "@/components/molecules/StackedBarChart"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { DashboardFilterBar } from "@/components/molecules/DashboardFilterBar"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { angka, rentangBulanIni } from "@/lib/format"
import { useT } from "@/lib/i18n"
import api from "@/lib/axios"

/** Tanda tangan t() — dibutuhkan oleh pembantu di luar komponen. */
type Translate = (key: string, vars?: Record<string, string | number>) => string

/** Kunci seri penampung ruangan di luar peringkat atas — sepadan dengan backend. */
const KUNCI_LAINNYA = "lainnya"

type Pinjaman = {
  id: number
  code: string
  room: string | null
  borrowed_by: string | null
  order_date: string | null
  return_plan_date: string | null
  /** Jumlah gabungan: set paket + unit satuan (lihat catatan `jumlahRingkas`). */
  total_items: number
  total_sets: number
  total_units: number
  unreturned_items: number
  unreturned_sets: number
  unreturned_units: number
  is_overdue: boolean
}

type SeriRuangan = { key: string; name: string; total: number }
type TitikRuangan = { date: string; day: number; total: number; values: Record<string, number> }

type Data = {
  date_from: string
  date_to: string
  summary: {
    period_orders: number
    period_items: number
    currently_borrowed: number
    not_returned: number
    not_returned_sets: number
    not_returned_units: number
    overdue: number
  }
  room_chart: { rooms: SeriRuangan[]; points: TitikRuangan[] }
  open_loans: Pinjaman[]
}

/** Nilai kosong tidak boleh tampil sebagai sel kosong — lihat aturan komponen. */
const kosong = <span className="text-xs text-gray-400">—</span>

/**
 * Rincian "berapa set paket & berapa unit satuan" — mis. "2 set paket · 3 unit
 * satuan".
 *
 * Angka gabungannya sendiri tidak cukup: "5" bisa berarti lima bungkus paket
 * yang harus diambil satu per satu atau lima gunting lepas dalam satu nampan,
 * dan tindak lanjutnya berbeda. Bagian yang bernilai nol dilewati supaya barisnya
 * tidak jadi "0 set paket · 5 unit satuan".
 */
function jumlahRingkas(sets: number, units: number, t: Translate): string | null {
  const bagian: string[] = []
  if (sets > 0) bagian.push(t("dashboardNurse.packageSets", { n: angka(sets) }))
  if (units > 0) bagian.push(t("dashboardNurse.singleUnits", { n: angka(units) }))
  return bagian.length > 0 ? bagian.join(" · ") : null
}

export default function DashboardNursePage() {
  const t = useT()

  const [rentang, setRentang] = useState(rentangBulanIni)

  // Hasil disimpan bersama kunci periodenya, `loading` diturunkan dari
  // perbandingan kunci — alasannya sama dengan Dashboard CSSD.
  const kunci = `${rentang.from}|${rentang.to}`
  const [hasil, setHasil] = useState<{ kunci: string; isi: Data | null } | null>(null)

  useEffect(() => {
    let aktif = true
    api
      .get("/nurse/dashboard", { params: { date_from: rentang.from, date_to: rentang.to } })
      .then((r) => {
        if (aktif) setHasil({ kunci, isi: r.data.data })
      })
      .catch(() => {
        if (aktif) setHasil({ kunci, isi: null })
      })
    return () => {
      aktif = false
    }
  }, [kunci, rentang.from, rentang.to])

  const loading = hasil?.kunci !== kunci
  const data = hasil?.isi ?? null

  const n = (v: number | undefined) => (loading || !data ? "…" : angka(v ?? 0))

  // Nama seri "Lainnya" diterjemahkan di sini, bukan dikirim jadi dari backend:
  // ia satu-satunya seri yang BUKAN nama dari database, jadi ia harus ikut
  // berganti saat tombol bahasa ditekan.
  const seriRuangan = useMemo(
    () =>
      (data?.room_chart.rooms ?? []).map((r) => ({
        key: r.key,
        name: r.key === KUNCI_LAINNYA ? t("dashboardNurse.otherRooms") : r.name,
      })),
    [data, t],
  )

  const titikRuangan = useMemo(
    () =>
      (data?.room_chart.points ?? []).map((p) => ({
        label: String(p.day),
        title: p.date,
        values: p.values,
      })),
    [data],
  )

  const kolom: Column<Pinjaman>[] = [
    {
      header: t("dashboardNurse.colOrder"),
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{r.code}</span>
          {/* Keterlambatan ditandai lencana bertulisan, bukan baris merah saja:
              warna sendirian tidak terbaca oleh semua orang. */}
          {r.is_overdue && <Badge variant="danger">{t("dashboardNurse.overdueBadge")}</Badge>}
        </span>
      ),
    },
    { header: t("dashboardNurse.colRoom"), cell: (r) => r.room || kosong },
    { header: t("dashboardNurse.colDate"), cell: (r) => r.order_date || kosong },
    { header: t("dashboardNurse.colPlan"), cell: (r) => r.return_plan_date || kosong },
    {
      header: t("dashboardNurse.colItems"),
      cell: (r) => {
        // "belum kembali / total" — satu angka saja akan menyembunyikan
        // pengembalian yang baru sebagian. Keduanya dihitung dengan satuan yang
        // sama dengan kartu di atas: satu paket = satu set, bukan sekian instrumen.
        const rincian = jumlahRingkas(r.unreturned_sets, r.unreturned_units, t)
        return (
          <span className="block">
            <span className="tabular-nums text-gray-700">
              {angka(r.unreturned_items)}
              <span className="text-gray-400"> / {angka(r.total_items)}</span>
            </span>
            {rincian && <span className="block text-[11px] text-gray-400">{rincian}</span>}
          </span>
        )
      },
    },
  ]

  const rincianBelum = data
    ? jumlahRingkas(data.summary.not_returned_sets, data.summary.not_returned_units, t)
    : null

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboardNurse.title")} subtitle={t("dashboardNurse.subtitle")} />

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

      {/* Kartu pertama mengikuti rentang tanggal; tiga sisanya adalah keadaan
          SAAT INI — dibedakan lewat keterangan kecil di bawah angkanya. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("dashboardNurse.statPeriodOrders")}
          value={n(data?.summary.period_orders)}
          icon={ClipboardList}
          hint={`${n(data?.summary.period_items)} ${t("dashboardNurse.hintItems")}`}
        />
        <StatCard
          title={t("dashboardNurse.statBorrowed")}
          value={n(data?.summary.currently_borrowed)}
          icon={ArrowLeftRight}
          hint={t("dashboardNurse.hintNow")}
        />
        <StatCard
          title={t("dashboardNurse.statNotReturned")}
          value={n(data?.summary.not_returned)}
          icon={PackageOpen}
          tone="warning"
          // Rinciannya menggantikan keterangan umum begitu ada isinya: "3 set
          // paket · 1 unit satuan" jauh lebih berguna daripada "masih di ruangan".
          hint={loading ? t("dashboardNurse.hintNotReturned") : (rincianBelum ?? t("dashboardNurse.hintNotReturned"))}
        />
        <StatCard
          title={t("dashboardNurse.statOverdue")}
          value={n(data?.summary.overdue)}
          icon={AlarmClock}
          // Merah hanya di kartu ini: satu-satunya angka yang benar-benar
          // menuntut tindakan hari ini.
          tone="danger"
          hint={t("dashboardNurse.hintOverdue")}
        />
      </div>

      <ChartCard
        title={t("dashboardNurse.chartTitle")}
        subtitle={t("dashboardNurse.chartSubtitle")}
        action={
          <span className="text-xs text-gray-400">
            {n(data?.summary.period_orders)} {t("common.total")}
          </span>
        }
      >
        <StackedBarChart
          series={seriRuangan}
          data={titikRuangan}
          otherKey={KUNCI_LAINNYA}
          formatValue={(v) => angka(v)}
          formatAxis={(v) => angka(Math.round(v))}
          totalLabel={t("dashboardNurse.chartUnit")}
          emptyLabel={t("dashboardCssd.emptyChart")}
        />
      </ChartCard>

      <ChartCard title={t("dashboardNurse.openLoans")} subtitle={t("dashboardNurse.openLoansSub")}>
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : (
          <DataTable
            columns={kolom}
            data={data?.open_loans ?? []}
            hideRowNumber
            emptyMessage={t("dashboardNurse.emptyLoans")}
          />
        )}
      </ChartCard>
    </div>
  )
}

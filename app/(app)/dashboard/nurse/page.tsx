"use client"

import { useEffect, useState } from "react"
import { ClipboardList, ArrowLeftRight, PackageOpen, AlarmClock } from "lucide-react"
import { PageHeader } from "@/components/molecules/PageHeader"
import { StatCard } from "@/components/molecules/StatCard"
import { ChartCard } from "@/components/molecules/ChartCard"
import { TrendChart } from "@/components/molecules/TrendChart"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { DashboardFilterBar } from "@/components/molecules/DashboardFilterBar"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { angka, rentangBulanIni } from "@/lib/format"
import { useT } from "@/lib/i18n"
import api from "@/lib/axios"

type Pinjaman = {
  id: number
  code: string
  room: string | null
  borrowed_by: string | null
  order_date: string | null
  return_plan_date: string | null
  total_items: number
  unreturned_items: number
  is_overdue: boolean
}

type Data = {
  date_from: string
  date_to: string
  summary: {
    period_orders: number
    period_items: number
    currently_borrowed: number
    not_returned: number
    overdue: number
  }
  borrow_chart: { date: string; day: number; total: number }[]
  open_loans: Pinjaman[]
}

/** Nilai kosong tidak boleh tampil sebagai sel kosong — lihat aturan komponen. */
const kosong = <span className="text-xs text-gray-400">—</span>

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
      cell: (r) => (
        // "belum kembali / total" — satu angka saja akan menyembunyikan
        // pengembalian yang baru sebagian.
        <span className="tabular-nums text-gray-700">
          {angka(r.unreturned_items)}
          <span className="text-gray-400"> / {angka(r.total_items)}</span>
        </span>
      ),
    },
  ]

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
          hint={t("dashboardNurse.hintNotReturned")}
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
        <TrendChart
          variant="bar"
          data={(data?.borrow_chart ?? []).map((h) => ({ label: String(h.day), value: h.total }))}
          formatValue={(v) => angka(v)}
          formatAxis={(v) => angka(Math.round(v))}
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

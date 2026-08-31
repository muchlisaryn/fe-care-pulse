"use client"

import { useEffect, useState } from "react"
import { Warehouse, Activity, Wallet } from "lucide-react"
import { NavTileCard } from "@/components/molecules/NavTileCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DashboardPreviewModal, type DashboardPreview } from "@/components/molecules/DashboardPreviewModal"
import { useAppSelector } from "@/lib/store/hooks"
import { angka, rupiah, rupiahRingkas, persen } from "@/lib/format"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"

type OrderCounts = { diajukan: number; dipinjam: number }

/** Dashboard mana yang sedang diintip lewat modal. */
type Intip = "cssd" | "nurse" | "nafsul" | null

export default function DashboardPage() {
  const name = useAppSelector((s) => s.auth.name)
  const t = useT()

  const [orders, setOrders] = useState<OrderCounts>({ diajukan: 0, dipinjam: 0 })
  const [loading, setLoading] = useState(true)
  const [intip, setIntip] = useState<Intip>(null)

  // Hanya dua angka yang masih diambil di sini: jumlah order masuk & sedang
  // dipinjam, yang dipajang di kartu peran. Statistik inventaris tidak lagi
  // ditarik — angkanya sudah ada di Dashboard CSSD, dan menariknya dua kali
  // hanya membuat dua layar bisa menyebut angka berbeda.
  useEffect(() => {
    let active = true
    Promise.all([
      api.get("/master/orders", { params: { status: "diajukan" } }),
      api.get("/master/orders", { params: { status: "dipinjam" } }),
    ])
      .then(([a, c]) => {
        if (!active) return
        setOrders({ diajukan: a.data.data.total, dipinjam: c.data.data.total })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const v = (n: number) => (loading ? "…" : angka(n))

  return (
    <div className="space-y-6">
      <PageHeader
        title={name ? t("dashboard.welcomeNamed", { name }) : t("dashboard.welcome")}
        subtitle={t("dashboard.subtitle")}
      />

      {/* Kartu peran MENGINTIP isinya lewat modal, bukan langsung berpindah:
          sebagian besar kunjungan cuma ingin tahu angkanya, dan modal
          mengembalikan pengguna ke sini tanpa perlu menekan tombol kembali.
          Halaman lengkap tiap dashboard dibuka lewat menunya di sidebar. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("dashboard.roleDashboards")}</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <NavTileCard
            onClick={() => setIntip("cssd")}
            icon={Warehouse}
            title={t("dashboardCssd.title")}
            description={t("dashboardCssd.subtitle")}
            value={v(orders.diajukan)}
            tone="warning"
          />
          <NavTileCard
            onClick={() => setIntip("nurse")}
            icon={Activity}
            title={t("dashboardNurse.title")}
            description={t("dashboardNurse.subtitle")}
            value={v(orders.dipinjam)}
          />
          <NavTileCard
            onClick={() => setIntip("nafsul")}
            icon={Wallet}
            title={t("dashboardNafsul.title")}
            description={t("dashboardNafsul.subtitle")}
            tone="success"
          />
        </div>
      </div>

      <DashboardPreviewModal
        open={intip === "cssd"}
        onClose={() => setIntip(null)}
        title={t("dashboardCssd.title")}
        endpoint="/cssd/dashboard"
        map={(d) => {
          const x = d as {
            summary: {
              instrument_types: number
              sterile_ready: number
              incoming_orders: number
              currently_borrowed: number
            }
            borrow_chart: { day: number; total: number }[]
          }
          return {
            stats: [
              { label: t("dashboardCssd.statInstrumentTypes"), value: angka(x.summary.instrument_types) },
              { label: t("dashboardCssd.statSterileReady"), value: angka(x.summary.sterile_ready) },
              { label: t("dashboardCssd.statIncoming"), value: angka(x.summary.incoming_orders) },
              { label: t("dashboardCssd.statBorrowed"), value: angka(x.summary.currently_borrowed) },
            ],
            chart: {
              title: t("dashboardCssd.chartTitle"),
              variant: "bar",
              data: x.borrow_chart.map((h) => ({ label: String(h.day), value: h.total })),
              formatValue: (n) => `${angka(n)} ${t("dashboardCssd.orderSuffix")}`,
              formatAxis: (n) => angka(Math.round(n)),
              emptyLabel: t("dashboardCssd.emptyChart"),
            },
          } satisfies DashboardPreview
        }}
      />

      <DashboardPreviewModal
        open={intip === "nurse"}
        onClose={() => setIntip(null)}
        title={t("dashboardNurse.title")}
        endpoint="/nurse/dashboard"
        map={(d) => {
          const x = d as {
            summary: {
              period_orders: number
              currently_borrowed: number
              not_returned: number
              overdue: number
            }
            room_chart: {
              rooms: { key: string; name: string }[]
              points: { day: number; values: Record<string, number> }[]
            }
          }
          return {
            stats: [
              { label: t("dashboardNurse.statPeriodOrders"), value: angka(x.summary.period_orders) },
              { label: t("dashboardNurse.statBorrowed"), value: angka(x.summary.currently_borrowed) },
              { label: t("dashboardNurse.statNotReturned"), value: angka(x.summary.not_returned) },
              { label: t("dashboardNurse.statOverdue"), value: angka(x.summary.overdue) },
            ],
            chart: {
              kind: "stacked",
              title: t("dashboardNurse.chartTitle"),
              // Nama seri "Lainnya" diterjemahkan di sini — ia satu-satunya seri
              // yang bukan nama dari database.
              series: x.room_chart.rooms.map((r) => ({
                key: r.key,
                name: r.key === "lainnya" ? t("dashboardNurse.otherRooms") : r.name,
              })),
              data: x.room_chart.points.map((h) => ({ label: String(h.day), values: h.values })),
              otherKey: "lainnya",
              totalLabel: t("dashboardNurse.chartUnit"),
              formatValue: (n) => angka(n),
              formatAxis: (n) => angka(Math.round(n)),
              emptyLabel: t("dashboardCssd.emptyChart"),
            },
          } satisfies DashboardPreview
        }}
      />

      <DashboardPreviewModal
        open={intip === "nafsul"}
        onClose={() => setIntip(null)}
        title={t("dashboardNafsul.title")}
        endpoint="/nafsul/dashboard"
        map={(d) => {
          const x = d as {
            year: number
            summary: { year_income: number; month_income: number }
            validation: { valid: number; invalid: number }
            monthly_income: { label: string; total: number }[]
            payment_methods: { method: string; percent: number }[]
          }
          const tunai = x.payment_methods.find((m) => m.method === "cash")
          return {
            stats: [
              { label: t("dashboardNafsul.statYearIncome"), value: rupiah(x.summary.year_income) },
              { label: t("dashboardNafsul.statMonthIncome"), value: rupiah(x.summary.month_income) },
              { label: t("dashboardNafsul.valid"), value: angka(x.validation.valid) },
              {
                label: t("dashboardNafsul.paymentTitle"),
                value: persen(tunai?.percent ?? 0),
                hint: t("dashboardNafsul.cashShare"),
              },
            ],
            chart: {
              title: t("dashboardNafsul.monthlyTitle"),
              variant: "bar",
              data: x.monthly_income.map((b) => ({ label: b.label, value: b.total })),
              formatValue: rupiah,
              formatAxis: rupiahRingkas,
              emptyLabel: t("dashboardNafsul.emptyChart"),
            },
          } satisfies DashboardPreview
        }}
      />
    </div>
  )
}

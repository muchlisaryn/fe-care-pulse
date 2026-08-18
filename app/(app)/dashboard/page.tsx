"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Stethoscope, Layers, PackageCheck, ArrowLeftRight, Hourglass, PackageOpen } from "lucide-react"
import { StatCard } from "@/components/molecules/StatCard"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { useAppSelector } from "@/lib/store/hooks"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"

type Stats = { total_instruments: number; total_units: number; available_units: number }
type OrderCounts = { diajukan: number; dipinjam: number }

export default function DashboardPage() {
  const name = useAppSelector((s) => s.auth.name)
  const t = useT()

  const [stats, setStats] = useState<Stats>({ total_instruments: 0, total_units: 0, available_units: 0 })
  const [orders, setOrders] = useState<OrderCounts>({ diajukan: 0, dipinjam: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      api.get("/master/instruments/stats"),
      api.get("/master/orders", { params: { status: "diajukan" } }),
      api.get("/master/orders", { params: { status: "dipinjam" } }),
    ])
      .then(([s, a, c]) => {
        if (!active) return
        setStats(s.data.data)
        setOrders({
          diajukan: a.data.data.total,
          dipinjam: c.data.data.total,
        })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const v = (n: number) => (loading ? "…" : String(n))

  return (
    <div className="space-y-6">
      <PageHeader
        title={name ? t("dashboard.welcomeNamed", { name }) : t("dashboard.welcome")}
        subtitle={t("dashboard.subtitle")}
      />

      {/* Statistik inventaris */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("dashboard.statInstrumentTypes")} value={v(stats.total_instruments)} icon={Stethoscope} />
        <StatCard title={t("dashboard.statTotalUnits")} value={v(stats.total_units)} icon={Layers} />
        <StatCard title={t("dashboard.statAvailableUnits")} value={v(stats.available_units)} icon={PackageCheck} />
        <StatCard title={t("dashboard.statBorrowed")} value={v(orders.dipinjam)} icon={ArrowLeftRight} />
      </div>

      {/* Order yang perlu ditindak */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("dashboard.borrowOrders")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ActionCard
            href="/cssd/tracking-order"
            icon={Hourglass}
            label={t("dashboard.incomingOrders")}
            value={v(orders.diajukan)}
            tone="amber"
          />
          <ActionCard
            href="/cssd/tracking-order"
            icon={PackageOpen}
            label={t("dashboard.statBorrowed")}
            value={v(orders.dipinjam)}
            tone="teal"
          />
        </div>
      </div>
    </div>
  )
}

const toneMap = {
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-[#075489]/8 text-[#075489]",
  teal: "bg-[#4ba69d]/10 text-[#4ba69d]",
}

function ActionCard({
  href,
  icon: Icon,
  label,
  value,
  tone,
}: {
  href: string
  icon: typeof Hourglass
  label: string
  value: string
  tone: keyof typeof toneMap
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition-all hover:border-[#075489]/40 hover:shadow-md">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneMap[tone]}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
          </div>
        </div>
      </Card>
    </Link>
  )
}

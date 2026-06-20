"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Clock, Package } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"
import type { Sterilization } from "@/lib/store/slices/sterilizationSlice"

const ITEMS_PER_PAGE = 20

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Sisa hari menuju kedaluwarsa (negatif = sudah lewat).
function daysLeft(expiry: string | null): number | null {
  if (!expiry) return null
  const d = new Date(expiry)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - startOfToday()) / 86_400_000)
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default function KedaluwarsaPage() {
  const [items, setItems] = useState<Sterilization[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [daysInput, setDaysInput] = useState("7")
  const [page, setPage] = useState(1)

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      try {
        const res = await api.get("/master/sterilizations/expiring", { params: { days } })
        if (active) setItems(res.data.data.data)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [days])

  function applyDays(e: React.FormEvent) {
    e.preventDefault()
    const n = Math.max(0, Number(daysInput) || 0)
    setDays(n)
    setPage(1)
  }

  const overdue = useMemo(() => items.filter((s) => (daysLeft(s.expiry_date) ?? 0) < 0), [items])
  const soon = useMemo(() => items.filter((s) => (daysLeft(s.expiry_date) ?? 0) >= 0), [items])

  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE)
  const paged = items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const columns: Column<Sterilization>[] = [
    {
      header: "Kode Batch",
      cell: (s) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {s.code}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Mesin",
      cell: (s) => <span className="text-gray-700">{s.machine}</span>,
    },
    {
      header: "Jumlah Unit",
      cell: (s) => (
        <span className="font-semibold text-gray-900">
          {s.items_count ?? s.items?.length ?? 0} <span className="text-xs font-normal text-gray-400">unit</span>
        </span>
      ),
      className: "w-24",
    },
    {
      header: "Kedaluwarsa",
      cell: (s) => <span className="text-sm text-gray-600">{formatDate(s.expiry_date)}</span>,
    },
    {
      header: "Sisa",
      cell: (s) => {
        const d = daysLeft(s.expiry_date)
        if (d === null) return <span className="text-gray-400 text-xs">—</span>
        return d < 0 ? (
          <Badge variant="danger">Lewat {Math.abs(d)} hari</Badge>
        ) : d === 0 ? (
          <Badge variant="danger">Hari ini</Badge>
        ) : (
          <Badge variant="warning">{d} hari lagi</Badge>
        )
      },
      className: "w-32",
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alat Kedaluwarsa"
        subtitle="Batch steril yang masa sterilnya sudah atau akan habis"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total Batch" value={`${items.length}`} icon={Package} />
        <StatCard title="Sudah Lewat" value={`${overdue.length}`} icon={AlertTriangle} positive={false} />
        <StatCard title="Akan Kedaluwarsa" value={`${soon.length}`} icon={Clock} />
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={applyDays} className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Ambang (hari ke depan)
              </label>
              <Input
                type="number"
                min={0}
                value={daysInput}
                onChange={(e) => setDaysInput(e.target.value)}
                className="w-32"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              Terapkan
            </Button>
            <p className="ml-2 pb-2 text-xs text-gray-400">
              Menampilkan batch yang kedaluwarsa ≤ {days} hari ke depan (termasuk yang sudah lewat).
            </p>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <DataTable columns={columns} data={paged} emptyMessage="Tidak ada batch yang mendekati kedaluwarsa." />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={items.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setPage}
        />
      </Card>
    </div>
  )
}

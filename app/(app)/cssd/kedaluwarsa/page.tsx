"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Boxes, CalendarClock, Clock, MapPin, Search } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Pagination } from "@/components/molecules/Pagination"
import { ExpiryCard } from "@/components/molecules/ExpiryCard"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchSterileExpiry,
  fetchSterileExpirySummary,
  type SterileExpiryBatch,
} from "@/lib/store/slices/sterileExpirySlice"

const ITEMS_PER_PAGE = 20

export default function KedaluwarsaPage() {
  const dispatch = useAppDispatch()
  const { items, page, lastPage, total, loading, summary } = useAppSelector((s) => s.sterileExpiry)

  // Ambang hari & kata kunci yang SUDAH dikirim ke server; `*Input` adalah draft
  // di kotak isian (baru dipakai saat tombol ditekan / form disubmit).
  const [days, setDays] = useState(7)
  const [daysInput, setDaysInput] = useState("7")
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")

  // Penyaringan & penomoran halaman seluruhnya di server — halaman ini tidak
  // pernah menghitung ulang di klien supaya angkanya tidak beda dengan Storage Steril.
  useEffect(() => {
    dispatch(fetchSterileExpiry({ page: 1, search, days }))
    dispatch(fetchSterileExpirySummary({ days }))
  }, [dispatch, search, days])

  function applyDays(e: React.FormEvent) {
    e.preventDefault()
    setDays(Math.max(0, Number(daysInput) || 0))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
  }

  function changePage(next: number) {
    dispatch(fetchSterileExpiry({ page: next, search, days }))
  }

  const columns: Column<SterileExpiryBatch>[] = [
    {
      header: "Batch Code",
      cell: (b) =>
        b.code ? (
          <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
            {b.code}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
      className: "w-28",
    },
    {
      header: "Machine",
      cell: (b) =>
        b.machine ? (
          <span className="text-gray-700">{b.machine}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      header: "Rack",
      cell: (b) =>
        b.racks.length ? (
          <span className="flex flex-wrap gap-1">
            {b.racks.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
              >
                <MapPin className="h-3 w-3" />
                {r}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      /**
       * Jumlah unit memakai aturan yang sama dengan Storage Steril: satu SET dihitung
       * 1 (bukan per instrumen di dalamnya) dan satu instrumen satuan dihitung 1.
       * Rinciannya ("2 set · 3 satuan") ditulis di bawah angkanya.
       */
      header: "Unit Count",
      cell: (b) => (
        <div className="leading-tight">
          <span className="font-semibold text-gray-900">
            {b.item_count} <span className="text-xs font-normal text-gray-400">units</span>
          </span>
          <div className="mt-0.5 text-xs text-gray-400">
            {[b.set_count > 0 ? `${b.set_count} sets` : null, b.unit_count > 0 ? `${b.unit_count} singles` : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
        </div>
      ),
      className: "w-32",
    },
    {
      header: "Expiry",
      cell: (b) => (
        <ExpiryCard
          date={b.expiry_date}
          daysToExpiry={b.days_to_expiry}
          expired={b.expired}
          alert={b.alert}
         
        />
      ),
    },
    {
      header: "Remaining",
      cell: (b) => {
        if (b.days_to_expiry === null) return <span className="text-gray-400 text-xs">—</span>
        return b.days_to_expiry < 0 ? (
          <Badge variant="danger">{Math.abs(b.days_to_expiry)} days overdue</Badge>
        ) : b.days_to_expiry === 0 ? (
          <Badge variant="danger">Today</Badge>
        ) : (
          <Badge variant="warning">{b.days_to_expiry} days left</Badge>
        )
      },
      className: "w-32",
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sterile Expiry"
        subtitle="Sterile batches in storage whose sterile period has expired or is about to"
      />

      {/* Angka dari server (seluruh data), bukan dari baris halaman yang sedang tampil.
          Instrumen dihitung dengan aturan set = 1 & satuan = 1, sama dengan Storage Steril. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Batches" value={`${summary.batches}`} icon={Boxes} />
        <StatCard title="Total Units" value={`${summary.items}`} icon={CalendarClock} />
        <StatCard title="Already Expired" value={`${summary.expired}`} icon={AlertTriangle} positive={false} />
        <StatCard title="Expiring Soon" value={`${summary.alert}`} icon={Clock} positive={false} />
      </div>

      <Card className="p-0">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <form onSubmit={handleSearch} className="flex w-full gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search batch code, machine, instrument, rack, or label number..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              Search
            </Button>
          </form>

          <form onSubmit={applyDays} className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Threshold (days ahead)
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={daysInput}
                onChange={(e) => setDaysInput(e.target.value)}
                className="w-28"
              />
              <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white">
                Apply
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Showing batches expiring within {days} days (including those already past).
            </p>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading data...</div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            emptyMessage="No batch is approaching expiry."
            rowNumberOffset={(page - 1) * ITEMS_PER_PAGE}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={lastPage}
          totalItems={total}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={changePage}
          labels={{ showing: "Showing", of: "of", items: "items" }}
        />
      </Card>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RotateCcw, Search, ChevronRight, ChevronDown, Boxes, Package } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"

// Detail per aset (unit) di dalam satu grup.
type ReportUnit = {
  id: number
  name: string | null
  unit_code: string | null
  condition: string | null
  result: string | null
}

// Satu baris laporan: paket (gabungan beberapa unit, bisa di-expand) atau satuan (1 unit).
type ReportGroup = {
  key: string
  type: "paket" | "satuan"
  name: string | null
  unit_code: string | null
  condition: string | null
  batch_code: string | null
  status: string | null
  method: string | null
  machine: string | null
  operator: string | null
  sterilized_at: string | null
  expiry_date: string | null
  qty: number
  units: ReportUnit[]
}

const STATUS_OPTIONS = [
  { value: "diproses", label: "Diproses" },
  { value: "selesai", label: "Selesai" },
  { value: "gagal", label: "Gagal" },
]

const METHOD_OPTIONS = [
  { value: "uap", label: "Uap (Steam)" },
  { value: "eo", label: "Ethylene Oxide" },
  { value: "plasma", label: "Plasma" },
  { value: "panas_kering", label: "Panas Kering" },
]

const statusLabel: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]))
const methodLabel: Record<string, string> = Object.fromEntries(METHOD_OPTIONS.map((o) => [o.value, o.label]))
const statusVariant: Record<string, "success" | "warning" | "danger" | "default"> = {
  selesai: "success",
  diproses: "warning",
  gagal: "danger",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default function LaporanPerAlatPage() {
  const [rows, setRows] = useState<ReportGroup[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleRow = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const perPage = 20

  // Filter aktif (yang sudah ditekan "Cari")
  const [filters, setFilters] = useState({ search: "", status: "", method: "", dateFrom: "", dateTo: "" })
  // Form input sementara
  const [form, setForm] = useState({ search: "", status: "", method: "", dateFrom: "", dateTo: "" })

  const buildParams = useCallback(
    (extra: Record<string, string | number> = {}) => ({
      search: filters.search || undefined,
      status: filters.status || undefined,
      method: filters.method || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      ...extra,
    }),
    [filters],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      try {
        const res = await api.get("/master/reports/cssd-per-item", { params: buildParams({ page }) })
        if (!active) return
        const p = res.data.data
        setRows(p.data)
        setTotalPages(p.last_page)
        setTotalItems(p.total)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [buildParams, page])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setFilters({ ...form })
    setPage(1)
  }

  function handleReset() {
    const empty = { search: "", status: "", method: "", dateFrom: "", dateTo: "" }
    setForm(empty)
    setFilters(empty)
    setPage(1)
  }

  async function handleExportCsv() {
    setExporting(true)
    try {
      const res = await api.get("/master/reports/cssd-per-item", { params: buildParams({ per_page: 2000 }) })
      const data: ReportGroup[] = res.data.data.data
      const headers = [
        "No",
        "Paket",
        "Nama Alat",
        "Kode Unit",
        "Kode Batch",
        "Status",
        "Metode Steril",
        "Mesin Steril",
        "Operator",
        "Kondisi Saat Diterima",
        "Tanggal Steril",
        "Kedaluwarsa",
      ]
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
      // CSV tetap per aset (per unit): grup paket diuraikan jadi baris-baris unitnya.
      let n = 0
      const lines = data.flatMap((g) =>
        g.units.map((u) =>
          [
            ++n,
            g.type === "paket" ? g.name ?? "" : "",
            u.name ?? "",
            u.unit_code ?? "",
            g.batch_code ?? "",
            statusLabel[g.status ?? ""] ?? g.status ?? "",
            methodLabel[g.method ?? ""] ?? g.method ?? "",
            g.machine ?? "",
            g.operator ?? "",
            u.condition ?? "",
            formatDate(g.sterilized_at),
            formatDate(g.expiry_date),
          ]
            .map((c) => escape(String(c)))
            .join(","),
        ),
      )
      const csv = [headers.map(escape).join(","), ...lines].join("\n")
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `laporan-cssd-per-alat-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan CSSD Per Alat"
        subtitle="Rekap per batch sterilisasi — paket ditampilkan sebagai satu baris, klik untuk lihat detail tiap aset"
      />

      <Card className="p-0">
        {/* Filter */}
        <form onSubmit={handleSearch} className="border-b border-gray-100 px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Nama / Kode Alat</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Cari nama atau kode unit..."
                  value={form.search}
                  onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</label>
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="">Semua Status</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Metode Steril</label>
              <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                <option value="">Semua Metode</option>
                {METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tanggal Awal</label>
              <Input
                type="date"
                value={form.dateFrom}
                onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tanggal Akhir</label>
              <Input
                type="date"
                value={form.dateTo}
                onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleExportCsv} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? "Mengekspor..." : "Export CSV"}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              <Search className="h-4 w-4" />
              Cari
            </Button>
          </div>
        </form>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Tidak ada data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="w-12 py-2.5 px-4 text-left">No</th>
                  <th className="py-2.5 px-4 text-left">Nama Alat / Paket</th>
                  <th className="w-28 py-2.5 px-4 text-left">Status</th>
                  <th className="py-2.5 px-4 text-left">Metode Steril</th>
                  <th className="py-2.5 px-4 text-left">Mesin Steril</th>
                  <th className="py-2.5 px-4 text-left">Kondisi</th>
                  <th className="w-32 py-2.5 px-4 text-left">Tanggal Steril</th>
                  <th className="w-32 py-2.5 px-4 text-left">Kedaluwarsa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((g, i) => {
                  const isPaket = g.type === "paket"
                  const open = expanded.has(g.key)
                  return (
                    <ReportRows
                      key={g.key}
                      group={g}
                      no={(page - 1) * perPage + i + 1}
                      isPaket={isPaket}
                      open={open}
                      onToggle={() => toggleRow(g.key)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={perPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  )
}

// Satu baris laporan. Paket → baris header (klik untuk expand) + baris detail tiap
// aset; Satuan → satu baris biasa.
function ReportRows({
  group: g,
  no,
  isPaket,
  open,
  onToggle,
}: {
  group: ReportGroup
  no: number
  isPaket: boolean
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className={isPaket ? "cursor-pointer hover:bg-gray-50" : undefined}
        onClick={isPaket ? onToggle : undefined}
      >
        <td className="py-2.5 px-4 text-gray-400">{no}</td>
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2">
            {isPaket ? (
              open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              )
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {isPaket ? (
              <Package className="h-4 w-4 shrink-0 text-violet-500" />
            ) : (
              <Boxes className="h-4 w-4 shrink-0 text-[#4ba69d]" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={isPaket ? "info" : "default"}>{isPaket ? "Paket" : "Satuan"}</Badge>
                <span className="font-medium text-gray-900">{g.name ?? "—"}</span>
                {isPaket && <span className="text-xs text-gray-400">{g.qty} alat</span>}
              </div>
              {!isPaket && g.unit_code && (
                <p className="font-mono text-xs text-gray-400">{g.unit_code}</p>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-4">
          <Badge variant={statusVariant[g.status ?? ""] ?? "default"}>
            {statusLabel[g.status ?? ""] ?? g.status ?? "—"}
          </Badge>
        </td>
        <td className="py-2.5 px-4 text-gray-700">{methodLabel[g.method ?? ""] ?? g.method ?? "—"}</td>
        <td className="py-2.5 px-4 text-gray-700">{g.machine ?? "—"}</td>
        <td className="py-2.5 px-4 text-gray-600">{isPaket ? "—" : g.condition ?? "—"}</td>
        <td className="py-2.5 px-4 text-sm text-gray-600">{formatDate(g.sterilized_at)}</td>
        <td className="py-2.5 px-4 text-sm text-gray-600">{formatDate(g.expiry_date)}</td>
      </tr>

      {isPaket &&
        open &&
        g.units.map((u) => (
          <tr key={u.id} className="bg-gray-50/60">
            <td className="px-4" />
            <td className="py-1.5 px-4" colSpan={4}>
              <div className="flex flex-wrap items-center gap-2 pl-10">
                <span className="rounded bg-[#075489]/8 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#075489]">
                  {u.unit_code ?? `#${u.id}`}
                </span>
                <span className="text-gray-700">{u.name ?? "—"}</span>
                {u.result && <span className="text-xs text-gray-400">· {u.result}</span>}
              </div>
            </td>
            <td className="py-1.5 px-4 text-gray-600">{u.condition ?? "—"}</td>
            <td className="px-4" colSpan={2} />
          </tr>
        ))}
    </>
  )
}

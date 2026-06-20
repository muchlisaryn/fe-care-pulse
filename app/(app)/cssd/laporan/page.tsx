"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RotateCcw, Search } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"

type ReportRow = {
  id: number
  name: string | null
  unit_code: string | null
  batch_code: string | null
  status: string | null
  method: string | null
  machine: string | null
  operator: string | null
  condition: string | null
  result: string | null
  sterilized_at: string | null
  expiry_date: string | null
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
  const [rows, setRows] = useState<ReportRow[]>([])
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
      const data: ReportRow[] = res.data.data.data
      const headers = [
        "No",
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
      const lines = data.map((r, i) =>
        [
          i + 1,
          r.name ?? "",
          r.unit_code ?? "",
          r.batch_code ?? "",
          statusLabel[r.status ?? ""] ?? r.status ?? "",
          methodLabel[r.method ?? ""] ?? r.method ?? "",
          r.machine ?? "",
          r.operator ?? "",
          r.condition ?? "",
          formatDate(r.sterilized_at),
          formatDate(r.expiry_date),
        ]
          .map((c) => escape(String(c)))
          .join(","),
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

  const columns: Column<ReportRow>[] = [
    {
      header: "Nama Alat",
      cell: (r) => (
        <div>
          <p className="font-medium text-gray-900">{r.name ?? "—"}</p>
          {r.unit_code && <p className="font-mono text-xs text-gray-400">{r.unit_code}</p>}
        </div>
      ),
    },
    {
      header: "Status",
      cell: (r) => (
        <Badge variant={statusVariant[r.status ?? ""] ?? "default"}>
          {statusLabel[r.status ?? ""] ?? r.status ?? "—"}
        </Badge>
      ),
      className: "w-28",
    },
    {
      header: "Metode Steril",
      cell: (r) => <span className="text-gray-700">{methodLabel[r.method ?? ""] ?? r.method ?? "—"}</span>,
    },
    {
      header: "Mesin Steril",
      cell: (r) => <span className="text-gray-700">{r.machine ?? "—"}</span>,
    },
    {
      header: "Kondisi Saat Diterima",
      cell: (r) => <span className="text-gray-600">{r.condition ?? "—"}</span>,
    },
    {
      header: "Tanggal Steril",
      cell: (r) => <span className="text-sm text-gray-600">{formatDate(r.sterilized_at)}</span>,
      className: "w-32",
    },
    {
      header: "Kedaluwarsa",
      cell: (r) => <span className="text-sm text-gray-600">{formatDate(r.expiry_date)}</span>,
      className: "w-32",
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan CSSD Per Alat"
        subtitle="Rekap setiap unit instrumen di tiap batch sterilisasi"
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
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            emptyMessage="Tidak ada data."
            rowNumber={(_, i) => (page - 1) * perPage + i + 1}
          />
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

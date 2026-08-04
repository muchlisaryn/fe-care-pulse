"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RotateCcw, Search, Sheet } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"
import { downloadCsv } from "@/lib/csv"
import { downloadXlsx } from "@/lib/excel"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { fetchRoomOptions } from "@/lib/store/slices/roomSlice"

// Satu baris = satu label kemasan (barcode_no) pada satu transaksi. Unit-unit dalam
// satu set berbagi satu label sehingga tampil sebagai satu baris bernama nama setnya.
type LaporanRow = {
  key: string
  order_id: number
  transaction_date: string | null
  invoice_no: string | null
  barcode_no: string | null
  type: "paket" | "satuan"
  name: string | null
  borrowed_by: string | null
  room: string | null
}

const PER_PAGE = 20

const EXPORT_HEADERS = [
  "No",
  "Tgl Transaksi",
  "No Invoice",
  "Nama Instrumen / Set",
  "Jenis",
  "Barcode",
  "Peminjam",
  "Ruangan",
] as const

const TYPE_OPTIONS = [
  { value: "", label: "Semua Jenis" },
  { value: "satuan", label: "Satuan" },
  { value: "paket", label: "Set" },
]

function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Default: transaksi hari ini. Filter lain kosong. */
function defaultFilters() {
  return { search: "", roomId: "", type: "", dateFrom: todayInput(), dateTo: todayInput() }
}

type Filters = ReturnType<typeof defaultFilters>

/** Apakah semua filter masih sama dengan nilai defaultnya. */
function isDefaultFilters(f: Filters): boolean {
  const d = defaultFilters()
  return (Object.keys(d) as (keyof Filters)[]).every((k) => f[k] === d[k])
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function Empty() {
  return <span className="text-xs text-gray-400">—</span>
}

/** Nilai teks yang bisa null — jangan pernah dirender sebagai sel kosong. */
function Text({ value }: { value: string | null }) {
  return value ? <>{value}</> : <Empty />
}

export default function LaporanTransaksiInstrumenPage() {
  const dispatch = useAppDispatch()
  const { options: rooms, optionsLoaded } = useAppSelector((s) => s.rooms)

  const [rows, setRows] = useState<LaporanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // `form` = draft yang diketik/dipilih user. `filters` = yang benar-benar dikirim
  // ke API.
  //
  // INVARIAN — TANPA live search & TANPA debounce: seluruh input HANYA boleh menulis
  // ke `form`. `filters` hanya boleh berubah lewat handleSearch() (tombol/Enter Cari)
  // dan handleReset(). Efek fetch bergantung pada `filters` saja, jadi mengetik atau
  // mengganti dropdown TIDAK memicu request sampai Cari ditekan. Jangan pernah
  // memanggil setFilters dari onChange.
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [form, setForm] = useState<Filters>(defaultFilters)

  useEffect(() => {
    if (optionsLoaded) return
    dispatch(fetchRoomOptions())
  }, [optionsLoaded, dispatch])

  const buildParams = useCallback(
    (extra: Record<string, string | number> = {}) => ({
      search: filters.search || undefined,
      room_id: filters.roomId || undefined,
      type: filters.type || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      ...extra,
    }),
    [filters],
  )

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await api.get("/master/reports/transaksi-instrumen", {
          params: buildParams({ page }),
        })
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
    const next = defaultFilters()
    setForm(next)
    setFilters(next)
    setPage(1)
  }

  /** Ambil SELURUH baris sesuai filter aktif, lalu susun sama persis dengan tabel. */
  async function handleExport(format: "xlsx" | "csv") {
    setExporting(true)
    try {
      const res = await api.get("/master/reports/transaksi-instrumen", {
        params: buildParams({ per_page: 2000 }),
      })
      const data: LaporanRow[] = res.data.data.data

      const exportRows = data.map((r, i) => [
        i + 1,
        r.transaction_date ? formatDate(r.transaction_date) : "",
        r.invoice_no ?? "",
        r.name ?? "",
        r.type === "paket" ? "Set" : "Satuan",
        r.barcode_no ?? "",
        r.borrowed_by ?? "",
        r.room ?? "",
      ])

      const filename = `laporan-transaksi-instrumen-${todayInput()}.${format}`
      if (format === "xlsx") {
        downloadXlsx(filename, "Laporan Transaksi", EXPORT_HEADERS, exportRows)
      } else {
        downloadCsv(filename, EXPORT_HEADERS, exportRows)
      }
    } finally {
      setExporting(false)
    }
  }

  const roomOptions = rooms.map((r) => ({ value: String(r.id), label: r.name }))

  // Reset muncul hanya kalau ada yang menyimpang dari default (tanggal = hari ini,
  // sisanya kosong). Draft form ikut dicek supaya tombolnya sudah tampil saat user
  // mengubah filter tapi belum menekan Cari.
  const hasActiveFilter = !isDefaultFilters(form) || !isDefaultFilters(filters)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Transaksi Instrumen"
        subtitle="Rekap peminjaman instrumen & set — satu baris per label kemasan (barcode)"
      />

      <Card className="p-0">
        {/* Filter */}
        <form onSubmit={handleSearch} className="border-b border-gray-100 px-5 py-4">
          {/* Filter penyempit (ruangan & rentang tanggal) di ATAS, kotak pencarian
              di BAWAH — pencarian dijalankan dalam lingkup filter di atasnya, jadi
              urutannya mengikuti alurnya. Ruangan setengah + dua tanggal seperempat
              supaya barisnya habis rata tanpa sel kosong. */}
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Ruangan</label>
              <SelectSearch
                options={roomOptions}
                value={form.roomId}
                onChange={(v) => setForm((f) => ({ ...f, roomId: v }))}
                placeholder="Semua Ruangan"
                searchPlaceholder="Cari ruangan..."
                loading={!optionsLoaded}
                triggerClassName="py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Jenis</label>
              <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <DateRangeFields
              from={form.dateFrom}
              to={form.dateTo}
              onFromChange={(v) => setForm((f) => ({ ...f, dateFrom: v }))}
              onToChange={(v) => setForm((f) => ({ ...f, dateTo: v }))}
              fromLabel="Tgl Transaksi Awal"
              toLabel="Tgl Transaksi Akhir"
            />
          </div>

          <div className="mt-4 space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Barcode / Nama Instrumen
            </label>
            {/* Tombol Cari menyatu dengan kotak pencariannya, bukan di baris aksi
                bawah — supaya jelas tombol ini menjalankan pencarian, bukan export. */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Scan barcode atau ketik nama instrumen / set..."
                  value={form.search}
                  onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
              <Button type="submit" className="shrink-0 bg-[#075489] hover:bg-[#075489]/90 text-white">
                <Search className="h-4 w-4" />
                Cari
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleExport("xlsx")}
              disabled={exporting}
              className="w-full justify-center sm:w-auto"
            >
              <Sheet className="h-4 w-4" />
              {exporting ? "Mengekspor..." : "Export Excel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="w-full justify-center sm:w-auto"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Mengekspor..." : "Export CSV"}
            </Button>
            {/* Reset hanya muncul kalau memang ada yang bisa di-reset. */}
            {hasActiveFilter && (
              <Button type="button" variant="outline" onClick={handleReset} className="w-full justify-center sm:w-auto">
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </form>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Tidak ada data.</div>
        ) : (
          <>
            {/* Mobile: tiap baris jadi kartu (label : nilai) agar tak terpotong. */}
            <div className="space-y-3 p-4 md:hidden">
              {rows.map((row, i) => (
                <LaporanCard key={row.key} row={row} no={(page - 1) * PER_PAGE + i + 1} />
              ))}
            </div>

            {/* Desktop: tabel penuh (scroll horizontal bila perlu). */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="w-12 py-2.5 px-4 text-left">No</th>
                    <th className="w-32 py-2.5 px-4 text-left">Tgl Transaksi</th>
                    <th className="py-2.5 px-4 text-left">No Invoice</th>
                    <th className="py-2.5 px-4 text-left">Nama Instrumen / Set</th>
                    <th className="w-24 py-2.5 px-4 text-left">Jenis</th>
                    <th className="py-2.5 px-4 text-left">Barcode</th>
                    <th className="py-2.5 px-4 text-left">Peminjam</th>
                    <th className="py-2.5 px-4 text-left">Ruangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, i) => (
                    <LaporanRowView key={row.key} row={row} no={(page - 1) * PER_PAGE + i + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={PER_PAGE}
          onPageChange={setPage}
        />
      </Card>
    </div>
  )
}

/** Badge jenis: set (banyak instrumen dalam satu bungkus) vs satuan. */
function JenisBadge({ type }: { type: LaporanRow["type"] }) {
  const isPaket = type === "paket"
  return <Badge variant={isPaket ? "info" : "default"}>{isPaket ? "Set" : "Satuan"}</Badge>
}

function BarcodeCell({ value }: { value: string | null }) {
  if (!value) return <Empty />
  return <span className="font-mono text-xs text-gray-700">{value}</span>
}

function LaporanRowView({ row, no }: { row: LaporanRow; no: number }) {
  return (
    <tr>
      <td className="py-2.5 px-4 text-gray-400">{no}</td>
      <td className="py-2.5 px-4 text-gray-600">{formatDate(row.transaction_date)}</td>
      <td className="py-2.5 px-4 font-mono text-xs text-gray-700">
        <Text value={row.invoice_no} />
      </td>
      <td className="py-2.5 px-4 font-medium text-gray-900">
        <Text value={row.name} />
      </td>
      <td className="py-2.5 px-4">
        <JenisBadge type={row.type} />
      </td>
      <td className="py-2.5 px-4">
        <BarcodeCell value={row.barcode_no} />
      </td>
      <td className="py-2.5 px-4 text-gray-700">
        <Text value={row.borrowed_by} />
      </td>
      <td className="py-2.5 px-4 text-gray-700">
        <Text value={row.room} />
      </td>
    </tr>
  )
}

function LaporanCard({ row, no }: { row: LaporanRow; no: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <JenisBadge type={row.type} />
          <div className="font-medium text-gray-900">
            <Text value={row.name} />
          </div>
          <BarcodeCell value={row.barcode_no} />
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-400">No {no}</span>
      </div>

      <dl className="divide-y divide-gray-50 border-t border-gray-100">
        <Field label="Tgl Transaksi">{formatDate(row.transaction_date)}</Field>
        <Field label="No Invoice">
          <Text value={row.invoice_no} />
        </Field>
        <Field label="Peminjam">
          <Text value={row.borrowed_by} />
        </Field>
        <Field label="Ruangan">
          <Text value={row.room} />
        </Field>
      </dl>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-gray-800">{children}</dd>
    </div>
  )
}

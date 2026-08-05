"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RotateCcw, Search, ChevronRight, ChevronDown } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Button } from "@/components/atoms/Button"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"
import { downloadCsv } from "@/lib/csv"

// Detail per aset (unit) di dalam satu label kemasan.
type ReportUnit = {
  id: number
  name: string | null
  unit_code: string | null
  result: string | null
  failed: boolean
}

// Satu baris laporan = satu LABEL KEMASAN (barcode_no) pada satu batch sterilisasi:
// seluruh unit yang dikemas bersama jadi satu baris yang bisa di-expand.
type ReportGroup = {
  key: string
  barcode_no: string | null
  name: string | null
  /** Kode unit — hanya terisi bila label ini memang berisi satu unit. */
  unit_code: string | null
  batch_code: string | null
  method: string | null
  machine: string | null
  cycle_number: string | null
  /** Suhu sterilisasi dalam °C; dikirim sebagai string desimal oleh Laravel. */
  temperature: string | number | null
  duration_minutes: number | null
  operator: string | null
  sterilized_at: string | null
  /** Hasil validasi batch — null bila batch belum divalidasi. */
  chemical_indicator: string | null
  bio_indicator_control: string | null
  bio_indicator_test: string | null
  expiry_date: string | null
  qty: number
  /** Ada unit di bungkus ini yang GAGAL steril (sumber: `sterilization_items.disabled`). */
  failed: boolean
  units: ReportUnit[]
}

const RESULT_OPTIONS = [
  { value: "berhasil", label: "Berhasil" },
  { value: "gagal", label: "Gagal" },
]

// Hanya dipakai untuk MENERJEMAHKAN nilai metode di kolom tabel — filter metode sudah
// tidak ada, filternya kini cuma nama + rentang tanggal.
const METHOD_OPTIONS = [
  { value: "uap", label: "Uap (Steam)" },
  { value: "eo", label: "Ethylene Oxide" },
  { value: "plasma", label: "Plasma" },
  { value: "panas_kering", label: "Panas Kering" },
]

const methodLabel: Record<string, string> = Object.fromEntries(METHOD_OPTIONS.map((o) => [o.value, o.label]))

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

/** Waktu steril = tanggal + jam:menit, mis. "05 Agu 2026, 13.00". */
function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Suhu batch, mis. "134°C". Nilai desimal bulat ditampilkan tanpa ekor ",00". */
function formatTemperature(value: string | number | null): string {
  if (value === null || value === "") return "—"
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")}°C`
}

/** Durasi batch dalam menit, mis. "30 mnt". */
function formatDuration(value: number | null): string {
  return value === null ? "—" : `${value} mnt`
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
  const [filters, setFilters] = useState({ search: "", machine: "", result: "", dateFrom: "", dateTo: "" })
  // Form input sementara
  const [form, setForm] = useState({ search: "", machine: "", result: "", dateFrom: "", dateTo: "" })

  // Pilihan mesin diambil dari batch yang benar-benar ada (bukan master mesin), supaya
  // mesin yang sudah dinonaktifkan/di-rename tetap bisa dipakai menyaring batch lama.
  const [machines, setMachines] = useState<string[]>([])

  const buildParams = useCallback(
    (extra: Record<string, string | number> = {}) => ({
      search: filters.search || undefined,
      machine: filters.machine || undefined,
      result: filters.result || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      ...extra,
    }),
    [filters],
  )

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await api.get("/master/reports/cssd-machines")
        if (active) setMachines(res.data?.data ?? [])
      } catch {
        if (active) setMachines([])
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      // Status memuat di-set di DALAM fungsi async (bukan langsung di body efek) —
      // pola yang sama dengan halaman laporan lain, dan menghindari render berantai.
      setLoading(true)
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
    const empty = { search: "", machine: "", result: "", dateFrom: "", dateTo: "" }
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
        "Waktu Steril",
        "Barcode",
        "Nama",
        "Nama Alat",
        // Warna baris tidak terbawa ke file, jadi berhasil/gagal ditulis eksplisit.
        "Status",
        "Mesin",
        "Metode",
        "No. Siklus",
        "Suhu",
        "Durasi",
        "Indikator Kimia",
        "Indikator Biologi Pembanding",
        "Indikator Biologi Uji",
        "Operator",
        "Kedaluwarsa",
      ]
      // CSV tetap per aset (per unit): baris gabungan diuraikan jadi baris-baris unitnya.
      const rows = data.flatMap((g) =>
        g.units.map((u) => [
          formatDateTime(g.sterilized_at),
          g.barcode_no ?? "",
          g.name ?? "",
          u.name ?? "",
          u.failed ? "Gagal" : "Berhasil",
          g.machine ?? "",
          methodLabel[g.method ?? ""] ?? g.method ?? "",
          g.cycle_number ?? "",
          g.temperature === null ? "" : formatTemperature(g.temperature),
          g.duration_minutes === null ? "" : formatDuration(g.duration_minutes),
          // Batch yang belum divalidasi ditulis "-" (bukan sel kosong) supaya jelas
          // memang tidak ada nilainya, bukan kolomnya yang bergeser.
          g.chemical_indicator ?? "-",
          g.bio_indicator_control ?? "-",
          g.bio_indicator_test ?? "-",
          g.operator ?? "",
          formatDate(g.expiry_date),
        ]),
      )
      downloadCsv(`laporan-cssd-per-alat-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Alat CSSD"
        subtitle="Rekap per batch sterilisasi — satu baris per label kemasan (barcode), klik untuk lihat detail tiap aset"
      />

      <Card className="p-0">
        {/* Filter */}
        <form onSubmit={handleSearch} className="border-b border-gray-100 px-5 py-4">
          {/* Lima filter: pencarian (selebar dua kolom) + mesin, status, dan dua
              tanggal masing-masing satu kolom → 6 kolom pas habis dalam satu baris di
              layar lebar. Di layar sedang jadi dua kolom per baris, di ponsel menumpuk. */}
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Nama / Kode Alat</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Cari nama unit..."
                  value={form.search}
                  onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Mesin</label>
              {/* Opsi bernilai kosong = kembali ke semua mesin (SelectSearch di app ini
                  tidak punya tombol clear sendiri). */}
              <SelectSearch
                options={[
                  { value: "", label: "Semua Mesin" },
                  ...machines.map((m) => ({ value: m, label: m })),
                ]}
                value={form.machine}
                onChange={(v) => setForm((f) => ({ ...f, machine: v }))}
                placeholder="Semua Mesin"
                searchPlaceholder="Cari mesin..."
                triggerClassName="py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</label>
              <Select value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>
                <option value="">Semua Status</option>
                {RESULT_OPTIONS.map((o) => (
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
            />
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportCsv}
              disabled={exporting}
              className="w-full justify-center sm:w-auto"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Mengekspor..." : "Export CSV"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="w-full justify-center sm:w-auto"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              type="submit"
              className="w-full justify-center bg-[#075489] hover:bg-[#075489]/90 text-white sm:w-auto"
            >
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
          <>
            {/* Mobile: tiap baris jadi kartu (label : nilai) agar tak terpotong. */}
            <div className="space-y-3 p-4 md:hidden">
              {rows.map((g) => (
                <ReportCard
                  key={g.key}
                  group={g}
                  open={expanded.has(g.key)}
                  onToggle={() => toggleRow(g.key)}
                />
              ))}
            </div>
            {/* Desktop: kolomnya banyak, jadi tabel diberi lebar minimum dan
                pembungkusnya digeser horizontal — lebih baik digeser daripada kolom
                terhimpit sampai teksnya terpotong. */}
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Waktu Steril</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Barcode</th>
                  {/* Kolom terpanjang isinya (nama set bisa panjang) — diberi lantai
                      lebar sendiri supaya tidak ikut menyusut saat kolom lain melebar. */}
                  <th className="min-w-[340px] py-2.5 px-4 text-left">Nama Alat</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Mesin</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Metode</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">No. Siklus</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Suhu</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Durasi</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Indikator Kimia</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Ind. Biologi Pembanding</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Ind. Biologi Uji</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">Kedaluwarsa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((g) => (
                  <ReportRows
                    key={g.key}
                    group={g}
                    open={expanded.has(g.key)}
                    onToggle={() => toggleRow(g.key)}
                  />
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
          itemsPerPage={perPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  )
}

/** Nilai indikator batch; batch yang belum divalidasi tidak pernah tampil kosong. */
function IndicatorValue({ value }: { value: string | null }) {
  return value ? <>{value}</> : <span className="text-xs text-gray-400">—</span>
}

/**
 * Satu baris laporan = satu label kemasan. Label yang membungkus lebih dari satu unit
 * bisa dibuka untuk melihat tiap asetnya; label berisi satu unit tidak punya detail
 * tambahan sehingga tidak bisa diklik.
 */
function ReportRows({
  group: g,
  open,
  onToggle,
}: {
  group: ReportGroup
  open: boolean
  onToggle: () => void
}) {
  const expandable = g.qty > 1
  // Bungkus yang gagal steril tetap dilaporkan, hanya ditandai merah — laporan ini
  // juga dipakai menelusuri kegagalan, jadi barisnya tidak boleh disembunyikan.
  const rowTone = g.failed
    ? "bg-red-50/70 " + (expandable ? "hover:bg-red-50" : "")
    : expandable
      ? "hover:bg-gray-50"
      : ""
  return (
    <>
      <tr
        className={(expandable ? "cursor-pointer " : "") + rowTone}
        onClick={expandable ? onToggle : undefined}
      >
        <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">{formatDateTime(g.sterilized_at)}</td>
        <td className="whitespace-nowrap py-2.5 px-4">
          {g.barcode_no ? (
            <span className="font-mono text-xs text-gray-700">{g.barcode_no}</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="min-w-[340px] py-2.5 px-4">
          <div className="flex items-center gap-2">
            {/* Chevron dipertahankan sebagai penanda baris yang bisa dibuka; baris
                berisi satu unit diberi ruang kosong selebar itu agar namanya lurus. */}
            {expandable ? (
              open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              )
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-900">{g.name ?? "—"}</span>
                {expandable && <span className="text-xs text-gray-400">{g.qty} alat</span>}
              </div>
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">{g.machine ?? "—"}</td>
        <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
          {methodLabel[g.method ?? ""] ?? g.method ?? "—"}
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 font-mono text-xs text-gray-700">
          {g.cycle_number ?? <span className="text-gray-400">—</span>}
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 tabular-nums text-gray-700">
          {formatTemperature(g.temperature)}
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 tabular-nums text-gray-700">
          {formatDuration(g.duration_minutes)}
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
          <IndicatorValue value={g.chemical_indicator} />
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
          <IndicatorValue value={g.bio_indicator_control} />
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
          <IndicatorValue value={g.bio_indicator_test} />
        </td>
        <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">{formatDate(g.expiry_date)}</td>
      </tr>

      {expandable &&
        open &&
        g.units.map((u) => (
          <tr key={u.id} className={u.failed ? "bg-red-50/70" : "bg-gray-50/60"}>
            <td className="px-4" />
            <td className="px-4" />
            {/* Sisa kolom (Nama Alat … Kedaluwarsa) dilebur jadi satu sel detail. */}
            <td className="py-1.5 px-4" colSpan={10}>
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <span className={u.failed ? "text-red-700" : "text-gray-700"}>{u.name ?? "—"}</span>
                {u.result && (
                  <span className={"text-xs " + (u.failed ? "text-red-600" : "text-gray-400")}>
                    · {u.result}
                  </span>
                )}
              </div>
            </td>
          </tr>
        ))}
    </>
  )
}

// Versi kartu (mobile) dari satu baris laporan: header (klik untuk membuka detail bila
// labelnya membungkus lebih dari satu unit) + daftar field label:nilai.
function ReportCard({
  group: g,
  open,
  onToggle,
}: {
  group: ReportGroup
  open: boolean
  onToggle: () => void
}) {
  const expandable = g.qty > 1
  return (
    <div
      className={
        "overflow-hidden rounded-xl border shadow-sm " +
        // Penanda gagal versi kartu — sepadan dengan baris merah di tabel.
        (g.failed ? "border-red-200 bg-red-50/60" : "border-gray-200 bg-white")
      }
    >
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        className={"flex w-full items-start gap-2 px-4 py-3 text-left " + (expandable ? "" : "cursor-default")}
      >
        {expandable ? (
          open ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">{g.name ?? "—"}</span>
            {expandable && <span className="text-xs text-gray-400">{g.qty} alat</span>}
          </div>
          {g.barcode_no && <span className="font-mono text-xs text-gray-500">{g.barcode_no}</span>}
        </div>
        {g.failed && (
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
            Gagal
          </span>
        )}
      </button>

      <dl className="divide-y divide-gray-50 border-t border-gray-100">
        <ReportField label="Waktu Steril">{formatDateTime(g.sterilized_at)}</ReportField>
        <ReportField label="Mesin">{g.machine ?? "—"}</ReportField>
        <ReportField label="Metode">{methodLabel[g.method ?? ""] ?? g.method ?? "—"}</ReportField>
        <ReportField label="No. Siklus">{g.cycle_number ?? "—"}</ReportField>
        <ReportField label="Suhu">{formatTemperature(g.temperature)}</ReportField>
        <ReportField label="Durasi">{formatDuration(g.duration_minutes)}</ReportField>
        <ReportField label="Indikator Kimia">
          <IndicatorValue value={g.chemical_indicator} />
        </ReportField>
        <ReportField label="Ind. Biologi Pembanding">
          <IndicatorValue value={g.bio_indicator_control} />
        </ReportField>
        <ReportField label="Ind. Biologi Uji">
          <IndicatorValue value={g.bio_indicator_test} />
        </ReportField>
        <ReportField label="Kedaluwarsa">{formatDate(g.expiry_date)}</ReportField>
      </dl>

      {expandable && open && (
        <div className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/50">
          {g.units.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className={"text-sm " + (u.failed ? "text-red-700" : "text-gray-700")}>
                {u.name ?? "—"}
              </span>
              {u.result && (
                <span className={"ml-auto text-xs " + (u.failed ? "text-red-600" : "text-gray-400")}>
                  {u.result}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-gray-800">{children}</dd>
    </div>
  )
}

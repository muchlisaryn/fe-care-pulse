"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2, Download, RotateCcw, Search, Sheet } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { DropdownMenu } from "@/components/molecules/DropdownMenu"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"
import { downloadXlsx, downloadXlsxReport, type XlsxGroup } from "@/lib/excel"
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
  /** Tanggal peminjaman — diambil dari saat batch produksi unit ini dimulai. */
  borrowed_date: string | null
  room: string | null
  medical_record_no: string | null
  patient_name: string | null
  /** Petugas CSSD yang menyerahkan alat steril (pelaku event `terdistribusi`). */
  distributed_by: string | null
  /** Pihak yang menerima hasil distribusi (`order.distributed_to`). */
  received_by: string | null
  /** Momen alat steril diserahkan (`order.distributed_at`). */
  distributed_at: string | null
  /** Orang dari ruangan yang menyerahkan alat kembali (`order.returned_by`). */
  returned_by: string | null
  /** Petugas CSSD yang menerima pengembalian (pelaku event `dikembalikan`). */
  return_received_by: string | null
  /** Tanggal pengembalian (`order.return_actual_date`) — tanpa jam. */
  return_date: string | null
  /** Momen persis pengembalian dari event timeline; null pada order lama. */
  returned_at: string | null
}

const PER_PAGE = 20

// Urutan kolom ini adalah SATU-SATUNYA acuan: tabel desktop, kartu mobile, dan
// export Excel/CSV harus mengikuti urutan yang sama supaya hasil unduhan bisa
// dibaca sejajar dengan yang tampil di layar.
const EXPORT_HEADERS = [
  "Tgl Transaksi",
  "No Invoice",
  "No. RM Pasien",
  "Nama Pasien",
  "Ruangan",
  "Jenis",
  "Nama Instrumen / Set",
  "Barcode",
  "Peminjam",
  "Tgl Peminjaman",
  "Petugas Distribusi",
  "Diterima Oleh",
  "Distribusi Tanggal",
  "Dikembalikan Oleh",
  "Petugas Penerima",
  "Tanggal Kembali",
] as const

// Rekapan per ruangan: nama ruangan jadi judul kelompok, isinya nomor urut, nama
// barang, dan qty-nya (satu SET dihitung 1, bukan per instrumen di dalamnya).
const EXPORT_ROOM_HEADERS = ["No", "Nama Barang", "QTY"] as const

const TYPE_OPTIONS = [
  { value: "", label: "Semua Jenis" },
  { value: "satuan", label: "Satuan" },
  { value: "paket", label: "Set" },
]

/**
 * Tanggal untuk <input type="date"> (YYYY-MM-DD), digeser `offsetDays` hari dari
 * hari ini. Sengaja dirakit dari komponen tanggal LOKAL, bukan `toISOString()`
 * yang memakai UTC — di WIB (UTC+7) cara itu memundurkan tanggal sehari setiap
 * kali halaman dibuka sebelum pukul 07.00.
 */
function dateInput(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Default: 30 hari terakhir (H-30 s.d. hari ini). Filter lain kosong. */
function defaultFilters() {
  return { search: "", roomId: "", type: "", dateFrom: dateInput(-30), dateTo: dateInput() }
}

type Filters = ReturnType<typeof defaultFilters>

/** Apakah semua filter masih sama dengan nilai defaultnya. */
function isDefaultFilters(f: Filters): boolean {
  const d = defaultFilters()
  return (Object.keys(d) as (keyof Filters)[]).every((k) => f[k] === d[k])
}

/**
 * Baca nilai tanggal/waktu dari API. Kolom laporan ini diambil lewat query builder
 * mentah, jadi nilai datetime-nya berbentuk "YYYY-MM-DD HH:MM:SS" (pakai spasi, bukan
 * "T"). Bentuk berspasi itu di luar spesifikasi `Date` dan tidak dijamin sama di semua
 * browser — disamakan dulu agar konsisten dibaca sebagai waktu LOKAL. Nilai
 * tanggal-saja tidak terpengaruh.
 */
function parseApiDate(value: string): Date {
  return new Date(value.includes("T") ? value : value.replace(" ", "T"))
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = parseApiDate(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = parseApiDate(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Waktu pengembalian yang ditampilkan: momen persis dari event timeline bila ada,
 * kalau tidak jatuh ke tanggalnya saja (`return_actual_date` memang hanya DATE,
 * dan order lama belum tentu punya event). "—" bila keduanya kosong.
 */
function returnedAtLabel(row: LaporanRow): string {
  if (row.returned_at) return formatDateTime(row.returned_at)
  return formatDate(row.return_date)
}

/** Apakah baris ini punya informasi waktu pengembalian sama sekali. */
function hasReturnedAt(row: LaporanRow): boolean {
  return Boolean(row.returned_at || row.return_date)
}

function Empty() {
  return <span className="text-xs text-gray-400">—</span>
}

/** Nilai teks yang bisa null — jangan pernah dirender sebagai sel kosong. */
function Text({ value }: { value: string | null }) {
  return value ? <>{value}</> : <Empty />
}

/**
 * Nama pasien selalu ditampilkan KAPITAL agar seragam dan mudah dipindai saat
 * dicocokkan dengan berkas. Dipakai juga oleh export supaya isi unduhan sama
 * persis dengan yang tampil di layar. Nilai kosong tetap null → dirender "—".
 */
function patientName(value: string | null): string | null {
  const name = value?.trim()

  return name ? name.toUpperCase() : null
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

  /** Seluruh baris sesuai filter aktif (bukan hanya halaman yang sedang tampil). */
  async function fetchAllRows(): Promise<LaporanRow[]> {
    const res = await api.get("/master/reports/transaksi-instrumen", {
      params: buildParams({ per_page: 2000 }),
    })
    return res.data.data.data
  }

  /** Export rinci: satu baris per label kemasan, kolomnya sama persis dengan tabel. */
  async function handleExport() {
    setExporting(true)
    try {
      const data = await fetchAllRows()

      const exportRows = data.map((r) => [
        r.transaction_date ? formatDate(r.transaction_date) : "",
        r.invoice_no ?? "",
        r.medical_record_no ?? "",
        patientName(r.patient_name) ?? "",
        r.room ?? "",
        r.type === "paket" ? "Set" : "Satuan",
        r.name ?? "",
        r.barcode_no ?? "",
        r.borrowed_by ?? "",
        r.borrowed_date ? formatDateTime(r.borrowed_date) : "",
        r.distributed_by ?? "",
        r.received_by ?? "",
        r.distributed_at ? formatDateTime(r.distributed_at) : "",
        r.returned_by ?? "",
        r.return_received_by ?? "",
        hasReturnedAt(r) ? returnedAtLabel(r) : "",
      ])

      downloadXlsx(
        `laporan-transaksi-instrumen-${dateInput()}.xlsx`,
        "Laporan Transaksi",
        EXPORT_HEADERS,
        exportRows,
      )
    } finally {
      setExporting(false)
    }
  }

  /**
   * Export REKAPAN PER RUANGAN: berkepala judul laporan + nama RS + rentang tanggal
   * (mengikuti filter yang sedang aktif), lalu tiap ruangan menjadi satu kelompok
   * berisi No / Nama Barang / QTY dengan penomoran yang dimulai ulang tiap ruangan.
   *
   * Qty dihitung dari jumlah baris laporan — satu baris = satu label kemasan, jadi
   * satu SET bernilai 1 (bukan per instrumen di dalamnya) dan satu instrumen satuan
   * juga bernilai 1.
   */
  async function handleExportPerRoom() {
    setExporting(true)
    try {
      const data = await fetchAllRows()

      // ruangan → nama barang → total qty. Set & satuan bernama sama digabung karena
      // laporannya hanya menampilkan nama barang, tanpa kolom jenis.
      const byRoom = new Map<string, Map<string, number>>()
      for (const r of data) {
        const room = r.room?.trim() || "Tanpa Ruangan"
        const name = r.name?.trim() || "Tanpa Nama"
        const items = byRoom.get(room) ?? new Map<string, number>()
        items.set(name, (items.get(name) ?? 0) + 1)
        byRoom.set(room, items)
      }

      const groups: XlsxGroup[] = [...byRoom.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "id", { numeric: true }))
        .map(([room, items]) => ({
          title: room,
          rows: [...items.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], "id", { numeric: true }))
            // Penomoran dimulai ulang di tiap ruangan.
            .map(([name, qty], i) => [i + 1, name, qty]),
        }))

      downloadXlsxReport(
        `rekapan-transaksi-per-ruangan-${dateInput()}.xlsx`,
        "Rekap Per Ruangan",
        [
          "REKAPAN TRANSAKSI UNIT STERILISASI",
          "RS ISLAM JAKARTA PONDOK KOPI",
          `TANGGAL ${formatDate(filters.dateFrom)} SAMPAI ${formatDate(filters.dateTo)}`,
        ],
        EXPORT_ROOM_HEADERS,
        groups,
        // Kolom "No" ditengahkan.
        [0],
      )
    } finally {
      setExporting(false)
    }
  }

  const roomOptions = rooms.map((r) => ({ value: String(r.id), label: r.name }))

  // Reset muncul hanya kalau ada yang menyimpang dari default (tanggal = 30 hari
  // terakhir, sisanya kosong). Draft form ikut dicek supaya tombolnya sudah tampil
  // saat user mengubah filter tapi belum menekan Cari.
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
                  placeholder="Masukkan barcode atau nama instrumen / set..."
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
            {/* Satu tombol untuk semua bentuk unduhan: rinci per label kemasan, atau
                rekap per ruangan. Keduanya memakai filter yang sedang aktif. */}
            <DropdownMenu
              label={exporting ? "Mengekspor..." : "Export Laporan"}
              icon={Download}
              disabled={exporting}
              className="w-full sm:w-auto"
              items={[
                {
                  label: "Export Transaksi (Excel)",
                  icon: Sheet,
                  onClick: handleExport,
                },
                {
                  label: "Export Transaksi Per Ruangan",
                  icon: Building2,
                  onClick: handleExportPerRoom,
                },
              ]}
            />
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
              {rows.map((row) => (
                <LaporanCard key={row.key} row={row} />
              ))}
            </div>

            {/* Desktop: tabel penuh. Kolomnya banyak, jadi tabel diberi lebar minimum
                dan pembungkusnya scroll horizontal — lebih baik digeser daripada
                kolom terhimpit sampai teksnya terpotong. `whitespace-nowrap` menjaga
                judul & nilai pendek tetap satu baris; hanya kolom nama instrumen dan
                nama pasien yang boleh membungkus. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1740px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="w-32 whitespace-nowrap py-2.5 px-4 text-left">Tgl Transaksi</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">No Invoice</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">No. RM Pasien</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Nama Pasien</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Ruangan</th>
                    <th className="w-24 whitespace-nowrap py-2.5 px-4 text-left">Jenis</th>
                    {/* Kolom utama laporan — diberi porsi lebar paling besar. */}
                    <th className="min-w-[260px] py-2.5 px-4 text-left">Nama Instrumen / Set</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Barcode</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Peminjam</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Tgl Peminjaman</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Petugas Distribusi</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Diterima Oleh</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Distribusi Tanggal</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Dikembalikan Oleh</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Petugas Penerima</th>
                    <th className="whitespace-nowrap py-2.5 px-4 text-left">Tanggal Kembali</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => (
                    <LaporanRowView key={row.key} row={row} />
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
  // Monospace supaya deretan angka barcode mudah dibandingkan — ukuran hurufnya
  // tetap sama dengan sel lain.
  return <span className="font-mono text-gray-700">{value}</span>
}

function LaporanRowView({ row }: { row: LaporanRow }) {
  return (
    <tr>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">{formatDate(row.transaction_date)}</td>
      <td className="whitespace-nowrap py-2.5 px-4 font-mono text-gray-700">
        <Text value={row.invoice_no} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 font-mono text-gray-700">
        <Text value={row.medical_record_no} />
      </td>
      <td className="py-2.5 px-4 text-gray-700">
        <Text value={patientName(row.patient_name)} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <Text value={row.room} />
      </td>
      <td className="py-2.5 px-4">
        <JenisBadge type={row.type} />
      </td>
      {/* Kolom utama — ditonjolkan lewat LEBAR kolomnya saja; ukuran & ketebalan
          teksnya sengaja sama dengan kolom lain. */}
      <td className="min-w-[260px] py-2.5 px-4 text-gray-900">
        <Text value={row.name} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4">
        <BarcodeCell value={row.barcode_no} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <Text value={row.borrowed_by} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">{formatDateTime(row.borrowed_date)}</td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <Text value={row.distributed_by} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <Text value={row.received_by} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">
        {formatDateTime(row.distributed_at)}
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <Text value={row.returned_by} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <Text value={row.return_received_by} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">
        {hasReturnedAt(row) ? returnedAtLabel(row) : <Empty />}
      </td>
    </tr>
  )
}

function LaporanCard({ row }: { row: LaporanRow }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <JenisBadge type={row.type} />
          <div className="text-sm text-gray-900">
            <Text value={row.name} />
          </div>
          <BarcodeCell value={row.barcode_no} />
        </div>
      </div>

      <dl className="divide-y divide-gray-50 border-t border-gray-100">
        <Field label="Tgl Transaksi">{formatDate(row.transaction_date)}</Field>
        <Field label="No Invoice">
          <Text value={row.invoice_no} />
        </Field>
        <Field label="No. RM Pasien">
          <Text value={row.medical_record_no} />
        </Field>
        <Field label="Nama Pasien">
          <Text value={patientName(row.patient_name)} />
        </Field>
        <Field label="Ruangan">
          <Text value={row.room} />
        </Field>
        <Field label="Peminjam">
          <Text value={row.borrowed_by} />
        </Field>
        <Field label="Tgl Peminjaman">{formatDateTime(row.borrowed_date)}</Field>
        <Field label="Petugas Distribusi">
          <Text value={row.distributed_by} />
        </Field>
        <Field label="Diterima Oleh">
          <Text value={row.received_by} />
        </Field>
        <Field label="Distribusi Tanggal">{formatDateTime(row.distributed_at)}</Field>
        <Field label="Dikembalikan Oleh">
          <Text value={row.returned_by} />
        </Field>
        <Field label="Petugas Penerima">
          <Text value={row.return_received_by} />
        </Field>
        <Field label="Tanggal Kembali">
          {hasReturnedAt(row) ? returnedAtLabel(row) : <Empty />}
        </Field>
      </dl>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-gray-800">{children}</dd>
    </div>
  )
}

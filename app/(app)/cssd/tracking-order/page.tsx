"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Search,
  Package,
  ClipboardList,
  AlertTriangle,
  ScanLine,
  ChevronRight,
  History,
  Loader2,
  Wrench,
  Scissors,
} from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Label } from "@/components/atoms/Label"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { RoomDistributionCard } from "@/components/molecules/RoomDistributionCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { Pagination } from "@/components/molecules/Pagination"
import { OrderTimeline } from "@/components/molecules/OrderTimeline"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { invalidateOrders } from "@/lib/store/slices/orderSlice"
import { fetchIncomingCount } from "@/lib/store/slices/notifSlice"
import { fetchConditions } from "@/lib/store/slices/conditionSlice"
import {
  fetchMonitoringRooms,
  fetchMonitoringRoomsSummary,
  fetchMonitoringIncoming,
  fetchMonitoringTracking,
  fetchBorrowedSummary,
  fetchMonitoringCounts,
  TRACKING_PER_PAGE,
  type MonitoredInstrument,
  type IncomingStatus,
  type IncomingItem,
  type IncomingOrder,
  type ReturnedOrder,
} from "@/lib/store/slices/monitoringSlice"
import { fetchReadyToDistribute } from "@/lib/store/slices/distributeSlice"
import { fetchTrackingCounts } from "@/lib/store/slices/trackingCountSlice"
import { DistributeReady } from "@/components/molecules/DistributeReady"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { useUserOptions } from "@/lib/useUserOptions"
import api from "@/lib/axios"
import { getEcho } from "@/lib/echo"

// Tab kategori order pada halaman monitoring (tahapan alur CSSD).
type MonitoringTab = "masuk" | "distribusi"

// Tahapan Cleaning/Inspection/Sterilization dipindah ke halaman Produksi CSSD.
// Tracking Order kini hanya menangani Order Masuk & Distribution & Tracking.
const MONITORING_TABS: MonitoringTab[] = [
  "masuk",
  "distribusi",
]

// Validasi nilai tab dari URL (?tab=...); fallback ke tab pertama bila tidak dikenal.
function parseTab(value: string | null): MonitoringTab {
  return MONITORING_TABS.includes(value as MonitoringTab) ? (value as MonitoringTab) : MONITORING_TABS[0]
}

// Tab "Order Masuk": daftarnya dimuat sekaligus lalu dipotong di klien.
const ITEMS_PER_PAGE = 20

// Tipe data monitoring (MonitoredRoom, IncomingOrder, ReturnedOrder, dll.)
// kini tinggal di lib/store/slices/monitoringSlice dan di-impor di atas.

const incomingStatusLabel: Record<IncomingStatus, string> = {
  diajukan: "Submitted",
}
const incomingStatusVariant: Record<IncomingStatus, "warning" | "default"> = {
  diajukan: "warning",
}

// Warna garis kiri kartu per tahap order — konsisten dengan tracking status:
// Order Masuk=tanpa warna (netral), Cleaning=kuning, Packaging=ungu (di CleaningTab),
// Distribusi=tanpa warna (netral), Dikembalikan=tanpa warna (netral), Dibatalkan=merah.
const STATUS_BORDER: Record<string, string> = {
  diajukan: "border-l-transparent",
  dipinjam: "border-l-transparent",
  dikembalikan: "border-l-transparent",
  dibatalkan: "border-l-red-400",
}

// Tanggal hari ini (lokal) dalam format "YYYY-MM-DD" untuk <input type="date">.
function todayInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

/** Tanggal `n` hari lalu (lokal), format "YYYY-MM-DD" — nilai awal filter rentang. */
function daysAgoInput(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

/**
 * Tanggal LOKAL sebuah nilai dari API dalam format "YYYY-MM-DD" — dasar pembanding
 * filter rentang. Sengaja memakai zona waktu lokal (bukan potong string ISO) supaya
 * hasil saringan sama persis dengan tanggal yang tertulis di kartu (`formatDate`).
 */
function dateKey(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

/**
 * Apakah tanggal sebuah baris masuk rentang filter (inklusif di kedua ujung)?
 * Baris tanpa tanggal (data lama) sengaja TETAP ditampilkan — menyembunyikannya
 * berarti pekerjaan yang belum selesai bisa hilang dari layar tanpa disadari.
 */
function inDateRange(value: string | null, from: string, to: string): boolean {
  const key = dateKey(value)
  if (!key) return true
  if (from && key < from) return false
  if (to && key > to) return false
  return true
}

// Order + unit hasil scan untuk pengembalian.
type ReturnUnit = {
  id: number
  source: "satuan" | "paket"
  package_name: string | null
  is_returned: boolean
  /** Kode batch produksi (PRD-...) — label pada bungkus steril unit ini. */
  production_code: string | null
  /** Nomor label fisik (packaging_item.barcode_no) — dasar pengelompokan unit. */
  barcode_no: string | null
  /** Nama instrumen dari SNAPSHOT production_item (bukan master). */
  instrument_name: string | null
  instrument_stock: { code: string | null; instrument: { name: string } | null } | null
  condition_out: { id: number; name: string } | null
  condition_in: { id: number; name: string } | null
}
type ReturnOrder = {
  id: number
  code: string
  /** No. transaksi (INV...) — baru terisi saat order diproses CSSD. */
  code_transaction: string | null
  status: string
  borrowed_by: string | null
  room: { id: number; name: string } | null
  order_date: string | null
  return_plan_date: string | null
  return_actual_date: string | null
  returned_by: string | null
  medical_record_no?: string | null
  patient_name?: string | null
  distributed_to?: string | null
  items: ReturnUnit[]
}

// Kode untuk judul modal: no. order + no. transaksi. INV baru terbit saat order
// diproses CSSD, jadi bisa saja belum ada.
function titleCodes(order: ReturnOrder) {
  return order.code_transaction ? `${order.code} (${order.code_transaction})` : order.code
}

// Ringkasan jumlah pinjaman pada kartu order: PAKET dihitung per SET, instrumen
// lepas per UNIT fisik — mis. "2 set paket · 10 unit satuan". Satuannya ditulis
// lengkap supaya jelas mana yang set paket & mana yang unit satuan.
// `fallbackUnits` dipakai bila jumlah set belum tersedia (data monitoring lama)
// agar kartu tidak tampil "0".
function qtySummary(sets: number, units: number, fallbackUnits: number): string {
  const parts: string[] = []
  if (sets > 0) parts.push(`${sets} package sets`)
  if (units > 0) parts.push(`${units} single units`)
  return parts.length > 0 ? parts.join(" · ") : `${fallbackUnits} units`
}

// Satu grup unit pada modal Pengembalian & Riwayat Pengembalian = satu BUNGKUS fisik.
type ReturnGroup = { key: string; name: string | null; barcodeNo: string | null; units: ReturnUnit[] }

// Kelompokkan unit order per NOMOR LABEL kemasan (barcode_no): satu label = satu
// bungkus steril = satu set. Paket 2 set tampil sebagai 2 grup terpisah dengan
// labelnya masing-masing, bukan satu grup berisi dua label — jadi jumlah setnya
// terbaca langsung dari banyaknya grup, tak perlu ditulis lagi.
// Nama paket/satuan tetap ikut jadi kunci agar unit tanpa label (data lama) tidak
// tercampur antar jenis.
function buildReturnGroups(items: ReturnUnit[]): ReturnGroup[] {
  const map = new Map<string, ReturnGroup>()
  for (const u of items) {
    const name = u.source === "paket" ? (u.package_name ?? "Package") : null
    const key = `${name ?? "__satuan__"}|${u.barcode_no ?? "__tanpa-label__"}`
    const g = map.get(key) ?? { key, name, barcodeNo: u.barcode_no, units: [] }
    g.units.push(u)
    map.set(key, g)
  }
  return [...map.values()]
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Baris keterangan kartu order — urutannya seragam di semua kartu Daftar Order:
 * nama pasien → No. RM → ruangan → tgl pinjam → tgl kembali. Identitas pasien hanya
 * ada pada order rawat inap, jadi kedua bagian itu dilewati bila kosong.
 */
function OrderMeta({
  patientName,
  medicalRecordNo,
  room,
  borrowDate,
  returnLabel = "Return",
  returnDate,
  showRoom = true,
}: {
  patientName: string | null
  medicalRecordNo: string | null
  room: string | null
  borrowDate: string | null
  returnLabel?: string
  returnDate: string | null
  showRoom?: boolean
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
      {patientName && <span className="font-medium text-gray-700">Patient: {patientName}</span>}
      {medicalRecordNo && <span className="font-mono">MR No.: {medicalRecordNo}</span>}
      {showRoom && <span>Room: {room ?? "—"}</span>}
      <span>Borrowed: {formatDate(borrowDate)}</span>
      <span>
        {returnLabel}: {formatDate(returnDate)}
      </span>
    </div>
  )
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Terlambat = masih dipinjam tapi rencana kembali sudah lewat (turunan, bukan status DB).
function isOverdue(returnPlanDate: string | null): boolean {
  if (!returnPlanDate) return false
  const d = new Date(returnPlanDate)
  d.setHours(0, 0, 0, 0)
  return d.getTime() < startOfToday()
}

// Satu BUNGKUS fisik di dalam kartu order: satu nomor label kemasan (barcode_no).
// Paket 2 set → 2 grup terpisah; satuan sejenis dalam satu bungkus → satu grup.
type LabelGroup = {
  key: string
  source: "satuan" | "paket"
  /** Nama paket (untuk paket) atau nama instrumen (untuk satuan). */
  name: string
  barcodeNo: string | null
  units: {
    stockId: number | null
    code: string | null
    instrumentCode: string | null
    instrumentName: string | null
  }[]
}

// Ratakan baris monitoring (per katalog instrumen) menjadi grup per nomor label
// kemasan — dasar tampilan rincian saat kartu order dibuka. Unit tanpa label (data
// lama sebelum tahap packaging) berdiri sebagai grup sendiri agar tidak tercampur.
function buildLabelGroups(rows: MonitoredInstrument[]): LabelGroup[] {
  const map = new Map<string, LabelGroup>()
  for (const r of rows) {
    const name =
      r.source === "paket" ? (r.package_name ?? "Package") : (r.instrument?.name ?? "Instrument")
    for (const u of r.units) {
      const label = u.barcode_no ?? `__tanpa-label#${u.instrument_stock_id ?? u.code}`
      const key = `${r.source}|${name}|${label}`
      const g = map.get(key) ?? { key, source: r.source, name, barcodeNo: u.barcode_no, units: [] }
      g.units.push({
        stockId: u.instrument_stock_id,
        code: u.code,
        instrumentCode: r.instrument?.code ?? null,
        instrumentName: r.instrument?.name ?? null,
      })
      map.set(key, g)
    }
  }
  // Paket dulu baru satuan, masing-masing urut nama — sama seperti Inventaris Gudang.
  return [...map.values()].sort((a, b) =>
    a.source === b.source
      ? a.name.localeCompare(b.name, "id", { numeric: true })
      : a.source === "paket"
        ? -1
        : 1,
  )
}

// Grup tampilan: per order (peminjam) → di dalamnya per paket / satuan.
type OrderGroup = {
  order_code: string
  code_transaction: string | null
  borrowed_by: string | null
  /** Identitas pasien order ini (kosong untuk layanan non rawat inap). */
  patient_name: string | null
  medical_record_no: string | null
  room: string | null
  order_date: string | null
  return_plan_date: string | null
  /** Total unit fisik (paket + satuan) — dasar hitung lama. */
  totalQty: number
  /** Unit fisik dari baris satuan saja — yang dihitung dalam satuan "unit". */
  satuanQty: number
  /** Total set dari seluruh paket — yang dihitung dalam satuan "set". */
  totalSets: number
  paketGroups: { name: string; sets: number; instruments: MonitoredInstrument[] }[]
  satuanInstruments: MonitoredInstrument[]
}

// Baris tab "Distribusi": order yang sedang dipinjam (terdistribusi ke ruangan)
// atau sudah dikembalikan (riwayat).
type CombinedRow =
  | { kind: "borrowed"; group: OrderGroup }
  | { kind: "returned"; order: ReturnedOrder }

// Kelompokkan daftar instrumen dipinjam per order, lalu per paket / satuan.
// `roomFallback` dipakai saat item tidak membawa nama ruangan sendiri (mis. di
// modal per-ruangan, ruangannya sudah pasti).
function buildOrderGroups(
  items: (MonitoredInstrument & { room?: string })[],
  roomFallback: string | null = null,
): OrderGroup[] {
  const map = new Map<string, (MonitoredInstrument & { room?: string })[]>()
  for (const r of items) {
    const arr = map.get(r.order_code) ?? []
    arr.push(r)
    map.set(r.order_code, arr)
  }
  return [...map.entries()].map(([order_code, rows]) => {
    const first = rows[0]
    const paket = new Map<string, MonitoredInstrument[]>()
    const satuan: MonitoredInstrument[] = []
    for (const r of rows) {
      if (r.source === "paket") {
        const name = r.package_name ?? "Package"
        const a = paket.get(name) ?? []
        a.push(r)
        paket.set(name, a)
      } else {
        satuan.push(r)
      }
    }
    // Paket dihitung per SET (dari baris permintaan), satuan per UNIT fisik.
    // Semua baris dalam satu grup paket membawa `package_sets` yang sama; bila
    // backend tidak mengirimnya (data lama), set tidak ditampilkan.
    const paketGroups = [...paket.entries()].map(([name, instruments]) => ({
      name,
      sets: instruments.find((i) => i.package_sets != null)?.package_sets ?? 0,
      instruments,
    }))

    return {
      order_code,
      code_transaction: first.code_transaction,
      borrowed_by: first.borrowed_by,
      patient_name: first.patient_name ?? null,
      medical_record_no: first.medical_record_no ?? null,
      room: first.room ?? roomFallback,
      order_date: first.order_date,
      return_plan_date: first.return_plan_date,
      totalQty: rows.reduce((s, r) => s + r.qty, 0),
      satuanQty: satuan.reduce((s, r) => s + r.qty, 0),
      totalSets: paketGroups.reduce((s, g) => s + g.sets, 0),
      paketGroups,
      satuanInstruments: satuan,
    }
  })
}

function MonitoringCssd() {
  const dispatch = useAppDispatch()
  // Data monitoring disimpan di Redux global. Hanya di-fetch saat store masih
  // kosong (mis. halaman di-refresh / dibuka pertama kali), bukan tiap kali
  // berpindah antar halaman.
  // Daftar ruangan LENGKAP (beserta seluruh unit dipinjam) — payload terberat di
  // halaman ini, jadi hanya diambil saat benar-benar dipakai: tab Distribution &
  // Tracking dibuka, atau kartu ruangan diklik.
  const rooms = useAppSelector((s) => s.monitoring.rooms)
  // Kartu "Distribusi per Ruangan" cukup angkanya — endpoint ringkas tersendiri.
  const roomsSummary = useAppSelector((s) => s.monitoring.roomsSummary)
  const incoming = useAppSelector((s) => s.monitoring.incoming)
  // Tab Distribution & Tracking: SATU halaman baris siap pakai dari server —
  // pencarian, rentang tanggal, dan potongan halamannya dikerjakan di sana.
  const tracking = useAppSelector((s) => s.monitoring.tracking)
  const trackingLoading = useAppSelector((s) => s.monitoring.trackingLoading)
  const trackingTotalPages = useAppSelector((s) => s.monitoring.trackingTotalPages)
  const trackingTotalItems = useAppSelector((s) => s.monitoring.trackingTotalItems)
  // Angka ketiga kartu statistik — dihitung di server (paket per set, satuan per
  // unit), bukan dari daftar ruangan yang dimuat penuh.
  const borrowedSummary = useAppSelector((s) => s.monitoring.borrowedSummary)
  // Angka badge tab — count() murni di server, dipakai untuk tab yang datanya
  // memang belum dimuat.
  const counts = useAppSelector((s) => s.monitoring.counts)
  // Badge tab "Distribution & Tracking" — endpoint TERPISAH (tracking-order/counts),
  // dihitung dari jejak waktu order, bukan kolom status.
  const trackingCounts = useAppSelector((s) => s.trackingCount.counts)
  const loading = useAppSelector((s) => s.monitoring.roomsLoading)
  const roomsSummaryLoading = useAppSelector((s) => s.monitoring.roomsSummaryLoading)
  const incomingLoading = useAppSelector((s) => s.monitoring.incomingLoading)
  const roomsLoaded = useAppSelector((s) => s.monitoring.roomsLoaded)
  const readyToDistribute = useAppSelector((s) => s.distribute.items)
  const distributeLoading = useAppSelector((s) => s.distribute.loading)

  // Tab aktif pada kartu Daftar Order — disimpan di URL (?tab=...) agar tetap
  // bertahan saat halaman di-refresh.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<MonitoringTab>(() =>
    parseTab(searchParams.get("tab")),
  )

  // Filter rentang tanggal tab "Distribution & Tracking" — default H-7 s/d hari ini.
  // Dideklarasikan di sini (sebelum efek pemuatan) karena ikut jadi parameter
  // endpoint angka badge.
  const [dateFrom, setDateFrom] = useState(() => daysAgoInput(7))
  const [dateTo, setDateTo] = useState(() => todayInput())

  // Tab & rentang tanggal terkini untuk dibaca listener real-time. Listener-nya
  // sengaja didaftarkan sekali saja; tanpa ref, ia akan memasang ulang langganan
  // Pusher tiap kali filter berubah.
  const activeTabRef = useRef(activeTab)
  const rangeRef = useRef({ from: dateFrom, to: dateTo })
  // Parameter halaman tracking yang sedang tampil — supaya listener bisa menarik
  // ulang HALAMAN YANG SAMA, bukan melompat ke halaman 1. Diisi oleh efek di bawah;
  // `page` & `searchQuery` baru dideklarasikan setelah blok ini.
  const trackingParamsRef = useRef({ page: 1, search: "" })
  useEffect(() => {
    activeTabRef.current = activeTab
    rangeRef.current = { from: dateFrom, to: dateTo }
  }, [activeTab, dateFrom, dateTo])

  // Yang SELALU dimuat saat halaman dibuka hanyalah angka-angkanya: kartu statistik
  // & ringkasan per ruangan. Keduanya endpoint hitung, bukan daftar — jadi ringan.
  useEffect(() => {
    dispatch(fetchBorrowedSummary())
    dispatch(fetchMonitoringRoomsSummary())
  }, [dispatch])

  // Badge tab diambil dari endpoint count() (bukan dari panjang daftar), mengikuti
  // rentang tanggal yang sedang aktif supaya angkanya sama dengan isi daftar.
  useEffect(() => {
    dispatch(fetchMonitoringCounts({ from: dateFrom, to: dateTo }))
    dispatch(fetchTrackingCounts({ from: dateFrom, to: dateTo }))
  }, [dispatch, dateFrom, dateTo])

  // Daftar order dimuat PER TAB — tab yang tidak dibuka tidak pernah ditarik
  // datanya. Grup "Siap Distribusi" tampil terpisah di atas daftar (tidak
  // dipaginasi), jadi ia tetap dimuat sekaligus saat tab dibuka; baris daftarnya
  // sendiri ditarik per halaman oleh efek di bawah (lihat fetchMonitoringTracking).
  useEffect(() => {
    if (activeTab === "masuk") {
      dispatch(fetchMonitoringIncoming())
      return
    }
    dispatch(fetchReadyToDistribute())
  }, [activeTab, dispatch])

  // Real-time: segarkan daftar monitoring/tracking saat ada order baru atau
  // permintaan pinjam-alih masuk — lewat Pusher, tanpa polling. Memakai
  // stopListening (bukan leaveChannel) agar tidak mematikan channel yang juga
  // dipakai AppLayout untuk badge.
  useEffect(() => {
    const echo = getEcho()
    if (!echo) return
    const onOrderSubmitted = () => {
      // Daftar "Order Masuk" hanya ditarik ulang bila tabnya memang sedang dibuka;
      // selain itu cukup angkanya yang disegarkan.
      if (activeTabRef.current === "masuk") dispatch(fetchMonitoringIncoming())
      dispatch(fetchMonitoringCounts({ from: rangeRef.current.from, to: rangeRef.current.to }))
      dispatch(fetchIncomingCount()) // badge sidebar ikut sinkron
    }
    const onTransferResponded = () => {
      // Pinjam-alih di-ACC → unit pindah ruangan, nama peminjam terbaru berubah.
      dispatch(fetchBorrowedSummary())
      dispatch(fetchMonitoringRoomsSummary())
      dispatch(fetchMonitoringCounts({ from: rangeRef.current.from, to: rangeRef.current.to }))
      dispatch(fetchTrackingCounts({ from: rangeRef.current.from, to: rangeRef.current.to }))
      if (activeTabRef.current === "distribusi") {
        dispatch(
          fetchMonitoringTracking({
            page: trackingParamsRef.current.page,
            search: trackingParamsRef.current.search,
            from: rangeRef.current.from,
            to: rangeRef.current.to,
          }),
        )
      }
    }
    const ordersChannel = echo.channel("orders")
    ordersChannel.listen(".order.submitted", onOrderSubmitted)
    const transfersChannel = echo.channel("transfers")
    transfersChannel.listen(".transfer.responded", onTransferResponded)
    return () => {
      ordersChannel.stopListening(".order.submitted", onOrderSubmitted)
      transfersChannel.stopListening(".transfer.responded", onTransferResponded)
    }
  }, [dispatch])

  // Muat ulang data setelah aksi yang mengubahnya (terima order, distribusi,
  // pengembalian). Angka statistik & badge selalu disegarkan; daftarnya hanya untuk
  // tab yang sedang dibuka — tab lain akan menariknya sendiri saat dibuka.
  const refreshMonitoring = () => {
    dispatch(fetchBorrowedSummary())
    dispatch(fetchMonitoringRoomsSummary())
    dispatch(fetchMonitoringCounts({ from: dateFrom, to: dateTo }))
    dispatch(fetchTrackingCounts({ from: dateFrom, to: dateTo }))
    if (activeTab === "masuk") {
      dispatch(fetchMonitoringIncoming())
      return
    }
    // Halaman yang sedang dilihat ditarik ulang dengan parameter yang sama.
    dispatch(fetchMonitoringTracking({ page, search: searchQuery, from: dateFrom, to: dateTo }))
    dispatch(fetchReadyToDistribute())
    // Daftar ruangan lengkap hanya menyuplai modal "Alat Dipinjam"; disegarkan
    // hanya kalau modal itu memang pernah dibuka (datanya sudah dimuat).
    if (roomsLoaded) dispatch(fetchMonitoringRooms())
  }

  // Batalkan order masuk (status → dibatalkan). Hanya untuk order yang belum
  // diproses; unit belum dialokasikan jadi tidak ada stok yang perlu dikembalikan.
  async function handleCancelOrder() {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    try {
      await api.put(`/master/orders/${cancelTarget.id}`, { status: "dibatalkan" })
      setCancelTarget(null)
      refreshMonitoring() // order batal hilang dari daftar order masuk
      dispatch(invalidateOrders()) // sinkronkan daftar Order Instrumen
      dispatch(fetchIncomingCount()) // perbarui badge notifikasi sidebar
    } finally {
      setCancelling(false)
    }
  }

  // `*Input` = draft yang sedang diketik/dipilih; nilai di sebelahnya = yang sudah
  // DITERAPKAN. Keduanya baru disamakan saat tombol Cari ditekan — mengetik atau
  // mengubah tanggal tidak menarik data apa pun.
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFromInput, setDateFromInput] = useState(dateFrom)
  const [dateToInput, setDateToInput] = useState(dateTo)
  const [page, setPage] = useState(1)
  // Mode scan pada kolom pencarian Daftar Order: saat aktif, kolom TIDAK bisa
  // diketik manual & tombol Cari nonaktif — kolom hanya menampilkan hasil pindaian
  // barcode (scanner berperilaku sebagai keyboard, ditangkap listener global).
  const [scanArmed, setScanArmed] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const scanBufferRef = useRef("")
  // Notifikasi sementara hasil scan (mis. no. transaksi tidak dikenal).
  const [scanNotice, setScanNotice] = useState<string | null>(null)
  // Tabel utama dikelompokkan per order (peminjam) → di dalamnya per paket / satuan.
  const [expandedMonOrder, setExpandedMonOrder] = useState<Set<string>>(new Set())
  const [expandedMonPaket, setExpandedMonPaket] = useState<Set<string>>(new Set())
  // Status expand untuk kartu order masuk di dalam daftar gabungan.
  const [expandedIncoming, setExpandedIncoming] = useState<Set<string>>(new Set())
  // Status expand + pencarian untuk modal "Alat Dipinjam" per ruangan.
  const [expandedRoomOrder, setExpandedRoomOrder] = useState<Set<string>>(new Set())
  const [expandedRoomPaket, setExpandedRoomPaket] = useState<Set<string>>(new Set())
  const [roomDetailSearch, setRoomDetailSearch] = useState("")

  // Modal "Alat Dipinjam" per ruangan menyimpan ID-nya saja; isinya diambil dari
  // daftar ruangan lengkap yang baru dimuat saat kartunya diklik.
  const [detailRoomId, setDetailRoomId] = useState<number | null>(null)
  const [roomsModalOpen, setRoomsModalOpen] = useState(false)
  const [roomSearch, setRoomSearch] = useState("")

  // Order masuk yang akan dibatalkan (konfirmasi) + status proses pembatalan.
  const [cancelTarget, setCancelTarget] = useState<IncomingOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Riwayat pengembalian (modal detail order yang sudah dikembalikan).
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyOrder, setHistoryOrder] = useState<ReturnOrder | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  // Expand + cache detail (lazy) kartu order dikembalikan di daftar gabungan.
  const [expandedReturned, setExpandedReturned] = useState<Set<string>>(new Set())
  const [returnedDetail, setReturnedDetail] = useState<Record<number, ReturnOrder>>({})
  const [returnedDetailLoading, setReturnedDetailLoading] = useState<Set<number>>(new Set())

  // Terima order masuk: konfirmasi → alokasi unit steril (FEFO) → siap distribusi.
  const [processTarget, setProcessTarget] = useState<IncomingOrder | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)

  // Pengembalian: modal dibuka per-order, lalu data order dimuat otomatis (lookup).
  const conditions = useAppSelector((s) => s.conditions.items)
  // Tombol Kondisi Masuk pengembalian: B/KB/H/R → nama kondisi di master.
  const RETURN_CONDITIONS = [
    { code: "B", name: "Baik", label: "Good" },
    { code: "KB", name: "Kurang Baik", label: "Fair" },
    { code: "H", name: "Hilang", label: "Lost" },
    { code: "R", name: "Rusak", label: "Damaged" },
  ]
  const [returnOpen, setReturnOpen] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [returnOrder, setReturnOrder] = useState<ReturnOrder | null>(null)
  const [returnError, setReturnError] = useState<string | null>(null)
  // Berisi USERNAME pengembali terpilih, bukan nama — lihat useUserOptions.
  const [returnedBy, setReturnedBy] = useState("")
  const {
    loading: userLoading,
    nameOf: userNameOf,
    usernameOf: userUsernameOf,
    optionsWith: userOptionsWith,
  } = useUserOptions()
  const [returnDate, setReturnDate] = useState("")
  const [returnCondById, setReturnCondById] = useState<Record<number, string>>({})
  const [returnSaving, setReturnSaving] = useState(false)
  const [returnUnitSearch, setReturnUnitSearch] = useState("")
  // Konfirmasi sebelum simpan: pengembalian tidak bisa diedit / dibatalkan.
  const [confirmReturnOpen, setConfirmReturnOpen] = useState(false)

  // Muat daftar kondisi (pilihan kondisi masuk) hanya saat modal Pengembalian
  // dibuka — bukan saat halaman dimuat — agar tidak mem-fetch sebelum dibutuhkan.
  useEffect(() => {
    if (returnOpen) dispatch(fetchConditions())
  }, [returnOpen, dispatch])

  function openReturn() {
    setReturnOpen(true)
    setReturnOrder(null)
    setReturnError(null)
    setReturnedBy("")
    setReturnDate(todayInput())
    setReturnCondById({})
    setReturnUnitSearch("")
  }

  // Cari order dari kode (nomor order ORD-xxx atau kode unit alat).
  async function runLookup(raw: string) {
    const code = raw.trim()
    if (!code || lookupLoading) return
    setLookupLoading(true)
    setReturnError(null)
    try {
      const res = await api.post("/master/orders/scan", { code })
      const order: ReturnOrder = res.data.data
      if (order.status !== "dipinjam") {
        setReturnOrder(null)
        setReturnError(`Order ${order.code} has status "${order.status}", not a currently borrowed order.`)
      } else {
        setReturnOrder(order)
        setReturnDate(order.return_actual_date?.slice(0, 10) || todayInput())
        // Kolomnya menyimpan NAMA; dicarikan username-nya agar dropdown menampilkan
        // "nama (nopeg)" dan opsinya benar-benar terpilih.
        setReturnedBy(userUsernameOf(order.returned_by ?? order.borrowed_by ?? ""))
      }
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setReturnOrder(null)
      setReturnError(x.response?.data?.message ?? "Order not found.")
    } finally {
      setLookupLoading(false)
    }
  }

  // Buka modal pengembalian langsung untuk satu order (dipicu tombol per-baris).
  function openReturnFor(code: string) {
    openReturn()
    runLookup(code)
  }


  // Kembalikan unit yang kondisi masuknya sudah diisi. Pengembalian bisa dicicil:
  // unit tanpa kondisi masuk dibiarkan (belum kembali) dan bisa dikembalikan nanti.
  // Backend menutup order otomatis saat semua unit sudah kembali.
  async function handleSaveReturns() {
    if (!returnOrder || returnSaving) return
    const pending = returnOrder.items.filter((u) => !u.is_returned)
    if (pending.length === 0) {
      setReturnError("There is no unit left to return.")
      return
    }
    // Hanya unit yang sudah dipilih kondisi masuknya yang dikembalikan kali ini.
    const ready = pending.filter((u) => returnCondById[u.id])
    if (ready.length === 0) {
      setReturnError("Set the incoming condition for at least one unit to return.")
      return
    }
    setReturnSaving(true)
    setReturnError(null)
    try {
      const items = ready.map((u) => ({
        id: u.id,
        is_returned: true,
        condition_in_id: Number(returnCondById[u.id]),
      }))
      const res = await api.put(`/master/orders/${returnOrder.id}`, {
        returned_by: userNameOf(returnedBy).trim() || null,
        return_actual_date: returnDate || null,
        items,
      })
      setReturnOrder(res.data.data)
      setConfirmReturnOpen(false)
      refreshMonitoring() // muat ulang distribusi ruangan & riwayat
      dispatch(invalidateOrders())
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setReturnError(x.response?.data?.message ?? "Failed to save the return.")
      setConfirmReturnOpen(false)
    } finally {
      setReturnSaving(false)
    }
  }

  // Expand kartu order dikembalikan: muat detail unit (lazy) saat pertama dibuka.
  async function toggleReturned(order: ReturnedOrder) {
    const key = String(order.id)
    const willOpen = !expandedReturned.has(key)
    setExpandedReturned((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    if (willOpen && !returnedDetail[order.id]) {
      setReturnedDetailLoading((p) => new Set(p).add(order.id))
      try {
        const res = await api.post("/master/orders/scan", { code: order.code })
        setReturnedDetail((p) => ({ ...p, [order.id]: res.data.data }))
      } finally {
        setReturnedDetailLoading((p) => {
          const n = new Set(p)
          n.delete(order.id)
          return n
        })
      }
    }
  }

  // Buka modal Riwayat Pengembalian untuk order yang sudah dikembalikan
  // (detail unit + kondisi + timeline via scan).
  async function openHistory(code: string) {
    setHistoryOpen(true)
    setHistoryOrder(null)
    setHistoryLoading(true)
    try {
      const res = await api.post("/master/orders/scan", { code })
      setHistoryOrder(res.data.data)
    } catch {
      setHistoryOrder(null)
    } finally {
      setHistoryLoading(false)
    }
  }

  // Terima order masuk: alokasikan unit steril dari gudang (FEFO) & langsung
  // siapkan distribusi (status → digudang). Order tidak lewat Cleaning lagi karena
  // barang yang diorder memang sudah steril.
  async function handleProcess() {
    if (!processTarget || processing) return
    setProcessing(true)
    setProcessError(null)
    try {
      await api.post(`/master/orders/${processTarget.id}/accept-distribution`)
      setProcessTarget(null)
      refreshMonitoring() // order pindah ke Distribution & Tracking
      dispatch(invalidateOrders()) // sinkronkan daftar Order Instrumen
      dispatch(fetchIncomingCount()) // perbarui badge notifikasi sidebar seketika
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setProcessError(e.response?.data?.message ?? "Failed to accept the order.")
    } finally {
      setProcessing(false)
    }
  }

  // Tombol Cari = satu-satunya pemicu: terapkan kata kunci + rentang tanggal, lalu
  // tarik ulang data tab yang sedang dibuka. Perubahan angka badge menyusul sendiri
  // lewat efek yang mengawasi rentang tanggal.
  // Satu halaman tab Distribution & Tracking = satu permintaan. Halaman, kata kunci,
  // dan rentang tanggal semuanya PARAMETER API, jadi berpindah halaman atau menekan
  // Cari otomatis menarik potongan yang tepat dari server — tidak ada lagi seluruh
  // daftar yang ditarik lalu dipotong di klien.
  useEffect(() => {
    if (activeTab !== "distribusi") return
    dispatch(fetchMonitoringTracking({ page, search: searchQuery, from: dateFrom, to: dateTo }))
  }, [activeTab, dispatch, page, searchQuery, dateFrom, dateTo])

  useEffect(() => {
    trackingParamsRef.current = { page, search: searchQuery }
  }, [page, searchQuery])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (scanArmed) return // mode scan: pencarian manual dimatikan
    applyFilter(searchInput.trim(), dateFromInput, dateToInput)
  }

  // Terapkan filter + muat ulang daftar tab aktif. Tab Distribusi tidak perlu
  // dispatch di sini: kata kunci & rentang tanggalnya adalah parameter API, jadi
  // perubahan state-nya sudah memicu efek pemuatan halaman di atas.
  function applyFilter(query: string, from: string, to: string) {
    setSearchQuery(query)
    setDateFrom(from)
    setDateTo(to)
    setPage(1)
    if (activeTab === "masuk") {
      dispatch(fetchMonitoringIncoming())
      return
    }
    dispatch(fetchReadyToDistribute())
  }

  // Reset = kembali ke rentang bawaan (7 hari terakhir) tanpa kata kunci, langsung
  // diterapkan — tombolnya sendiri sudah merupakan aksi.
  function resetFilter() {
    setSearchInput("")
    const from = daysAgoInput(7)
    const to = todayInput()
    setDateFromInput(from)
    setDateToInput(to)
    applyFilter("", from, to)
  }

  // Nyalakan/matikan mode scan. Saat dinyalakan, kolom pencarian dikosongkan dan
  // filter aktif dilepas supaya tampilan tidak menyesatkan.
  function toggleScan() {
    setScanArmed((armed) => {
      const next = !armed
      scanBufferRef.current = ""
      setSearchInput("")
      setScanNotice(null)
      if (next && searchQuery) {
        setSearchQuery("")
        setPage(1)
      }
      return next
    })
  }

  // Hasil pindaian barcode transaksi: order masih dipinjam → buka modal
  // Pengembalian; sudah dikembalikan → buka modal Riwayat. Status lain / kode tidak
  // dikenal → notifikasi, mode scan tetap aktif agar bisa pindai ulang.
  async function runScanReturn(raw: string) {
    const code = raw.trim()
    if (!code || scanLoading) return
    setScanNotice(null)
    setScanLoading(true)
    try {
      const res = await api.post("/master/orders/scan", { code })
      const order: ReturnOrder = res.data.data
      if (order.status === "dipinjam") {
        setScanArmed(false)
        scanBufferRef.current = ""
        setSearchInput("")
        openReturn()
        setReturnOrder(order)
        setReturnDate(order.return_actual_date?.slice(0, 10) || todayInput())
        // Kolomnya menyimpan NAMA; dicarikan username-nya agar dropdown menampilkan
        // "nama (nopeg)" dan opsinya benar-benar terpilih.
        setReturnedBy(userUsernameOf(order.returned_by ?? order.borrowed_by ?? ""))
      } else if (order.status === "dikembalikan") {
        setScanArmed(false)
        scanBufferRef.current = ""
        setSearchInput("")
        setHistoryOpen(true)
        setHistoryLoading(false)
        setHistoryOrder(order)
      } else {
        scanBufferRef.current = ""
        setSearchInput("")
        setScanNotice(`Order ${order.code} has status "${order.status}", not an active order.`)
      }
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      scanBufferRef.current = ""
      setSearchInput("")
      setScanNotice(x.response?.data?.message ?? `Code "${code}" is not recognized.`)
    } finally {
      setScanLoading(false)
    }
  }

  // Notifikasi scan hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!scanNotice) return
    const t = setTimeout(() => setScanNotice(null), 4000)
    return () => clearTimeout(t)
  }, [scanNotice])

  // Tangkap ketikan barcode scanner secara GLOBAL selama mode scan aktif. Kolom
  // pencarian sengaja dikunci (readOnly), jadi karakter ditangkap di sini lalu
  // ditampilkan. Enter (suffix scanner) langsung memproses.
  useEffect(() => {
    if (!scanArmed) return
    function onKey(e: KeyboardEvent) {
      if (scanLoading) return
      if (e.key === "Escape") {
        setScanArmed(false)
        scanBufferRef.current = ""
        setSearchInput("")
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        runScanReturn(scanBufferRef.current)
        return
      }
      if (e.key === "Backspace") {
        scanBufferRef.current = scanBufferRef.current.slice(0, -1)
        setSearchInput(scanBufferRef.current)
        return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        scanBufferRef.current += e.key
        setSearchInput(scanBufferRef.current)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanArmed, scanLoading])

  // Scanner tanpa suffix Enter: proses otomatis saat aliran karakter berhenti ~1 detik.
  useEffect(() => {
    if (!scanArmed) return
    const code = searchInput.trim()
    if (!code) return
    const t = setTimeout(() => runScanReturn(code), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanArmed, searchInput])

  // Kartu "Distribusi per Ruangan" — angkanya langsung dari server (sudah urut
  // terbanyak & hanya ruangan yang sedang meminjam), tanpa memuat daftar unitnya.
  const roomSummary = useMemo(
    () =>
      roomsSummary.map((r) => ({
        id: r.id,
        ruangan: r.name,
        total: r.borrowed_count,
        dipinjam: r.borrowed_count - r.overdue_count,
        terlambat: r.overdue_count,
      })),
    [roomsSummary],
  )
  const visibleRooms = roomSummary.slice(0, 6)

  const q = searchQuery.toLowerCase()

  // Order masuk (belum dipinjam) ikut disaring dengan kata kunci pencarian yang sama.
  const incomingFiltered = useMemo(() => {
    if (!q) return incoming
    return incoming.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        (o.room?.name ?? "").toLowerCase().includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q)),
    )
  }, [incoming, q])

  // Tab "Distribution & Tracking": satu halaman baris dari server — order yang masih
  // dipinjam lebih dulu, lalu riwayat yang sudah dikembalikan. Pencarian, rentang
  // tanggal (dibandingkan dengan tanggal AKTIVITAS TERAKHIR tiap baris), urutan, dan
  // potongan halamannya sudah dikerjakan endpoint monitoring/tracking.
  //
  // Baris "dipinjam" datang RATA lalu dikelompokkan di sini dengan pengelompok yang
  // sama dengan modal per-ruangan — supaya kartu order di kedua tempat identik.
  const distribusiRows = useMemo<CombinedRow[]>(
    () =>
      tracking.flatMap((row): CombinedRow[] => {
        if (row.kind === "returned") return [{ kind: "returned", order: row.order }]
        const group = buildOrderGroups(
          row.instruments.map((i) => ({ ...i, room: i.room ?? undefined })),
        )[0]
        // Order yang seluruh unitnya tidak punya master instrumen tidak bisa
        // digambarkan sebagai kartu — dilewati, bukan dirender kosong.
        return group ? [{ kind: "borrowed", group }] : []
      }),
    [tracking],
  )

  // Order siap distribusi (status digudang) — disaring kata kunci & rentang tanggal
  // yang sama (tanggalnya = saat order diterima CSSD / siap diantar).
  const readyDistributeFiltered = useMemo(
    () =>
      readyToDistribute.filter(
        (o) =>
          inDateRange(o.processed_at, dateFrom, dateTo) &&
          (!q ||
            o.code.toLowerCase().includes(q) ||
            (o.code_transaction ?? "").toLowerCase().includes(q) ||
            (o.borrowed_by ?? "").toLowerCase().includes(q) ||
            (o.room?.name ?? "").toLowerCase().includes(q)),
      ),
    [readyToDistribute, q, dateFrom, dateTo],
  )

  // Jumlah SELURUH baris tab Distribusi (bukan cuma yang tampil di halaman ini) —
  // langsung dari server. "Siap Distribusi" tidak ikut: grup itu tampil terpisah di
  // atas daftar dan tidak dipaginasi.
  const distribusiCount = trackingTotalItems

  // Badge tab = PEKERJAAN YANG BELUM SELESAI saja: order siap distribusi (belum
  // diantar) + order yang sudah diantar tapi belum kembali. Order yang seluruh
  // unitnya sudah dikembalikan tidak dihitung — riwayatnya tetap tampil di daftar,
  // tapi bukan lagi tugas berjalan.
  //
  // Angka tab Distribusi selalu dari endpoint count() TERSENDIRI
  // (tracking-order/counts, sudah mengikuti rentang tanggal): daftarnya dipaginasi
  // server, jadi baris yang tampil hanya satu halaman dan tidak bisa dipakai
  // menghitung totalnya. Penjumlahannya dikerjakan di server (`total`).
  const masukBadge = activeTab === "masuk" ? incomingFiltered.length : counts.masuk
  const distribusiBadge = trackingCounts.total

  const tabCount: Record<MonitoringTab, number> = {
    masuk: incomingFiltered.length,
    distribusi: distribusiCount,
  }

  // Sedang memuat daftar tab yang terbuka — dipakai indikator di kolom cari dan
  // status "Memuat data..." pada daftarnya.
  const listLoading =
    activeTab === "masuk" ? incomingLoading : trackingLoading || distributeLoading

  // Pindah tab → kembali ke halaman 1 & simpan tab ke URL (?tab=...).
  function changeTab(tab: MonitoringTab) {
    setActiveTab(tab)
    setPage(1)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const activeCount = tabCount[activeTab]
  // Tab Masuk masih dipotong di klien; tab Distribusi memakai jumlah halaman dari
  // server — barisnya SUDAH merupakan potongan halaman ini, jadi tidak dipotong lagi.
  const perPage = activeTab === "distribusi" ? TRACKING_PER_PAGE : ITEMS_PER_PAGE
  const totalPages =
    activeTab === "distribusi" ? trackingTotalPages : Math.ceil(activeCount / ITEMS_PER_PAGE)
  const pageStart = (page - 1) * ITEMS_PER_PAGE
  const pagedIncoming = incomingFiltered.slice(pageStart, pageStart + ITEMS_PER_PAGE)
  const pagedDistribusi = distribusiRows

  // Ruangan yang sedang dibuka modalnya — diambil dari daftar ruangan lengkap.
  // `null` selama data itu masih dimuat (lihat openRoomDetail).
  const detailRoom = useMemo(
    () => (detailRoomId === null ? null : (rooms.find((r) => r.id === detailRoomId) ?? null)),
    [rooms, detailRoomId],
  )

  // Modal "Alat Dipinjam" per ruangan: saring lalu kelompokkan dengan pola yang sama.
  const roomOrderGroups = useMemo(() => {
    if (!detailRoom) return []
    const rq = roomDetailSearch.trim().toLowerCase()
    const items = !rq
      ? detailRoom.instruments
      : detailRoom.instruments.filter(
          (i) =>
            (i.borrowed_by ?? "").toLowerCase().includes(rq) ||
            (i.instrument?.name ?? "").toLowerCase().includes(rq) ||
            (i.instrument?.code ?? "").toLowerCase().includes(rq) ||
            (i.package_name ?? "").toLowerCase().includes(rq) ||
            (i.code_transaction ?? "").toLowerCase().includes(rq) ||
            i.order_code.toLowerCase().includes(rq) ||
            i.units.some(
              (u) =>
                (u.code ?? "").toLowerCase().includes(rq) ||
                (u.barcode_no ?? "").toLowerCase().includes(rq),
            ),
        )
    return buildOrderGroups(items, detailRoom.name)
  }, [detailRoom, roomDetailSearch])

  const toggle = (set: (fn: (prev: Set<string>) => Set<string>) => void) => (k: string) =>
    set((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const toggleMonOrder = toggle(setExpandedMonOrder)
  const toggleMonPaket = toggle(setExpandedMonPaket)
  const toggleIncoming = toggle(setExpandedIncoming)
  const toggleRoomOrder = toggle(setExpandedRoomOrder)
  const toggleRoomPaket = toggle(setExpandedRoomPaket)

  // Klik kartu ruangan = aksi yang memicu pemuatan daftar unit dipinjam (payload
  // terberat). Selama belum ada di store, modal menampilkan "Memuat data...".
  function openRoomDetail(roomId: number) {
    setExpandedRoomOrder(new Set())
    setExpandedRoomPaket(new Set())
    setRoomDetailSearch("")
    setDetailRoomId(roomId)
    if (!roomsLoaded) dispatch(fetchMonitoringRooms())
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instrument Distribution Monitoring"
        subtitle="Track instruments currently borrowed by each room"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Ketiga angka dihitung di server (satu permintaan ringkasan), bukan dari
            daftar ruangan yang dimuat penuh lalu dijumlah di klien. */}
        <StatCard title="Instruments Currently Borrowed" value={`${borrowedSummary.borrowed}`} icon={Scissors} />
        <StatCard title="Active Orders" value={`${borrowedSummary.orders}`} icon={ClipboardList} />
        <StatCard
          title="Overdue Instruments"
          value={`${borrowedSummary.overdue}`}
          icon={AlertTriangle}
          positive={false}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Distribution by Room</h2>
        {roomsSummaryLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading data...</div>
        ) : roomSummary.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-gray-400">
              No instrument is currently borrowed.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRooms.map((r) => (
                <RoomDistributionCard
                  key={r.id}
                  ruangan={r.ruangan}
                  total={r.total}
                  dipinjam={r.dipinjam}
                  terlambat={r.terlambat}
                  onClick={() => openRoomDetail(r.id)}
                />
              ))}
            </div>
            {roomSummary.length > 6 && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setRoomSearch("")
                    setRoomsModalOpen(true)
                  }}
                  className="text-sm font-medium text-[#075489] hover:underline"
                >
                  Show all ({roomSummary.length} rooms)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Card className="p-0">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Order List</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Pick a tab: incoming orders, sterilization &amp; packing stage, or already distributed.
            </p>
          </div>
          {/* Tab kategori order — gaya underline (seperti tab Google) */}
          <div className="flex gap-5 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                { key: "masuk", label: "Incoming Orders", count: masukBadge },
                { key: "distribusi", label: "Distribution & Tracking", count: distribusiBadge },
              ] as { key: MonitoringTab; label: string; count: number }[]
            ).map((t) => {
              const active = activeTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => changeTab(t.key)}
                  aria-pressed={active}
                  className={
                    "relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors " +
                    (active
                      ? "border-[#075489] font-semibold text-[#075489]"
                      : "border-transparent font-medium text-gray-500 hover:text-gray-800")
                  }
                >
                  {t.label}
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                      (active ? "bg-[#075489]/10 text-[#075489]" : "bg-gray-100 text-gray-500")
                    }
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Satu baris filter — tata letaknya disamakan dengan halaman Order
              Instrumen: kolom cari melar, rentang tanggal lebar tetap, aksi di ujung. */}
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
          >
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="monitoring-search">Search</Label>
              <div className="relative">
              {listLoading || scanLoading ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#075489] pointer-events-none" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              )}
              <Input
                id="monitoring-search"
                placeholder={
                  scanLoading
                    ? "Searching the database..."
                    : scanArmed
                      ? "Scan mode active — scan the transaction barcode..."
                      : "Search borrower / invoice no. / label barcode..."
                }
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                // Mode scan: kolom hanya menampilkan hasil pindaian, tidak bisa diketik.
                readOnly={scanArmed}
                className={
                  "pl-9 pr-10 " +
                  (scanArmed ? "cursor-not-allowed font-mono tracking-wider bg-gray-50" : "")
                }
                autoComplete="off"
              />
              <button
                type="button"
                onClick={toggleScan}
                title={
                  scanArmed
                    ? "Turn off scan mode (back to manual search)"
                    : "Enable transaction barcode scan mode"
                }
                aria-pressed={scanArmed}
                className={
                  "absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md transition-colors " +
                  (scanArmed ? "bg-[#4ba69d] text-white" : "text-gray-400 hover:bg-gray-100")
                }
              >
                <ScanLine className="h-4 w-4" />
              </button>
              </div>
            </div>

            {/* Rentang tanggal — hanya untuk tab Distribution & Tracking. Tab
                "Order Masuk" sengaja tidak disaring: order yang belum diterima harus
                selalu terlihat, setua apa pun tanggalnya. */}
            {activeTab === "distribusi" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="tracking-date-from">From Date</Label>
                  <Input
                    id="tracking-date-from"
                    type="date"
                    value={dateFromInput}
                    max={dateToInput || undefined}
                    onChange={(e) => setDateFromInput(e.target.value)}
                    className="sm:w-44"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tracking-date-to">To Date</Label>
                  <Input
                    id="tracking-date-to"
                    type="date"
                    value={dateToInput}
                    min={dateFromInput || undefined}
                    onChange={(e) => setDateToInput(e.target.value)}
                    className="sm:w-44"
                  />
                </div>
              </>
            )}

            {/* Aksi — Reset di kiri, Search di kanan sebagai aksi utama. */}
            <div className="flex justify-end gap-2">
              {activeTab === "distribusi" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFilter}
                  className="shrink-0"
                  title="Reset to the last 7 days"
                >
                  Reset
                </Button>
              )}
              <Button
                type="submit"
                disabled={scanArmed}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0"
              >
                Search
              </Button>
            </div>
          </form>

          {scanArmed && (
            <p className="text-xs text-gray-400">
              Scan mode is active: manual search is disabled. Scan a transaction barcode to open
              Return (borrowed order) or History (already returned). Press Esc or click the scan icon
              again to go back to manual search.
            </p>
          )}

          {scanNotice && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{scanNotice}</p>
          )}
        </div>

        {/* Grup "Siap Distribusi" (digudang) — selalu di atas, tidak dipaginasi. */}
        {activeTab === "distribusi" && page === 1 && readyDistributeFiltered.length > 0 && (
          <div className="p-4 pb-0">
            <DistributeReady
              items={readyDistributeFiltered}
              onChanged={() => {
                dispatch(fetchReadyToDistribute())
                refreshMonitoring()
                dispatch(invalidateOrders())
              }}
            />
          </div>
        )}

        {listLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading data...</div>
        ) : activeCount === 0 &&
          !(activeTab === "distribusi" && readyDistributeFiltered.length > 0) ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {searchQuery
              ? "No order matches the search."
              : activeTab === "masuk"
                ? "No incoming order yet."
                : "No order in this date range."}
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {activeTab === "masuk" &&
              pagedIncoming.map((order) => (
                <IncomingOrderCard
                  key={`incoming-${order.id}`}
                  order={order}
                  expanded={expandedIncoming.has(String(order.id))}
                  onToggle={() => toggleIncoming(String(order.id))}
                  onProcess={() => setProcessTarget(order)}
                  onCancel={() => setCancelTarget(order)}
                />
              ))}

            {activeTab === "distribusi" &&
              pagedDistribusi.map((row) =>
                row.kind === "borrowed" ? (
                  <OrderGroupCard
                    key={`borrowed-${row.group.order_code}`}
                    o={row.group}
                    expandedOrder={expandedMonOrder}
                    toggleOrder={toggleMonOrder}
                    expandedPaket={expandedMonPaket}
                    togglePaket={toggleMonPaket}
                    onReturn={openReturnFor}
                  />
                ) : row.kind === "returned" ? (
                  <ReturnedOrderCard
                    key={`returned-${row.order.id}`}
                    order={row.order}
                    expanded={expandedReturned.has(String(row.order.id))}
                    onToggle={() => toggleReturned(row.order)}
                    detail={returnedDetail[row.order.id] ?? null}
                    detailLoading={returnedDetailLoading.has(row.order.id)}
                    onHistory={() => openHistory(row.order.code)}
                  />
                ) : null,
              )}
          </div>
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={activeCount}
          itemsPerPage={perPage}
          onPageChange={setPage}
          labels={{ showing: "Showing", of: "of", items: "items" }}
        />
      </Card>

      {/* Detail unit dipinjam di ruangan terpilih — daftarnya baru diambil saat
          kartu ruangan diklik, jadi bisa sempat menampilkan status memuat. */}
      <Modal
        open={detailRoomId !== null}
        onClose={() => setDetailRoomId(null)}
        title={`Borrowed Instruments — ${detailRoom?.name ?? roomSummary.find((r) => r.id === detailRoomId)?.ruangan ?? ""}`}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setDetailRoomId(null)}>
            Close
          </Button>
        }
      >
        {loading && !detailRoom ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading data...</div>
        ) : !detailRoom || detailRoom.instruments.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            No instrument is currently borrowed in this room.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search borrower, invoice no., label barcode, package, or instrument..."
                value={roomDetailSearch}
                onChange={(e) => setRoomDetailSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {roomOrderGroups.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No instrument matches the search.
              </div>
            ) : (
              <OrderGroupList
                groups={roomOrderGroups}
                expandedOrder={expandedRoomOrder}
                toggleOrder={toggleRoomOrder}
                expandedPaket={expandedRoomPaket}
                togglePaket={toggleRoomPaket}
                showRoom={false}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Semua ruangan */}
      <Modal
        open={roomsModalOpen}
        onClose={() => setRoomsModalOpen(false)}
        title="Distribution by Room"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setRoomsModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search room..."
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {(() => {
            const rs = roomSearch.toLowerCase()
            const filteredRooms = roomSummary.filter((r) => r.ruangan.toLowerCase().includes(rs))
            return filteredRooms.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No room matches the search.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredRooms.map((r) => (
                  <RoomDistributionCard
                    key={r.id}
                    ruangan={r.ruangan}
                    total={r.total}
                    dipinjam={r.dipinjam}
                    terlambat={r.terlambat}
                    onClick={() => {
                      setRoomsModalOpen(false)
                      openRoomDetail(r.id)
                    }}
                  />
                ))}
              </div>
            )
          })()}
        </div>
      </Modal>

      {/* Konfirmasi pembatalan order masuk */}
      <Modal
        open={cancelTarget !== null}
        onClose={cancelling ? () => {} : () => setCancelTarget(null)}
        title="Cancel Order"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Back
            </Button>
            <Button
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling ? "Canceling..." : "Cancel Order"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
            Cancel order{" "}
            <span className="font-semibold text-gray-900">{cancelTarget?.code}</span>
            {cancelTarget?.borrowed_by ? ` (${cancelTarget.borrowed_by})` : ""}? The order will be marked{" "}
            <span className="font-medium">canceled</span> and removed from the incoming order list.
          </p>
        </div>
      </Modal>

      {/* Terima order masuk: detail order + konfirmasi → alokasi unit steril (FEFO) → distribusi */}
      <Modal
        open={processTarget !== null}
        onClose={processing ? () => {} : () => setProcessTarget(null)}
        title={processTarget ? `Accept Order — ${processTarget.code}` : "Accept Order"}
        size="lg"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {processError ? (
              <p className="text-sm text-red-600">{processError}</p>
            ) : (
              <span className="text-xs text-gray-400">
                Sterile units are allocated automatically (FEFO) & the order is ready to distribute.
              </span>
            )}
            <div className="flex shrink-0 justify-end gap-2">
              <Button variant="outline" onClick={() => setProcessTarget(null)} disabled={processing}>
                Cancel
              </Button>
              <Button
                onClick={handleProcess}
                disabled={processing}
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
              >
                {processing ? "Processing..." : "Accept & Prepare Distribution"}
              </Button>
            </div>
          </div>
        }
      >
        {processTarget && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label="Borrowed By" value={processTarget.borrowed_by} />
              <DetailField label="Room / Unit" value={processTarget.room?.name} />
              <DetailField label="Borrow Date" value={formatDate(processTarget.order_date)} />
              <DetailField label="Planned Return" value={formatDate(processTarget.return_plan_date)} />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p>
                <Badge variant={incomingStatusVariant[processTarget.status]}>
                  {incomingStatusLabel[processTarget.status]}
                </Badge>
              </div>
            </div>

            {processTarget.note && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Note</p>
                <p className="text-sm text-gray-700">{processTarget.note}</p>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Requested Items
              </p>
              {processTarget.items.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No requested item.</div>
              ) : (
                <div className="space-y-2">
                  {processTarget.items.map((it, idx) => (
                    <IncomingItemRow key={idx} item={it} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Pengembalian: order dimuat otomatis dari baris yang dipilih, lalu cek kondisi per unit */}
      <Modal
        open={returnOpen}
        onClose={() => {
          // Jangan ikut tertutup saat Escape ditekan di modal konfirmasi.
          if (confirmReturnOpen || returnSaving) return
          setReturnOpen(false)
        }}
        title="Instrument Return"
        size="lg"
        footer={(() => {
          // Unit yang siap dikembalikan kali ini = belum kembali & kondisi masuk terisi.
          const readyCount = returnOrder
            ? returnOrder.items.filter((u) => !u.is_returned && returnCondById[u.id]).length
            : 0
          return (
            <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              {returnOrder && returnOrder.status !== "dikembalikan" ? (
                <span className="text-xs text-gray-400">
                  {readyCount > 0
                    ? `${readyCount} units ready to return. The rest can be returned later.`
                    : "Set the incoming condition of the returned units, then save."}
                </span>
              ) : (
                <span />
              )}
              <div className="flex shrink-0 justify-end gap-2">
                <Button variant="outline" onClick={() => setReturnOpen(false)}>
                  Close
                </Button>
                {returnOrder && returnOrder.status !== "dikembalikan" && (
                  <Button
                    onClick={() => setConfirmReturnOpen(true)}
                    disabled={returnSaving || readyCount === 0}
                    className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                  >
                    {returnSaving ? "Saving..." : "Save Return"}
                  </Button>
                )}
              </div>
            </div>
          )
        })()}
      >
        <div className="space-y-5">
          {/* Order dimuat otomatis saat modal dibuka — tampilkan progres / penyebab gagalnya. */}
          {!returnOrder && (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-10 text-center">
              {lookupLoading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-[#4ba69d]" />
                  <p className="mt-4 text-sm text-gray-500">Loading order data...</p>
                </>
              ) : (
                <p className="max-w-sm text-sm text-red-600">
                  {returnError ?? "Order data could not be loaded. Close and try again."}
                </p>
              )}
            </div>
          )}

          {returnOrder && (
            <div className="space-y-5">
              {returnError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{returnError}</p>
              )}

              {returnOrder.status === "dikembalikan" && (
                <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                  All units have been returned. The order is closed.
                </p>
              )}

              {/* Ringkasan order: no. order + no. transaksi (INV) */}
              <section className="rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5">
                  <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                    {returnOrder.code}
                  </span>
                  {returnOrder.code_transaction && (
                    <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
                      {returnOrder.code_transaction}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 px-4 py-3 sm:grid-cols-3">
                  <DetailField label="Room / Unit" value={returnOrder.room?.name} />
                  <DetailField label="Borrowed By" value={returnOrder.borrowed_by} />
                  <DetailField
                    label="Period"
                    value={`${formatDate(returnOrder.order_date)} → ${formatDate(returnOrder.return_plan_date)}`}
                  />
                </div>
              </section>

              {/* Riwayat peminjaman: dibuat → diterima CSSD → dipinjam ruangan lain → selesai */}
              <OrderTimeline orderId={returnOrder.id} />

              {/* Data pengembalian */}
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Return Details
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Returned By</Label>
                    <SelectSearch
                      options={userOptionsWith(returnedBy)}
                      value={returnedBy}
                      onChange={setReturnedBy}
                      loading={userLoading}
                      disabled={userLoading || returnOrder.status === "dikembalikan"}
                      placeholder="-- Select Returner --"
                      searchPlaceholder="Search name or staff ID..."
                      loadingText="Loading options..."
                      emptyText="Not found."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="return-date">Return Date</Label>
                    <Input
                      id="return-date"
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      disabled={returnOrder.status === "dikembalikan"}
                    />
                  </div>
                </div>
              </section>

              {/* Daftar unit: dikelompokkan per paket (unit lepas masuk grup "Satuan"),
                  sehingga nama paket cukup tampil sekali di kepala grup. */}
              {(() => {
                const total = returnOrder.items.length
                const back = returnOrder.items.filter((u) => u.is_returned).length
                const q = returnUnitSearch.trim().toLowerCase()
                const visibleUnits = q
                  ? returnOrder.items.filter((u) => {
                      const code = u.instrument_stock?.code?.toLowerCase() ?? ""
                      const name = (u.instrument_name ?? u.instrument_stock?.instrument?.name)?.toLowerCase() ?? ""
                      const pkg = u.package_name?.toLowerCase() ?? ""
                      const barcode = u.barcode_no?.toLowerCase() ?? ""
                      return code.includes(q) || name.includes(q) || pkg.includes(q) || barcode.includes(q)
                    })
                  : returnOrder.items

                const groups = buildReturnGroups(visibleUnits)

                const readonly = returnOrder.status === "dikembalikan"
                const condIdByName = (n: string) => {
                  const c = conditions.find((x) => x.name === n)
                  return c ? String(c.id) : ""
                }
                const baikId = condIdByName("Baik")

                return (
                  <section className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Instrument Units
                        <span className="ml-2 font-normal normal-case tracking-normal text-gray-500">
                          {back}/{total} returned
                        </span>
                      </p>
                      <div className="relative sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <Input
                          placeholder="Search unit (code / name / package / barcode)..."
                          value={returnUnitSearch}
                          onChange={(e) => setReturnUnitSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    {groups.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 py-8 text-center text-sm text-gray-400">
                        No unit matches the search.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {groups.map((g) => {
                          const pending = g.units.filter((u) => !u.is_returned)
                          const allBaik =
                            !!baikId &&
                            pending.length > 0 &&
                            pending.every((u) => returnCondById[u.id] === baikId)
                          return (
                            <div key={g.key} className="overflow-hidden rounded-lg border border-gray-200">
                              {/* Kepala grup: nama paket + progres kembali + aksi massal */}
                              <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  {g.name ? (
                                    <Package className="h-4 w-4 shrink-0 text-[#075489]" />
                                  ) : (
                                    <Wrench className="h-4 w-4 shrink-0 text-gray-400" />
                                  )}
                                  <span className="truncate text-sm font-semibold text-gray-800">
                                    {g.name ?? "Single Instruments"}
                                  </span>
                                  {/* Nomor label fisik (barcode_no) bungkus ini — dasar
                                      pengelompokan, jadi selalu tepat satu per grup. */}
                                  {g.barcodeNo && (
                                    <span className="shrink-0 rounded bg-[#075489]/8 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#075489]">
                                      {g.barcodeNo}
                                    </span>
                                  )}
                                </div>
                                {!readonly && !!baikId && pending.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReturnCondById((prev) => {
                                        const next = { ...prev }
                                        for (const u of pending) next[u.id] = baikId
                                        return next
                                      })
                                    }
                                    disabled={allBaik}
                                    className="shrink-0 text-xs font-medium text-[#075489] hover:underline disabled:text-gray-300 disabled:no-underline"
                                  >
                                    Mark all Good
                                  </button>
                                )}
                              </div>

                              {/* Baris unit: kode + nama, kondisi keluar, kondisi masuk */}
                              <div className="divide-y divide-gray-100">
                                {g.units.map((u) => (
                                  <div
                                    key={u.id}
                                    className="grid grid-cols-1 gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50/60 sm:grid-cols-[minmax(0,1fr)_8rem_13rem] sm:items-center sm:gap-3"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="shrink-0 rounded bg-[#4ba69d]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#4ba69d]">
                                        {u.instrument_stock?.code ?? "—"}
                                      </span>
                                      <span className="truncate text-gray-700">
                                        {(u.instrument_name ?? u.instrument_stock?.instrument?.name) ?? (
                                          <span className="text-xs text-gray-400">—</span>
                                        )}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 text-gray-700">
                                      <span className="text-xs text-gray-400 sm:hidden">
                                        Condition out:
                                      </span>
                                      {u.condition_out?.name ?? (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </div>

                                    {u.is_returned ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-gray-400 sm:hidden">
                                          Condition in:
                                        </span>
                                        <span className="text-gray-700">
                                          {u.condition_in?.name ?? (
                                            <span className="text-xs text-gray-400">—</span>
                                          )}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1">
                                        {RETURN_CONDITIONS.map((rc) => {
                                          const id = condIdByName(rc.name)
                                          const active = !!id && returnCondById[u.id] === id
                                          return (
                                            <button
                                              key={rc.code}
                                              type="button"
                                              disabled={!id}
                                              title={active ? `${rc.label} — click again to clear` : rc.label}
                                              // Klik tombol yang sedang aktif = batalkan pilihan (salah pencet).
                                              onClick={() =>
                                                setReturnCondById((prev) => {
                                                  const next = { ...prev }
                                                  if (next[u.id] === id) delete next[u.id]
                                                  else next[u.id] = id
                                                  return next
                                                })
                                              }
                                              className={
                                                "h-7 flex-1 rounded-md border text-xs font-semibold transition-colors disabled:opacity-40 " +
                                                (active
                                                  ? "border-[#075489] bg-[#075489] text-white"
                                                  : "border-gray-300 text-gray-600 hover:bg-gray-100")
                                              }
                                            >
                                              {rc.code}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              })()}
            </div>
          )}
        </div>
      </Modal>

      {/* Konfirmasi simpan pengembalian — data tidak bisa diedit / dibatalkan setelah disimpan */}
      <Modal
        open={confirmReturnOpen}
        onClose={returnSaving ? () => {} : () => setConfirmReturnOpen(false)}
        title="Confirm Return"
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmReturnOpen(false)}
              disabled={returnSaving}
            >
              Review Again
            </Button>
            <Button
              onClick={handleSaveReturns}
              disabled={returnSaving}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {returnSaving ? "Saving..." : "Yes, Save Return"}
            </Button>
          </>
        }
      >
        {returnOrder &&
          (() => {
            const pending = returnOrder.items.filter((u) => !u.is_returned)
            const ready = pending.filter((u) => returnCondById[u.id])
            const willClose = ready.length === pending.length
            // Rekap jumlah unit per kondisi masuk yang dipilih.
            const recap = RETURN_CONDITIONS.map((rc) => {
              const cond = conditions.find((c) => c.name === rc.name)
              const id = cond ? String(cond.id) : ""
              return {
                name: rc.label,
                count: id ? ready.filter((u) => returnCondById[u.id] === id).length : 0,
              }
            }).filter((r) => r.count > 0)

            return (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <p className="pt-1 text-sm leading-relaxed text-gray-600">
                    Make sure the incoming condition of each unit is correct. Once saved, the
                    return data <span className="font-semibold text-gray-900">cannot be changed or
                    canceled</span>.
                  </p>
                </div>

                {recap.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {recap.map((r) => (
                      <span
                        key={r.name}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700"
                      >
                        {r.name}
                        <span className="ml-1.5 font-semibold text-[#075489]">{r.count}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Instrumen yang dikembalikan kali ini, lengkap dengan kondisi masuknya. */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Returned ({ready.length})
                  </p>
                  <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                    {ready.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded bg-[#4ba69d]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#4ba69d]">
                            {u.instrument_stock?.code ?? "—"}
                          </span>
                          <span className="truncate text-gray-700">
                            {(u.instrument_name ?? u.instrument_stock?.instrument?.name) ?? "—"}
                          </span>
                          {u.source === "paket" && u.package_name && (
                            <span className="shrink-0 truncate text-xs text-gray-400">
                              · {u.package_name}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-[#075489]">
                          {conditions.find((c) => String(c.id) === returnCondById[u.id])?.name ??
                            "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sisanya tidak ikut disimpan: tetap tercatat dipinjam. */}
                {!willClose && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Not Returned ({pending.length - ready.length})
                      <span className="ml-2 font-normal normal-case tracking-normal text-gray-500">
                        still recorded as borrowed
                      </span>
                    </p>
                    <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/60">
                      {pending
                        .filter((u) => !returnCondById[u.id])
                        .map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 rounded bg-gray-200 px-2 py-0.5 font-mono text-xs font-semibold text-gray-500">
                                {u.instrument_stock?.code ?? "—"}
                              </span>
                              <span className="truncate text-gray-600">
                                {(u.instrument_name ?? u.instrument_stock?.instrument?.name) ?? "—"}
                              </span>
                              {u.source === "paket" && u.package_name && (
                                <span className="shrink-0 truncate text-xs text-gray-400">
                                  · {u.package_name}
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-gray-400">
                              Condition not set
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
      </Modal>

      {/* Riwayat pengembalian (read-only) untuk order yang sudah dikembalikan */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={historyOrder ? `Return History: ${titleCodes(historyOrder)}` : "Return History"}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setHistoryOpen(false)}>
            Close
          </Button>
        }
      >
        {historyLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading history...</div>
        ) : !historyOrder ? (
          <div className="py-10 text-center text-sm text-gray-400">History data not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-2">
              <DetailField label="Order Number" value={historyOrder.code} />
              <DetailField label="Transaction No." value={historyOrder.code_transaction} />
              <DetailField label="Room / Unit" value={historyOrder.room?.name} />
              <DetailField label="Borrowed By" value={historyOrder.borrowed_by} />
              {/* Periode NYATA: tanggal pinjam → tanggal saat CSSD menerima
                  pengembaliannya (return_actual_date), bukan rencana kembali —
                  order ini memang sudah selesai. */}
              <DetailField
                label="Period"
                value={`${formatDate(historyOrder.order_date)} → ${formatDate(historyOrder.return_actual_date)}`}
              />
              <DetailField label="Returned By" value={historyOrder.returned_by} />
            </div>

            {/* Tautan RM pasien (traceability loop) — bila alat sempat didistribusikan ke pasien */}
            {(historyOrder.medical_record_no || historyOrder.patient_name) && (
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:grid-cols-2">
                <DetailField label="Patient MR No." value={historyOrder.medical_record_no} />
                <DetailField label="Patient Name" value={historyOrder.patient_name} />
              </div>
            )}

            {/* Timeline tracking: dibuat → di-ACC → dipindah antar ruangan → dikembalikan */}
            <OrderTimeline orderId={historyOrder.id} />

            {/* Grouping sama seperti Pengembalian: per paket/satuan + header nama &
                barcode_no; read-only (kondisi keluar → masuk + status). */}
            {(() => {
              const groups = buildReturnGroups(historyOrder.items)
              return (
                <div className="space-y-3">
                  {groups.map((g) => (
                    <div key={g.key} className="overflow-hidden rounded-lg border border-gray-200">
                      {/* Kepala grup: nama paket / satuan + barcode_no */}
                      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                        {g.name ? (
                          <Package className="h-4 w-4 shrink-0 text-[#075489]" />
                        ) : (
                          <Wrench className="h-4 w-4 shrink-0 text-gray-400" />
                        )}
                        <span className="truncate text-sm font-semibold text-gray-800">
                          {g.name ?? "Single Instruments"}
                        </span>
                        {/* Nomor label fisik (barcode_no) bungkus ini — dasar
                            pengelompokan, jadi selalu tepat satu per grup. */}
                        {g.barcodeNo && (
                          <span className="shrink-0 rounded bg-[#075489]/8 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#075489]">
                            {g.barcodeNo}
                          </span>
                        )}
                      </div>

                      {/* Baris unit: kode + nama, kondisi keluar → masuk, status */}
                      <div className="divide-y divide-gray-100">
                        {g.units.map((u) => (
                          <div
                            key={u.id}
                            className="grid grid-cols-1 gap-2 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_9rem_9rem_6rem] sm:items-center sm:gap-3"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 rounded bg-[#4ba69d]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#4ba69d]">
                                {u.instrument_stock?.code ?? "—"}
                              </span>
                              <span className="truncate text-gray-700">
                                {u.instrument_name ?? u.instrument_stock?.instrument?.name ?? "—"}
                              </span>
                            </div>
                            <div className="text-gray-700">
                              <span className="text-xs text-gray-400 sm:hidden">Condition out: </span>
                              {u.condition_out?.name ?? <span className="text-xs text-gray-400">—</span>}
                            </div>
                            <div className="text-gray-700">
                              <span className="text-xs text-gray-400 sm:hidden">Condition in: </span>
                              {u.condition_in?.name ?? <span className="text-xs text-gray-400">—</span>}
                            </div>
                            <div>
                              {u.is_returned ? (
                                <Badge variant="success">Returned</Badge>
                              ) : (
                                <Badge variant="warning">Pending</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

    </div>
  )
}

// Bungkus dengan Suspense karena memakai useSearchParams (untuk menyimpan tab di URL).
export default function MonitoringCssdPage() {
  return (
    <Suspense fallback={null}>
      <MonitoringCssd />
    </Suspense>
  )
}

// Daftar order yang sedang dipinjam, dikelompokkan per peminjam → paket / satuan.
// Dipakai oleh tabel utama monitoring dan modal "Alat Dipinjam" per ruangan.
function OrderGroupList({
  groups,
  expandedOrder,
  toggleOrder,
  expandedPaket,
  togglePaket,
  showRoom = true,
}: {
  groups: OrderGroup[]
  expandedOrder: Set<string>
  toggleOrder: (code: string) => void
  expandedPaket: Set<string>
  togglePaket: (key: string) => void
  showRoom?: boolean
}) {
  return (
    <div className="space-y-2">
      {groups.map((o) => (
        <OrderGroupCard
          key={o.order_code}
          o={o}
          expandedOrder={expandedOrder}
          toggleOrder={toggleOrder}
          expandedPaket={expandedPaket}
          togglePaket={togglePaket}
          showRoom={showRoom}
        />
      ))}
    </div>
  )
}

// Satu kartu order yang sedang dipinjam — peminjam, ruangan, periode, lalu paket / satuan.
function OrderGroupCard({
  o,
  expandedOrder,
  toggleOrder,
  expandedPaket,
  togglePaket,
  onReturn,
  showRoom = true,
}: {
  o: OrderGroup
  expandedOrder: Set<string>
  toggleOrder: (code: string) => void
  expandedPaket: Set<string>
  togglePaket: (key: string) => void
  onReturn?: (orderCode: string) => void
  showRoom?: boolean
}) {
  const orderOpen = expandedOrder.has(o.order_code)
  return (
          <div className={"rounded-lg border border-gray-200 border-l-4 " + STATUS_BORDER.dipinjam}>
            {/* sm:items-center → tombol Pengembalian sejajar tengah kartu, bukan menempel atas */}
            <div className="flex flex-col px-1 sm:flex-row sm:items-center sm:gap-1">
              {/* items-center → keterangan jumlah sejajar tengah, selurus tombol Pengembalian */}
              <button
                type="button"
                onClick={() => toggleOrder(o.order_code)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2.5 text-left"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <ChevronRight
                    className={
                      "mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform " +
                      (orderOpen ? "rotate-90" : "")
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{o.borrowed_by ?? "—"}</span>
                      <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                        {o.code_transaction ?? o.order_code}
                      </span>
                      {isOverdue(o.return_plan_date) && <Badge variant="danger">Overdue</Badge>}
                    </div>
                    <OrderMeta
                      patientName={o.patient_name}
                      medicalRecordNo={o.medical_record_no}
                      room={o.room}
                      borrowDate={o.order_date}
                      returnDate={o.return_plan_date}
                      showRoom={showRoom}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {qtySummary(o.totalSets, o.satuanQty, o.totalQty)}
                </span>
              </button>
              {onReturn && (
                <div className="flex justify-center gap-1.5 border-t border-gray-100 px-2 py-2 sm:shrink-0 sm:items-center sm:border-0 sm:px-0 sm:py-0 sm:pr-1">
                  <button
                    type="button"
                    onClick={() => onReturn(o.order_code)}
                    title="Return this order"
                    className="flex flex-1 items-center justify-center rounded-md border border-[#075489] bg-[#075489] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90 sm:flex-none"
                  >
                    Return
                  </button>
                </div>
              )}
            </div>

            {/* Level 2: rincian per BUNGKUS (nomor label kemasan) — satu label = satu
                bungkus = satu set, jadi paket 2 set tampil sebagai 2 baris yang
                masing-masing bisa dibuka untuk melihat instrumen di dalamnya. */}
            {orderOpen && (
              <div className="space-y-2 border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
                {buildLabelGroups([
                  ...o.paketGroups.flatMap((g) => g.instruments),
                  ...o.satuanInstruments,
                ]).map((g) => {
                  const key = `${o.order_code}::${g.key}`
                  const groupOpen = expandedPaket.has(key)
                  const isPaket = g.source === "paket"
                  return (
                    <div key={key} className="rounded-lg border border-gray-200 bg-white">
                      <button
                        type="button"
                        onClick={() => togglePaket(key)}
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left"
                      >
                        <ChevronRight
                          className={
                            "h-4 w-4 shrink-0 text-gray-400 transition-transform " +
                            (groupOpen ? "rotate-90" : "")
                          }
                        />
                        <Badge variant={isPaket ? "info" : "default"}>
                          {isPaket ? "Package" : "Single"}
                        </Badge>
                        <span className="truncate text-sm font-medium text-gray-800">{g.name}</span>
                        {g.barcodeNo ? (
                          <span className="shrink-0 rounded bg-[#075489]/8 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#075489]">
                            {g.barcodeNo}
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-gray-400">no label</span>
                        )}
                        <span className="ml-auto shrink-0 text-xs text-gray-500">
                          {g.units.length} instruments
                        </span>
                      </button>

                      {groupOpen && (
                        <div className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/60">
                          {g.units.map((u) => (
                            <div
                              key={u.stockId ?? u.code}
                              className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 pl-9"
                            >
                              <span className="shrink-0 rounded bg-[#4ba69d]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#4ba69d]">
                                {u.instrumentCode ?? "—"}
                              </span>
                              <span className="truncate text-sm text-gray-700">
                                {u.instrumentName ?? "—"}
                              </span>
                              {/* Kode unit fisik yang dipinjam. */}
                              <span className="ml-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                                {u.code ?? "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
  )
}

// Satu baris item permintaan order masuk. Untuk item paket, ikut menampilkan
// rincian instrumen di dalam satu paket (komposisi katalog).
function IncomingItemRow({ item }: { item: IncomingItem }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={item.type === "paket" ? "info" : "default"}>
            {item.type === "paket" ? "Package" : "Single"}
          </Badge>
          <span className="truncate text-sm font-medium text-gray-800">{item.name}</span>
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {item.quantity} {item.type === "paket" ? "packages" : "units"}
        </span>
      </div>
      {item.type === "paket" && item.contents && item.contents.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Package contents (per package)
          </p>
          {item.contents.map((c, ci) => (
            <div key={ci} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-gray-600">
                {c.code ? (
                  <span className="shrink-0 font-mono text-[#4ba69d]">{c.code}</span>
                ) : (
                  <span className="shrink-0 text-gray-400">—</span>
                )}
                <span className="truncate">{c.instrument}</span>
              </span>
              <span className="shrink-0 text-gray-400">×{c.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Satu kartu order masuk (belum dipinjam) — tampil di tab Order Masuk, dengan
// tombol Proses dan Batal. Bisa di-expand untuk lihat permintaan. Detail lengkap
// ditampilkan di dalam modal Proses.
function IncomingOrderCard({
  order,
  expanded,
  onToggle,
  onProcess,
  onCancel,
}: {
  order: IncomingOrder
  expanded: boolean
  onToggle: () => void
  onProcess: () => void
  onCancel: () => void
}) {
  return (
    <div
      className={
        "rounded-lg border border-gray-200 border-l-4 " +
        (STATUS_BORDER[order.status] ?? "border-l-gray-300")
      }
    >
      <div className="flex flex-col px-1 sm:flex-row sm:items-center sm:gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start justify-between gap-2 px-2 py-2.5 text-left"
        >
          <div className="flex min-w-0 items-start gap-2">
            <ChevronRight
              className={
                "mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform " +
                (expanded ? "rotate-90" : "")
              }
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{order.borrowed_by ?? "—"}</span>
                <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                  {order.code}
                </span>
                {isOverdue(order.return_plan_date) && <Badge variant="danger">Overdue</Badge>}
              </div>
              <OrderMeta
                patientName={order.patient_name}
                medicalRecordNo={order.medical_record_no}
                room={order.room?.name ?? null}
                borrowDate={order.order_date}
                returnDate={order.return_plan_date}
              />
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1.5 border-t border-gray-100 px-2 py-2 sm:shrink-0 sm:justify-end sm:border-0 sm:px-0 sm:py-0 sm:pr-1">
          <button
            type="button"
            onClick={onProcess}
            className="flex-1 rounded-md border border-[#4ba69d] bg-[#4ba69d] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4ba69d]/90 sm:flex-none sm:px-2 sm:py-1"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 sm:flex-none sm:px-2 sm:py-1"
          >
            Reject
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-1.5 border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
          {order.items.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-400">No requested item.</p>
          ) : (
            order.items.map((it, idx) => <IncomingItemRow key={idx} item={it} />)
          )}
        </div>
      )}
    </div>
  )
}

// Satu kartu order yang sudah dikembalikan (riwayat) — tampilan disamakan dengan
// kartu order aktif: putih, ada chevron, dan bisa di-expand menampilkan rincian
// unit (kondisi keluar → masuk). Detail dimuat lazy saat pertama dibuka.
function ReturnedOrderCard({
  order,
  expanded,
  onToggle,
  detail,
  detailLoading,
  onHistory,
}: {
  order: ReturnedOrder
  expanded: boolean
  onToggle: () => void
  detail: ReturnOrder | null
  detailLoading: boolean
  onHistory: () => void
}) {
  return (
    <div className={"rounded-lg border border-gray-200 border-l-4 " + STATUS_BORDER.dikembalikan}>
      {/* sm:items-center → tombol Riwayat sejajar tengah kartu, bukan menempel atas */}
      <div className="flex flex-col px-1 sm:flex-row sm:items-center sm:gap-1">
        {/* items-center → keterangan jumlah sejajar tengah, selurus tombol Riwayat */}
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2.5 text-left"
        >
          <div className="flex min-w-0 items-start gap-2">
            <ChevronRight
              className={
                "mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform " +
                (expanded ? "rotate-90" : "")
              }
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{order.borrowed_by ?? "—"}</span>
                <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                  {order.code_transaction ?? order.code}
                </span>
              </div>
              <OrderMeta
                patientName={order.patient_name}
                medicalRecordNo={order.medical_record_no}
                room={order.room?.name ?? null}
                borrowDate={order.order_date}
                returnLabel="Returned"
                returnDate={order.returned_at}
              />
            </div>
          </div>
          {/* Aturan yang sama dengan kartu order aktif: paket per SET, satuan per UNIT. */}
          <span className="shrink-0 text-xs text-gray-500">
            {qtySummary(order.total_sets, order.total_satuan, order.total_units)}
          </span>
        </button>
        <div className="flex justify-center border-t border-gray-100 px-2 py-2 sm:shrink-0 sm:items-center sm:border-0 sm:px-0 sm:py-0 sm:pr-1">
          <button
            type="button"
            onClick={onHistory}
            title="Borrowing history"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#075489] px-4 py-1.5 text-xs font-medium text-[#075489] hover:bg-[#075489]/10 sm:flex-none"
          >
            <History className="h-4 w-4" />
            History
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
          {detailLoading || !detail ? (
            <p className="py-2 text-center text-xs text-gray-400">Loading details...</p>
          ) : (
            <ReturnedUnitsDetail order={detail} />
          )}
        </div>
      )}
    </div>
  )
}

// Rincian unit order dikembalikan — dikelompokkan per BUNGKUS (nomor label kemasan),
// sama seperti modal Pengembalian & Riwayat: paket 2 set tampil sebagai 2 kartu.
function ReturnedUnitsDetail({ order }: { order: ReturnOrder }) {
  if (order.items.length === 0) {
    return <p className="py-2 text-center text-xs text-gray-400">No unit.</p>
  }
  return (
    <>
      {buildReturnGroups(order.items).map((g) => (
        <div key={g.key} className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Badge variant={g.name ? "info" : "default"}>{g.name ? "Package" : "Single"}</Badge>
            <span className="truncate text-sm font-medium text-gray-800">
              {g.name ?? "Single Instruments"}
            </span>
            {g.barcodeNo && (
              <span className="shrink-0 rounded bg-[#075489]/8 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#075489]">
                {g.barcodeNo}
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-gray-500">{g.units.length} instruments</span>
          </div>
          <div className="divide-y divide-gray-50">
            {g.units.map((u) => (
              <ReturnedUnitRow key={u.id} unit={u} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

// Satu baris unit pada rincian order dikembalikan: kode + nama + kondisi keluar → masuk.
// Jenis (paket/satuan) sudah ditandai di kepala grupnya, jadi baris ini tanpa badge.
function ReturnedUnitRow({ unit }: { unit: ReturnUnit }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2">
      {/* Kiri: identitas unit (kode + nama) */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
          {unit.instrument_stock?.code ?? "—"}
        </span>
        <span className="truncate text-sm text-gray-700">{unit.instrument_name ?? unit.instrument_stock?.instrument?.name ?? "—"}</span>
      </div>
      {/* Kanan: kondisi keluar → masuk (turun ke baris bawah bila sempit) */}
      <span className="flex items-center gap-1.5 text-xs text-gray-500">
        <span>{unit.condition_out?.name ?? "—"}</span>
        <span className="text-gray-300">→</span>
        <span className="font-medium text-gray-700">{unit.condition_in?.name ?? "—"}</span>
      </span>
    </div>
  )
}


function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {value ? (
        <p className="text-sm text-gray-800">{value}</p>
      ) : (
        <span className="text-gray-400 text-xs">—</span>
      )}
    </div>
  )
}

// Timeline tracking order: dibuat → diterima CSSD → dipinjam ruangan lain → selesai.
// Dipakai di modal Riwayat Pengembalian & modal Pengembalian (detail order aktif).

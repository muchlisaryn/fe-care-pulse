"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Search,
  Package,
  ArrowLeftRight,
  AlertTriangle,
  ScanLine,
  Undo2,
  ChevronRight,
  History,
  Loader2,
  Wrench,
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
import { OrderTimeline, type TimelineEvent } from "@/components/molecules/OrderTimeline"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { invalidateOrders } from "@/lib/store/slices/orderSlice"
import { fetchIncomingCount } from "@/lib/store/slices/notifSlice"
import { fetchConditions } from "@/lib/store/slices/conditionSlice"
import {
  fetchMonitoringRooms,
  fetchMonitoringIncoming,
  fetchMonitoringReturned,
  type MonitoredInstrument,
  type MonitoredRoom,
  type IncomingStatus,
  type IncomingItem,
  type IncomingOrder,
  type ReturnedOrder,
} from "@/lib/store/slices/monitoringSlice"
import { fetchReadyToDistribute } from "@/lib/store/slices/distributeSlice"
import { DistributeReady } from "@/components/molecules/DistributeReady"
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

const ITEMS_PER_PAGE = 20

// Tipe data monitoring (MonitoredRoom, IncomingOrder, ReturnedOrder, dll.)
// kini tinggal di lib/store/slices/monitoringSlice dan di-impor di atas.

// Baris tabel = grup katalog + nama ruangannya.
type Row = MonitoredInstrument & { room: string }

const incomingStatusLabel: Record<IncomingStatus, string> = {
  diajukan: "Diajukan",
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

// Order + unit hasil scan untuk pengembalian.
type ReturnUnit = {
  id: number
  source: "satuan" | "paket"
  package_name: string | null
  is_returned: boolean
  /** Kode batch produksi (PRD-...) — label pada bungkus steril unit ini. */
  production_code: string | null
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
  timeline?: TimelineEvent[]
}

// Kode untuk judul modal: no. order + no. transaksi. INV baru terbit saat order
// diproses CSSD, jadi bisa saja belum ada.
function titleCodes(order: ReturnOrder) {
  return order.code_transaction ? `${order.code} (${order.code_transaction})` : order.code
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
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

// Grup tampilan: per order (peminjam) → di dalamnya per paket / satuan.
type OrderGroup = {
  order_code: string
  code_transaction: string | null
  borrowed_by: string | null
  room: string | null
  order_date: string | null
  return_plan_date: string | null
  totalQty: number
  paketGroups: { name: string; instruments: MonitoredInstrument[] }[]
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
        const name = r.package_name ?? "Paket"
        const a = paket.get(name) ?? []
        a.push(r)
        paket.set(name, a)
      } else {
        satuan.push(r)
      }
    }
    return {
      order_code,
      code_transaction: first.code_transaction,
      borrowed_by: first.borrowed_by,
      room: first.room ?? roomFallback,
      order_date: first.order_date,
      return_plan_date: first.return_plan_date,
      totalQty: rows.reduce((s, r) => s + r.qty, 0),
      paketGroups: [...paket.entries()].map(([name, instruments]) => ({ name, instruments })),
      satuanInstruments: satuan,
    }
  })
}

function MonitoringCssd() {
  const dispatch = useAppDispatch()
  // Data monitoring disimpan di Redux global. Hanya di-fetch saat store masih
  // kosong (mis. halaman di-refresh / dibuka pertama kali), bukan tiap kali
  // berpindah antar halaman.
  const rooms = useAppSelector((s) => s.monitoring.rooms)
  const incoming = useAppSelector((s) => s.monitoring.incoming)
  const returned = useAppSelector((s) => s.monitoring.returned)
  const loading = useAppSelector((s) => s.monitoring.roomsLoading)
  const incomingLoading = useAppSelector((s) => s.monitoring.incomingLoading)
  const returnedLoading = useAppSelector((s) => s.monitoring.returnedLoading)
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

  // Distribusi per Ruangan (data rooms): pakai cache — hanya di-fetch saat store
  // masih kosong (refresh halaman / pertama dibuka), TIDAK saat kembali ke menu.
  // Refetch hanya dipicu terima pesanan (refreshMonitoring) atau event real-time.
  useEffect(() => {
    if (!roomsLoaded) dispatch(fetchMonitoringRooms())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Daftar Order (order masuk + dikembalikan): selalu muat ulang tiap halaman
  // dibuka, termasuk saat user kembali ke menu ini — dengan loading.
  useEffect(() => {
    dispatch(fetchMonitoringIncoming())
    dispatch(fetchMonitoringReturned())
    dispatch(fetchReadyToDistribute())
  }, [dispatch])

  // Real-time: segarkan daftar monitoring/tracking saat ada order baru atau
  // permintaan pinjam-alih masuk — lewat Pusher, tanpa polling. Memakai
  // stopListening (bukan leaveChannel) agar tidak mematikan channel yang juga
  // dipakai AppLayout untuk badge.
  useEffect(() => {
    const echo = getEcho()
    if (!echo) return
    const onOrderSubmitted = () => {
      dispatch(fetchMonitoringIncoming()) // daftar "Order Masuk" muncul seketika
      dispatch(fetchIncomingCount()) // badge sidebar ikut sinkron
    }
    const onTransferResponded = () => {
      // Pinjam-alih di-ACC → unit pindah ruangan, nama peminjam terbaru berubah.
      dispatch(fetchMonitoringRooms())
      dispatch(fetchMonitoringReturned())
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

  // Paksa muat ulang seluruh data monitoring (dipakai setelah proses/pengembalian).
  const refreshMonitoring = () => {
    dispatch(fetchMonitoringRooms())
    dispatch(fetchMonitoringIncoming())
    dispatch(fetchMonitoringReturned())
    dispatch(fetchReadyToDistribute())
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

  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  // Pencarian manual dengan debounce sedang berlangsung (indikator visual).
  const [searching, setSearching] = useState(false)
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

  const [detailRoom, setDetailRoom] = useState<MonitoredRoom | null>(null)
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
    { code: "B", name: "Baik" },
    { code: "KB", name: "Kurang Baik" },
    { code: "H", name: "Hilang" },
    { code: "R", name: "Rusak" },
  ]
  const [returnOpen, setReturnOpen] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [returnOrder, setReturnOrder] = useState<ReturnOrder | null>(null)
  const [returnError, setReturnError] = useState<string | null>(null)
  const [returnedBy, setReturnedBy] = useState("")
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
        setReturnError(`Order ${order.code} berstatus "${order.status}", bukan order yang sedang dipinjam.`)
      } else {
        setReturnOrder(order)
        setReturnDate(order.return_actual_date?.slice(0, 10) || todayInput())
        setReturnedBy(order.returned_by ?? order.borrowed_by ?? "")
      }
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setReturnOrder(null)
      setReturnError(x.response?.data?.message ?? "Order tidak ditemukan.")
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
      setReturnError("Tidak ada unit yang perlu dikembalikan.")
      return
    }
    // Hanya unit yang sudah dipilih kondisi masuknya yang dikembalikan kali ini.
    const ready = pending.filter((u) => returnCondById[u.id])
    if (ready.length === 0) {
      setReturnError("Isi kondisi masuk minimal satu unit untuk dikembalikan.")
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
        returned_by: returnedBy.trim() || null,
        return_actual_date: returnDate || null,
        items,
      })
      setReturnOrder(res.data.data)
      setConfirmReturnOpen(false)
      refreshMonitoring() // muat ulang distribusi ruangan & riwayat
      dispatch(invalidateOrders())
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setReturnError(x.response?.data?.message ?? "Gagal menyimpan pengembalian.")
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
      setProcessError(e.response?.data?.message ?? "Gagal menerima order.")
    } finally {
      setProcessing(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (scanArmed) return // mode scan: pencarian manual dimatikan
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  // Pencarian dengan debounce: setelah berhenti mengetik ~1 detik, terapkan filter.
  // Tidak berlaku saat mode scan — hasil pindaian tidak dipakai sebagai filter.
  useEffect(() => {
    if (scanArmed) return
    const q = searchInput.trim()
    if (q === searchQuery) return
    setSearching(true)
    const t = setTimeout(() => {
      setSearchQuery(q)
      setPage(1)
      setSearching(false)
    }, 1000)
    return () => clearTimeout(t)
  }, [searchInput, searchQuery, scanArmed])

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
        setReturnedBy(order.returned_by ?? order.borrowed_by ?? "")
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
        setScanNotice(`Order ${order.code} berstatus "${order.status}", bukan order aktif.`)
      }
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      scanBufferRef.current = ""
      setSearchInput("")
      setScanNotice(x.response?.data?.message ?? `Kode "${code}" tidak dikenal.`)
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

  // Hanya ruangan yang punya alat dipinjam, urut terbanyak.
  const roomSummary = useMemo(
    () =>
      rooms
        .filter((r) => r.borrowed_count > 0)
        .map((r) => {
          const terlambat = r.instruments
            .filter((i) => isOverdue(i.return_plan_date))
            .reduce((sum, i) => sum + i.qty, 0)
          return {
            room: r,
            ruangan: r.name,
            total: r.borrowed_count,
            dipinjam: r.borrowed_count - terlambat,
            terlambat,
          }
        })
        .sort((a, b) => b.total - a.total),
    [rooms]
  )
  const visibleRooms = roomSummary.slice(0, 6)

  // Ratakan jadi daftar unit untuk tabel.
  const allRows = useMemo<Row[]>(
    () => rooms.flatMap((r) => r.instruments.map((i) => ({ ...i, room: r.name }))),
    [rooms]
  )

  const q = searchQuery.toLowerCase()
  const filtered = useMemo(
    () =>
      allRows.filter(
        (r) =>
          !q ||
          (r.instrument?.code ?? "").toLowerCase().includes(q) ||
          (r.instrument?.name ?? "").toLowerCase().includes(q) ||
          r.units.some((u) => (u.code ?? "").toLowerCase().includes(q)) ||
          r.room.toLowerCase().includes(q) ||
          (r.borrowed_by ?? "").toLowerCase().includes(q) ||
          r.order_code.toLowerCase().includes(q) ||
          (r.code_transaction ?? "").toLowerCase().includes(q)
      ),
    [allRows, q]
  )

  // Tabel utama: kelompokkan baris dipinjam per order (peminjam), lalu per paket / satuan.
  const orderGroups = useMemo(() => buildOrderGroups(filtered), [filtered])

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

  // Order dikembalikan (riwayat) ikut disaring dengan kata kunci yang sama.
  const returnedFiltered = useMemo(() => {
    if (!q) return returned
    return returned.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        (o.code_transaction ?? "").toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        (o.room?.name ?? "").toLowerCase().includes(q),
    )
  }, [returned, q])

  // Tab "Distribution & Tracking": order yang terdistribusi ke ruangan (sedang
  // dipinjam) + riwayat yang sudah dikembalikan.
  const distribusiRows = useMemo<CombinedRow[]>(
    () => [
      ...orderGroups.map((group) => ({ kind: "borrowed" as const, group })),
      ...returnedFiltered.map((order) => ({ kind: "returned" as const, order })),
    ],
    [orderGroups, returnedFiltered],
  )

  // Order siap distribusi (status digudang) — disaring kata kunci yang sama.
  const readyDistributeFiltered = useMemo(() => {
    if (!q) return readyToDistribute
    return readyToDistribute.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        (o.code_transaction ?? "").toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        (o.room?.name ?? "").toLowerCase().includes(q),
    )
  }, [readyToDistribute, q])

  // Jumlah per tab (total) untuk badge angka di label tab.
  const masukCount = incomingFiltered.length
  // Pagination tab Distribusi hanya atas borrowed+returned; "Siap Distribusi"
  // ditampilkan terpisah di atas (tidak dipaginasi).
  const distribusiCount = distribusiRows.length
  const distribusiBadge = distribusiCount + readyDistributeFiltered.length

  const tabCount: Record<MonitoringTab, number> = {
    masuk: masukCount,
    distribusi: distribusiCount,
  }

  // Pindah tab → kembali ke halaman 1 & simpan tab ke URL (?tab=...).
  function changeTab(tab: MonitoringTab) {
    setActiveTab(tab)
    setPage(1)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const activeCount = tabCount[activeTab]
  const totalPages = Math.ceil(activeCount / ITEMS_PER_PAGE)
  const pageStart = (page - 1) * ITEMS_PER_PAGE
  const pagedIncoming = incomingFiltered.slice(pageStart, pageStart + ITEMS_PER_PAGE)
  const pagedDistribusi = distribusiRows.slice(pageStart, pageStart + ITEMS_PER_PAGE)

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
            i.order_code.toLowerCase().includes(rq) ||
            i.units.some((u) => (u.code ?? "").toLowerCase().includes(rq)),
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

  function openRoomDetail(room: MonitoredRoom) {
    setExpandedRoomOrder(new Set())
    setExpandedRoomPaket(new Set())
    setRoomDetailSearch("")
    setDetailRoom(room)
  }

  const totalUnit = allRows.reduce((sum, r) => sum + r.qty, 0)
  const totalOrder = new Set(allRows.map((r) => r.order_code)).size
  const totalTerlambat = allRows
    .filter((r) => isOverdue(r.return_plan_date))
    .reduce((sum, r) => sum + r.qty, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring Distribusi Instrumen"
        subtitle="Pantau instrumen yang sedang dipinjam di tiap ruangan"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Unit Dipinjam" value={`${totalUnit}`} icon={Package} />
        <StatCard title="Order Aktif" value={`${totalOrder}`} icon={ArrowLeftRight} />
        <StatCard title="Unit Terlambat" value={`${totalTerlambat}`} icon={AlertTriangle} positive={false} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Distribusi per Ruangan</h2>
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat data...</div>
        ) : roomSummary.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-gray-400">
              Belum ada instrumen yang sedang dipinjam.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRooms.map((r) => (
                <RoomDistributionCard
                  key={r.room.id}
                  ruangan={r.ruangan}
                  total={r.total}
                  dipinjam={r.dipinjam}
                  terlambat={r.terlambat}
                  onClick={() => openRoomDetail(r.room)}
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
                  Munculkan semua ({roomSummary.length} ruangan)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Card className="p-0">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Daftar Order</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Pilih tab: order masuk, tahap sterilisasi &amp; packing, atau yang sudah terdistribusi.
            </p>
          </div>
          {/* Tab kategori order — gaya underline (seperti tab Google) */}
          <div className="flex gap-5 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                { key: "masuk", label: "Order Masuk", count: masukCount },
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

          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              {searching || scanLoading ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#075489] pointer-events-none" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              )}
              <Input
                id="monitoring-search"
                placeholder={
                  scanLoading
                    ? "Mencari ke database..."
                    : scanArmed
                      ? "Mode scan aktif — pindai barcode transaksi..."
                      : "Cari order / peminjam / instrumen..."
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
                    ? "Matikan mode scan (kembali ke pencarian manual)"
                    : "Aktifkan mode scan barcode transaksi"
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
            <Button
              type="submit"
              disabled={scanArmed}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0"
            >
              Cari
            </Button>
          </form>

          {scanArmed && (
            <p className="text-xs text-gray-400">
              Mode scan aktif: pencarian manual dimatikan. Pindai barcode transaksi untuk membuka
              Pengembalian (order dipinjam) atau Riwayat (order sudah kembali). Tekan Esc atau klik
              ikon scan lagi untuk kembali mencari manual.
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

        {loading || incomingLoading || returnedLoading || distributeLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : activeCount === 0 &&
          !(activeTab === "distribusi" && readyDistributeFiltered.length > 0) ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {searchQuery
              ? "Tidak ada order yang cocok dengan pencarian."
              : activeTab === "masuk"
                ? "Belum ada order masuk."
                : "Belum ada order yang terdistribusi."}
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
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setPage}
        />
      </Card>

      {/* Detail unit dipinjam di ruangan terpilih */}
      <Modal
        open={detailRoom !== null}
        onClose={() => setDetailRoom(null)}
        title={`Alat Dipinjam — ${detailRoom?.name ?? ""}`}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setDetailRoom(null)}>
            Tutup
          </Button>
        }
      >
        {!detailRoom || detailRoom.instruments.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            Tidak ada alat yang sedang dipinjam di ruangan ini.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari peminjam, paket, instrumen, kode unit, atau order..."
                value={roomDetailSearch}
                onChange={(e) => setRoomDetailSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {roomOrderGroups.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Tidak ada alat yang cocok dengan pencarian.
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
        title="Distribusi per Ruangan"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setRoomsModalOpen(false)}>
            Tutup
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Cari ruangan..."
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
                Tidak ada ruangan yang cocok dengan pencarian.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredRooms.map((r) => (
                  <RoomDistributionCard
                    key={r.room.id}
                    ruangan={r.ruangan}
                    total={r.total}
                    dipinjam={r.dipinjam}
                    terlambat={r.terlambat}
                    onClick={() => {
                      setRoomsModalOpen(false)
                      openRoomDetail(r.room)
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
        title="Batalkan Order"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Kembali
            </Button>
            <Button
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling ? "Membatalkan..." : "Batalkan Order"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
            Batalkan order{" "}
            <span className="font-semibold text-gray-900">{cancelTarget?.code}</span>
            {cancelTarget?.borrowed_by ? ` (${cancelTarget.borrowed_by})` : ""}? Order akan ditandai{" "}
            <span className="font-medium">dibatalkan</span> dan hilang dari daftar order masuk.
          </p>
        </div>
      </Modal>

      {/* Terima order masuk: detail order + konfirmasi → alokasi unit steril (FEFO) → distribusi */}
      <Modal
        open={processTarget !== null}
        onClose={processing ? () => {} : () => setProcessTarget(null)}
        title={processTarget ? `Terima Order — ${processTarget.code}` : "Terima Order"}
        size="lg"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {processError ? (
              <p className="text-sm text-red-600">{processError}</p>
            ) : (
              <span className="text-xs text-gray-400">
                Unit steril dialokasikan otomatis (FEFO) & order langsung siap didistribusikan.
              </span>
            )}
            <div className="flex shrink-0 justify-end gap-2">
              <Button variant="outline" onClick={() => setProcessTarget(null)} disabled={processing}>
                Batal
              </Button>
              <Button
                onClick={handleProcess}
                disabled={processing}
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
              >
                {processing ? "Memproses..." : "Terima & Siapkan Distribusi"}
              </Button>
            </div>
          </div>
        }
      >
        {processTarget && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label="Dipinjam Oleh" value={processTarget.borrowed_by} />
              <DetailField label="Ruangan / Unit" value={processTarget.room?.name} />
              <DetailField label="Tanggal Pinjam" value={formatDate(processTarget.order_date)} />
              <DetailField label="Rencana Kembali" value={formatDate(processTarget.return_plan_date)} />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p>
                <Badge variant={incomingStatusVariant[processTarget.status]}>
                  {incomingStatusLabel[processTarget.status]}
                </Badge>
              </div>
            </div>

            {processTarget.note && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Catatan</p>
                <p className="text-sm text-gray-700">{processTarget.note}</p>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Daftar Permintaan
              </p>
              {processTarget.items.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">Tidak ada permintaan.</div>
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
        title="Pengembalian Instrumen"
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
                    ? `${readyCount} unit siap dikembalikan. Sisanya bisa dikembalikan nanti.`
                    : "Isi kondisi masuk unit yang dikembalikan, lalu Simpan."}
                </span>
              ) : (
                <span />
              )}
              <div className="flex shrink-0 justify-end gap-2">
                <Button variant="outline" onClick={() => setReturnOpen(false)}>
                  Tutup
                </Button>
                {returnOrder && returnOrder.status !== "dikembalikan" && (
                  <Button
                    onClick={() => setConfirmReturnOpen(true)}
                    disabled={returnSaving || readyCount === 0}
                    className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                  >
                    {returnSaving ? "Menyimpan..." : "Simpan Pengembalian"}
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
                  <p className="mt-4 text-sm text-gray-500">Memuat data order...</p>
                </>
              ) : (
                <p className="max-w-sm text-sm text-red-600">
                  {returnError ?? "Data order tidak bisa dimuat. Tutup lalu coba lagi."}
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
                  Semua unit sudah dikembalikan. Order ditutup.
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
                  <DetailField label="Ruangan / Unit" value={returnOrder.room?.name} />
                  <DetailField label="Dipinjam Oleh" value={returnOrder.borrowed_by} />
                  <DetailField
                    label="Periode"
                    value={`${formatDate(returnOrder.order_date)} → ${formatDate(returnOrder.return_plan_date)}`}
                  />
                </div>
              </section>

              {/* Riwayat peminjaman: dibuat → diterima CSSD → dipinjam ruangan lain → selesai */}
              <OrderTimeline events={returnOrder.timeline} />

              {/* Data pengembalian */}
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Data Pengembalian
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="return-by">Dikembalikan Oleh</Label>
                    <Input
                      id="return-by"
                      value={returnedBy}
                      onChange={(e) => setReturnedBy(e.target.value)}
                      placeholder="Nama orang yang mengembalikan"
                      disabled={returnOrder.status === "dikembalikan"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="return-date">Tanggal Pengembalian</Label>
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
                      const name = u.instrument_stock?.instrument?.name?.toLowerCase() ?? ""
                      const pkg = u.package_name?.toLowerCase() ?? ""
                      const prod = u.production_code?.toLowerCase() ?? ""
                      return code.includes(q) || name.includes(q) || pkg.includes(q) || prod.includes(q)
                    })
                  : returnOrder.items

                const groupMap = new Map<string, { name: string | null; units: ReturnUnit[] }>()
                for (const u of visibleUnits) {
                  const name = u.source === "paket" ? (u.package_name ?? "Paket") : null
                  const key = name ?? "__satuan__"
                  const g = groupMap.get(key) ?? { name, units: [] }
                  g.units.push(u)
                  groupMap.set(key, g)
                }
                const groups = [...groupMap.values()]

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
                        Unit Instrumen
                        <span className="ml-2 font-normal normal-case tracking-normal text-gray-500">
                          {back}/{total} dikembalikan
                        </span>
                      </p>
                      <div className="relative sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <Input
                          placeholder="Cari unit (kode / nama / paket)..."
                          value={returnUnitSearch}
                          onChange={(e) => setReturnUnitSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    {groups.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 py-8 text-center text-sm text-gray-400">
                        Tidak ada unit yang cocok dengan pencarian.
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
                            <div
                              key={g.name ?? "__satuan__"}
                              className="overflow-hidden rounded-lg border border-gray-200"
                            >
                              {/* Kepala grup: nama paket + progres kembali + aksi massal */}
                              <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  {g.name ? (
                                    <Package className="h-4 w-4 shrink-0 text-[#075489]" />
                                  ) : (
                                    <Wrench className="h-4 w-4 shrink-0 text-gray-400" />
                                  )}
                                  <span className="truncate text-sm font-semibold text-gray-800">
                                    {g.name ?? "Instrumen Satuan"}
                                  </span>
                                  {/* Kode batch produksi = label bungkus steril grup ini
                                      (lebih dari satu bila isinya dari beberapa batch). */}
                                  {[...new Set(g.units.map((u) => u.production_code).filter(Boolean))].map(
                                    (code) => (
                                      <span
                                        key={code}
                                        className="shrink-0 rounded bg-[#075489]/8 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#075489]"
                                      >
                                        {code}
                                      </span>
                                    ),
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
                                    Tandai semua Baik
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
                                        {u.instrument_stock?.instrument?.name ?? (
                                          <span className="text-xs text-gray-400">—</span>
                                        )}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 text-gray-700">
                                      <span className="text-xs text-gray-400 sm:hidden">
                                        Kondisi keluar:
                                      </span>
                                      {u.condition_out?.name ?? (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </div>

                                    {u.is_returned ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-gray-400 sm:hidden">
                                          Kondisi masuk:
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
                                              title={active ? `${rc.name} — klik lagi untuk batal` : rc.name}
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
        title="Konfirmasi Pengembalian"
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmReturnOpen(false)}
              disabled={returnSaving}
            >
              Periksa Lagi
            </Button>
            <Button
              onClick={handleSaveReturns}
              disabled={returnSaving}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {returnSaving ? "Menyimpan..." : "Ya, Simpan Pengembalian"}
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
                name: rc.name,
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
                    Pastikan kondisi masuk tiap unit sudah benar. Setelah disimpan, data
                    pengembalian <span className="font-semibold text-gray-900">tidak bisa diubah
                    atau dibatalkan</span>.
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
                    Dikembalikan ({ready.length})
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
                            {u.instrument_stock?.instrument?.name ?? "—"}
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
                      Belum Dikembalikan ({pending.length - ready.length})
                      <span className="ml-2 font-normal normal-case tracking-normal text-gray-500">
                        tetap tercatat dipinjam
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
                                {u.instrument_stock?.instrument?.name ?? "—"}
                              </span>
                              {u.source === "paket" && u.package_name && (
                                <span className="shrink-0 truncate text-xs text-gray-400">
                                  · {u.package_name}
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-gray-400">
                              Kondisi belum diisi
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
        title={historyOrder ? `Riwayat Pengembalian : ${titleCodes(historyOrder)}` : "Riwayat Pengembalian"}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setHistoryOpen(false)}>
            Tutup
          </Button>
        }
      >
        {historyLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat riwayat...</div>
        ) : !historyOrder ? (
          <div className="py-10 text-center text-sm text-gray-400">Data riwayat tidak ditemukan.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-2">
              <DetailField label="Nomor Order" value={historyOrder.code} />
              <DetailField label="No. Transaksi" value={historyOrder.code_transaction} />
              <DetailField label="Ruangan / Unit" value={historyOrder.room?.name} />
              <DetailField label="Dipinjam Oleh" value={historyOrder.borrowed_by} />
              <DetailField
                label="Periode"
                value={`${formatDate(historyOrder.order_date)} → ${formatDate(historyOrder.return_plan_date)}`}
              />
            </div>

            {/* Tautan RM pasien (traceability loop) — bila alat sempat didistribusikan ke pasien */}
            {(historyOrder.medical_record_no || historyOrder.patient_name) && (
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:grid-cols-3">
                <DetailField label="No. RM Pasien" value={historyOrder.medical_record_no} />
                <DetailField label="Nama Pasien" value={historyOrder.patient_name} />
                <DetailField label="Diterima" value={historyOrder.distributed_to} />
              </div>
            )}

            {/* Timeline tracking: dibuat → di-ACC → dipindah antar ruangan → dikembalikan */}
            <OrderTimeline events={historyOrder.timeline} />

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Unit
                    </th>
                    <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Kondisi Keluar
                    </th>
                    <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Kondisi Masuk
                    </th>
                    <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-28">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historyOrder.items.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
                          {u.instrument_stock?.code ?? "—"}
                        </span>
                        {u.instrument_stock?.instrument?.name && (
                          <span className="ml-2 text-gray-700">{u.instrument_stock.instrument.name}</span>
                        )}
                        {u.source === "paket" && u.package_name && (
                          <span className="ml-2 text-xs text-gray-400">· {u.package_name}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">
                        {u.condition_out?.name ?? <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">
                        {u.condition_in?.name ?? <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {u.is_returned ? (
                          <Badge variant="success">Kembali</Badge>
                        ) : (
                          <Badge variant="warning">Belum</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className="flex flex-col px-1 sm:flex-row sm:items-start sm:gap-1">
              <button
                type="button"
                onClick={() => toggleOrder(o.order_code)}
                className="flex min-w-0 flex-1 items-start justify-between gap-2 px-2 py-2.5 text-left"
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
                      {isOverdue(o.return_plan_date) && <Badge variant="danger">Terlambat</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      {showRoom && <span>Ruangan: {o.room ?? "—"}</span>}
                      <span>Pinjam: {formatDate(o.order_date)}</span>
                      <span>Kembali: {formatDate(o.return_plan_date)}</span>
                    </div>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-gray-500">{o.totalQty} unit</span>
              </button>
              {onReturn && (
                <div className="flex gap-1.5 border-t border-gray-100 px-2 py-2 sm:mt-1.5 sm:shrink-0 sm:border-0 sm:px-0 sm:py-0 sm:pr-1">
                  <button
                    type="button"
                    onClick={() => onReturn(o.order_code)}
                    title="Pengembalian order ini"
                    aria-label="Pengembalian order ini"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90 sm:flex-none sm:px-1.5"
                  >
                    <Undo2 className="h-4 w-4" />
                    <span className="sm:hidden">Kembalikan</span>
                  </button>
                </div>
              )}
            </div>

            {/* Level 2: detail per paket (bisa di-expand) + satuan */}
            {orderOpen && (
              <div className="space-y-2 border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
                {o.paketGroups.map((g) => {
                  const key = `${o.order_code}::${g.name}`
                  const paketOpen = expandedPaket.has(key)
                  const paketQty = g.instruments.reduce((s, i) => s + i.qty, 0)
                  return (
                    <div key={key} className="rounded-lg border border-gray-200 bg-white">
                      <button
                        type="button"
                        onClick={() => togglePaket(key)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={
                              "h-4 w-4 text-gray-400 transition-transform " + (paketOpen ? "rotate-90" : "")
                            }
                          />
                          <Badge variant="info">Paket</Badge>
                          <span className="text-sm font-medium text-gray-800">{g.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">{paketQty} unit</span>
                      </button>

                      {paketOpen && (
                        <div className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/60">
                          {g.instruments.map((i) => (
                            <MonInstrumentRow key={`${g.name}-${i.instrument?.id}`} row={i} indent />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Satuan: per instrumen */}
                {o.satuanInstruments.map((i) => (
                  <div key={`satuan-${i.instrument?.id}`} className="rounded-lg border border-gray-200 bg-white">
                    <MonInstrumentRow row={i} satuan />
                  </div>
                ))}
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
            {item.type === "paket" ? "Paket" : "Satuan"}
          </Badge>
          <span className="truncate text-sm font-medium text-gray-800">{item.name}</span>
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {item.quantity} {item.type === "paket" ? "paket" : "unit"}
        </span>
      </div>
      {item.type === "paket" && item.contents && item.contents.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Isi paket (per paket)
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
                {isOverdue(order.return_plan_date) && <Badge variant="danger">Terlambat</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                <span>Ruangan: {order.room?.name ?? "—"}</span>
                <span>Pinjam: {formatDate(order.order_date)}</span>
                <span>Kembali: {formatDate(order.return_plan_date)}</span>
              </div>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1.5 border-t border-gray-100 px-2 py-2 sm:shrink-0 sm:justify-end sm:border-0 sm:px-0 sm:py-0 sm:pr-1">
          <button
            type="button"
            onClick={onProcess}
            className="flex-1 rounded-md border border-[#4ba69d] bg-[#4ba69d] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4ba69d]/90 sm:flex-none sm:px-2 sm:py-1"
          >
            Terima
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 sm:flex-none sm:px-2 sm:py-1"
          >
            Tolak
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-1.5 border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
          {order.items.length === 0 ? (
            <p className="py-2 text-center text-xs text-gray-400">Tidak ada permintaan.</p>
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
      <div className="flex flex-col px-1 sm:flex-row sm:items-start sm:gap-1">
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
                  {order.code_transaction ?? order.code}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                <span>Ruangan: {order.room?.name ?? "—"}</span>
                <span>Pinjam: {formatDate(order.order_date)}</span>
                <span>Dikembalikan: {formatDate(order.returned_at)}</span>
              </div>
            </div>
          </div>
          <span className="shrink-0 text-xs text-gray-500">{order.total_units} unit</span>
        </button>
        <div className="flex border-t border-gray-100 px-2 py-2 sm:mt-1.5 sm:shrink-0 sm:border-0 sm:px-0 sm:py-0 sm:pr-1">
          <button
            type="button"
            onClick={onHistory}
            title="Riwayat peminjaman"
            aria-label="Riwayat peminjaman"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#075489] px-3 py-1.5 text-xs font-medium text-[#075489] hover:bg-[#075489]/10 sm:flex-none sm:px-1.5"
          >
            <History className="h-4 w-4" />
            <span className="sm:hidden">Riwayat</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
          {detailLoading || !detail ? (
            <p className="py-2 text-center text-xs text-gray-400">Memuat rincian...</p>
          ) : (
            <ReturnedUnitsDetail order={detail} />
          )}
        </div>
      )}
    </div>
  )
}

// Rincian unit order dikembalikan, dikelompokkan per paket / satuan (mirip order aktif).
function ReturnedUnitsDetail({ order }: { order: ReturnOrder }) {
  if (order.items.length === 0) {
    return <p className="py-2 text-center text-xs text-gray-400">Tidak ada unit.</p>
  }
  const paket = new Map<string, ReturnUnit[]>()
  const satuan: ReturnUnit[] = []
  for (const it of order.items) {
    if (it.source === "paket") {
      const name = it.package_name ?? "Paket"
      const arr = paket.get(name) ?? []
      arr.push(it)
      paket.set(name, arr)
    } else {
      satuan.push(it)
    }
  }
  return (
    <>
      {[...paket.entries()].map(([name, units]) => (
        <div key={name} className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Badge variant="info">Paket</Badge>
            <span className="text-sm font-medium text-gray-800">{name}</span>
            <span className="ml-auto text-xs text-gray-500">{units.length} unit</span>
          </div>
          <div className="divide-y divide-gray-50">
            {units.map((u) => (
              <ReturnedUnitRow key={u.id} unit={u} />
            ))}
          </div>
        </div>
      ))}
      {satuan.length > 0 && (
        <div className="divide-y divide-gray-50 rounded-lg border border-gray-200 bg-white">
          {satuan.map((u) => (
            <ReturnedUnitRow key={u.id} unit={u} satuan />
          ))}
        </div>
      )}
    </>
  )
}

// Satu baris unit pada rincian order dikembalikan: kode + nama + kondisi keluar → masuk.
function ReturnedUnitRow({ unit, satuan = false }: { unit: ReturnUnit; satuan?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2">
      {/* Kiri: identitas unit (badge + kode + nama) */}
      <div className="flex min-w-0 items-center gap-2">
        {satuan && <Badge variant="default">Satuan</Badge>}
        <span className="shrink-0 font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
          {unit.instrument_stock?.code ?? "—"}
        </span>
        <span className="truncate text-sm text-gray-700">{unit.instrument_stock?.instrument?.name ?? "—"}</span>
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

// Satu baris instrumen di tabel monitoring: kode + nama + qty + daftar unit.
// `indent` untuk instrumen di dalam grup paket; `satuan` menambahkan badge "Satuan".
function MonInstrumentRow({
  row,
  indent = false,
  satuan = false,
}: {
  row: MonitoredInstrument
  indent?: boolean
  satuan?: boolean
}) {
  const pad = indent ? "pl-6" : ""
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className={"flex min-w-0 items-center gap-2 " + pad}>
          {satuan && <Badge variant="default">Satuan</Badge>}
          <span className="shrink-0 font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
            {row.instrument?.code ?? "—"}
          </span>
          <span className="truncate text-sm text-gray-700">{row.instrument?.name ?? "—"}</span>
        </div>
        <span className="shrink-0 text-xs font-semibold text-gray-600">
          {row.qty} <span className="font-normal text-gray-400">pcs</span>
        </span>
      </div>
      {row.units.length > 0 && (
        <div className={"mt-1.5 flex flex-wrap gap-1.5 " + pad}>
          {row.units.map((u) => (
            <span
              key={u.instrument_stock_id ?? u.code}
              className="font-mono text-[11px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded"
            >
              {u.code ?? "—"}
            </span>
          ))}
        </div>
      )}
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

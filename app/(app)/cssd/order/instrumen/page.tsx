"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search, ChevronRight, ArrowLeftRight, Loader2 } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { OrderTimeline, type TimelineEvent } from "@/components/molecules/OrderTimeline"
import { OrderStatusTracker, OrderStatusBadge } from "@/components/molecules/OrderStatusTracker"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchOrders,
  setOrderSearch,
  setOrderStatus,
  setOrderDateRange,
  setOrderPage,
  invalidateOrders,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@/lib/store/slices/orderSlice"
import {
  fetchOrderTransfers,
  invalidateOrderTransfers,
  type OrderTransfer,
} from "@/lib/store/slices/orderTransferSlice"
import { fetchPendingTransferCount } from "@/lib/store/slices/notifSlice"
import { invalidateMonitoring } from "@/lib/store/slices/monitoringSlice"
import { fetchRooms } from "@/lib/store/slices/roomSlice"
import api from "@/lib/axios"

// Unit yang dipilih untuk dipinjam-alih dari satu order yang sedang dipinjam.
type PinjamUnit = {
  stockId: number
  code: string
  name: string
  source: "satuan" | "paket"
  packageName: string | null
}
type PinjamTarget = {
  fromOrderId: number
  fromOrderCode: string
  label: string
  units: PinjamUnit[]
}

const statusLabel: Record<OrderStatus, string> = {
  diajukan: "Diajukan",
  pencucian: "Sedang Dicuci",
  pengemasan: "Sedang Packaging",
  selesai: "Siap Disterilkan",
  sterilisasi: "Sedang Disterilkan",
  steril: "Steril / Siap Rilis",
  digudang: "Siap Distribusi",
  dipinjam: "Terdistribusi",
  dikembalikan: "Dikembalikan",
  dibatalkan: "Dibatalkan",
}

// Status yang relevan untuk order PEMINJAMAN (alur: diajukan → diterima/siap
// distribusi → terdistribusi → dikembalikan / dibatalkan). Status pipeline produksi
// (pencucian–steril) tidak dipakai order sehingga tidak ditawarkan sebagai filter.
const ORDER_FILTER_STATUSES: OrderStatus[] = [
  "diajukan",
  "digudang",
  "dipinjam",
  "dikembalikan",
  "dibatalkan",
]

// Tombol aksi status berikutnya:
// diajukan → (Terima & Distribusi via Monitoring) → digudang → dipinjam → dikembalikan
// Order minta barang yang sudah steril, jadi langsung disiapkan distribusi (bukan
// lewat pipeline produksi). Di sini hanya order "diajukan" yang masih bisa dibatalkan.
const nextActions: Record<OrderStatus, { label: string; to: OrderStatus; variant: "primary" | "danger" }[]> = {
  diajukan: [
    { label: "Batalkan", to: "dibatalkan", variant: "danger" },
  ],
  pencucian: [],
  pengemasan: [],
  selesai: [],
  sterilisasi: [],
  steril: [],
  digudang: [],
  dipinjam: [],
  dikembalikan: [],
  dibatalkan: [],
}

const dash = <span className="text-gray-400 text-xs">—</span>

// Info permintaan pinjam yang masih menunggu ACC untuk satu unit.
type PendingTransfer = {
  transfer_id: number
  to_room: string | null
  borrowed_by: string | null
  requested_by: string | null
  is_mine: boolean
}

// Satu unit aktif dari order yang sedang dipinjam (dari endpoint borrowable).
type BorrowableUnit = {
  order_item_id: number
  instrument_stock_id: number
  code: string | null
  instrument_name: string | null
  source: "satuan" | "paket"
  package_name: string | null
  pending_transfer: PendingTransfer | null
}

// Satu order milik pihak lain yang sedang dipinjam — sumber untuk Pinjam Instrumen.
type BorrowedOrder = {
  id: number
  code: string
  borrowedBy: string | null
  medicalRecordNo: string | null
  patientName: string | null
  room: { id: number; name: string } | null
  orderDate: string | null
  orderTime: string | null
  returnPlanDate: string | null
  units: BorrowableUnit[]
}

// Order yang sudah diproses (unit fisik sudah dialokasikan) tidak boleh
// dibatalkan/dihapus lagi dari daftar.
const PROCESSED_STATUSES: OrderStatus[] = [
  "pencucian",
  "pengemasan",
  "selesai",
  // Order yang sudah diterima (unit steril dialokasikan) tak boleh dibatalkan lagi.
  "digudang",
  "dipinjam",
  "dikembalikan",
]
const isProcessed = (status: OrderStatus) => PROCESSED_STATUSES.includes(status)

// Kode untuk judul modal detail: no. order + no. invoice. Invoice baru terbit setelah
// order diterima, jadi selama masih "diajukan" cukup no. order — sama seperti kolom
// Kode di daftar.
function detailTitleCodes(order: Order) {
  const invoice = order.status !== "diajukan" ? order.code_transaction : null

  return invoice ? `${order.code} (${invoice})` : order.code
}

function formatDate(value: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

// Tanggal + jam — dipakai untuk waktu diajukan / di-ACC (bisa terjadi di hari yang
// sama, jadi jam penting agar tidak rancu).
function formatDateTime(value: string | null | undefined) {
  if (!value) return null
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

// Ambil waktu sebuah event timeline berdasarkan tipenya (mis. "dibuat" = diajukan,
// "diterima" = di-ACC & dipinjamkan CSSD). Null bila event belum ada.
function timelineTimeOf(timeline: TimelineEvent[] | undefined, type: TimelineEvent["type"]) {
  return timeline?.find((e) => e.type === type)?.created_at ?? null
}

// Jam peminjaman (kolom order_time, format DB "HH:mm:ss") → tampil "HH:mm".
function formatTime(value: string | null) {
  if (!value) return null
  return value.slice(0, 5)
}

// Gabungan tanggal + jam untuk ditampilkan, mis. "08 Jun 2026, 14:30".
function formatDateWithTime(date: string | null, time: string | null) {
  const d = formatDate(date)
  if (!d) return null
  const t = formatTime(time)
  return t ? `${d}, ${t}` : d
}

export default function OrderInstrumenPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, status, dateFrom, dateTo, loading, loaded, dirty } =
    useAppSelector((s) => s.orders)

  // Opsi filter status: "" = semua, lalu tiap status order.
  const statusFilterOptions = [
    { value: "", label: "Semua Status" },
    ...ORDER_FILTER_STATUSES.map((s) => ({ value: s, label: statusLabel[s] })),
  ]

  const [searchInput, setSearchInput] = useState(search)
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [detail, setDetail] = useState<Order | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // Baris permintaan paket yang sedang dibuka (menampilkan isi paket) di modal detail.
  const [expandedReq, setExpandedReq] = useState<Set<number>>(new Set())
  // Paket yang sedang dibuka di tabel Unit Instrumen modal detail.
  const [expandedUnitPaket, setExpandedUnitPaket] = useState<Set<string>>(new Set())
  const [statusBusy, setStatusBusy] = useState(false)

  // Modal "Instrumen Dipinjam": dikelompokkan per order (peminjam + tanggal),
  // lalu di dalamnya per paket / satuan.
  const [borrowedOpen, setBorrowedOpen] = useState(false)
  const [borrowedOrders, setBorrowedOrders] = useState<BorrowedOrder[]>([])
  const [borrowedLoading, setBorrowedLoading] = useState(false)
  const [borrowedSearchInput, setBorrowedSearchInput] = useState("")
  const [borrowedQuery, setBorrowedQuery] = useState("")
  // Order yang sedang dibuka (menampilkan rincian instrumen).
  const [expandedOrder, setExpandedOrder] = useState<Set<number>>(new Set())
  // Paket yang sedang dibuka, dikunci per `${orderId}::${namaPaket}`.
  const [expandedPaket, setExpandedPaket] = useState<Set<string>>(new Set())

  // Form "Pinjam" (pinjam-alih dari peminjam saat ini).
  const rooms = useAppSelector((s) => s.rooms.items)
  const roomOptions = rooms.map((r) => ({ value: String(r.id), label: r.name }))
  const authName = useAppSelector((s) => s.auth.name)
  const [pinjamTarget, setPinjamTarget] = useState<PinjamTarget | null>(null)
  const [pinjamRoomId, setPinjamRoomId] = useState("")
  const [pinjamBorrowedBy, setPinjamBorrowedBy] = useState("")
  // Pinjam-alih bisa untuk pasien berbeda dari order sumber → dicatat per permintaan.
  const [pinjamMedicalRecordNo, setPinjamMedicalRecordNo] = useState("")
  const [pinjamPatientName, setPinjamPatientName] = useState("")
  const [pinjamNote, setPinjamNote] = useState("")
  const [pinjamSaving, setPinjamSaving] = useState(false)
  const [pinjamError, setPinjamError] = useState<string | null>(null)
  const [pinjamSuccess, setPinjamSuccess] = useState(false)

  // Inbox "Permintaan Pinjam": permintaan masuk yang menunggu ACC user ini.
  const transfers = useAppSelector((s) => s.orderTransfers.items)
  const transfersLoading = useAppSelector((s) => s.orderTransfers.loading)
  const pendingTransferCount = useAppSelector((s) => s.notif.pendingTransferCount)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  // Permintaan pinjam (outgoing) yang sedang dibatalkan.
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchOrders())
  }, [loaded, dirty, dispatch])

  // Ambil order yang sedang dipinjam (beserta unit aktif + status request pending)
  // sebagai sumber unit yang bisa diminta. Dipakai saat modal dibuka & setelah
  // mengirim / membatalkan permintaan agar penanda pending ikut diperbarui.
  async function loadBorrowable() {
    setBorrowedLoading(true)
    try {
      const res = await api.get("/master/orders/borrowable")
      const data = res.data.data as {
        id: number
        code: string
        borrowed_by: string | null
        medical_record_no: string | null
        patient_name: string | null
        room: { id: number; name: string } | null
        order_date: string | null
        order_time: string | null
        return_plan_date: string | null
        units: BorrowableUnit[]
      }[]
      setBorrowedOrders(
        data.map((o) => ({
          id: o.id,
          code: o.code,
          borrowedBy: o.borrowed_by,
          medicalRecordNo: o.medical_record_no,
          patientName: o.patient_name,
          room: o.room,
          orderDate: o.order_date,
          orderTime: o.order_time,
          returnPlanDate: o.return_plan_date,
          units: o.units,
        })),
      )
    } finally {
      setBorrowedLoading(false)
    }
  }

  // Saat modal Pinjam Instrumen dibuka: muat daftarnya.
  useEffect(() => {
    if (!borrowedOpen) return
    loadBorrowable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowedOpen])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setOrderSearch(searchInput.trim()))
  }

  // Pencarian otomatis dengan debounce: setelah berhenti mengetik ~450ms, cari
  // ke database (lewat Redux thunk fetchOrders). Tombol "Cari" tetap berfungsi.
  useEffect(() => {
    const q = searchInput.trim()
    if (q === search) return
    const t = setTimeout(() => dispatch(setOrderSearch(q)), 450)
    return () => clearTimeout(t)
  }, [searchInput, search, dispatch])

  function openBorrowed() {
    setBorrowedSearchInput("")
    setBorrowedQuery("")
    setExpandedOrder(new Set())
    setExpandedPaket(new Set())
    setBorrowedOrders([])
    setBorrowedLoading(true)
    setBorrowedOpen(true)
  }

  function handleBorrowedSearch(e: React.FormEvent) {
    e.preventDefault()
    setBorrowedQuery(borrowedSearchInput)
  }

  // Buka form Pinjam untuk sekumpulan unit (satu paket / satu unit satuan) dari
  // sebuah order yang sedang dipinjam pihak lain.
  function openPinjam(
    order: { id: number; code: string; borrowedBy: string | null },
    label: string,
    units: BorrowableUnit[],
  ) {
    // Muat daftar ruangan (untuk pilihan ruangan tujuan) hanya saat form dibuka.
    dispatch(fetchRooms())
    setPinjamTarget({
      fromOrderId: order.id,
      fromOrderCode: order.code,
      label,
      units: units.map((u) => ({
        stockId: u.instrument_stock_id,
        code: u.code ?? "—",
        name: u.instrument_name ?? `Instrumen #${u.instrument_stock_id}`,
        source: u.source,
        packageName: u.package_name,
      })),
    })
    setPinjamRoomId("")
    // Default nama peminjam = user yang sedang login.
    setPinjamBorrowedBy(authName ?? "")
    // Pasien dikosongkan — peminjam baru mengisi pasien tujuan pinjam-alih.
    setPinjamMedicalRecordNo("")
    setPinjamPatientName("")
    setPinjamNote("")
    setPinjamError(null)
    setPinjamSuccess(false)
  }

  // Kirim permintaan pinjam-alih ke peminjam saat ini (menunggu ACC).
  async function handleSubmitPinjam() {
    if (!pinjamTarget || pinjamSaving) return
    if (!pinjamRoomId) {
      setPinjamError("Ruangan tujuan wajib dipilih.")
      return
    }
    if (!pinjamBorrowedBy.trim()) {
      setPinjamError("Nama peminjam wajib diisi.")
      return
    }
    if (!pinjamMedicalRecordNo.trim()) {
      setPinjamError("No. RM pasien wajib diisi.")
      return
    }
    if (!pinjamPatientName.trim()) {
      setPinjamError("Nama pasien wajib diisi.")
      return
    }
    setPinjamSaving(true)
    setPinjamError(null)
    try {
      await api.post("/master/order-transfers", {
        from_order_id: pinjamTarget.fromOrderId,
        to_room_id: Number(pinjamRoomId),
        borrowed_by: pinjamBorrowedBy.trim(),
        medical_record_no: pinjamMedicalRecordNo.trim(),
        patient_name: pinjamPatientName.trim(),
        note: pinjamNote.trim() || null,
        instrument_stock_ids: pinjamTarget.units.map((u) => u.stockId),
      })
      setPinjamSuccess(true)
      loadBorrowable() // tandai unit sebagai sedang menunggu ACC
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setPinjamError(x.response?.data?.message ?? "Gagal mengirim permintaan pinjam.")
    } finally {
      setPinjamSaving(false)
    }
  }

  // Batalkan permintaan pinjam yang masih menunggu ACC (dipicu tombol Batal pada unit).
  async function handleCancelPinjam(transferId: number) {
    if (cancellingId !== null) return
    setCancellingId(transferId)
    try {
      await api.post(`/master/order-transfers/${transferId}/cancel`)
      loadBorrowable()
      dispatch(fetchPendingTransferCount())
    } finally {
      setCancellingId(null)
    }
  }

  // Aksi pada sekumpulan unit (paket/satuan): tombol Pinjam bila belum diminta,
  // tombol Batal bila sudah diminta oleh user ini, atau penanda bila sedang diminta
  // pihak lain — mencegah request dobel atas unit yang sama.
  function pinjamAction(
    order: { id: number; code: string; borrowedBy: string | null },
    label: string,
    units: BorrowableUnit[],
  ) {
    const pendings = units
      .map((u) => u.pending_transfer)
      .filter((p): p is PendingTransfer => !!p)
    const mine = pendings.find((p) => p.is_mine)
    const other = pendings.find((p) => !p.is_mine)

    if (mine) {
      return (
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="warning">
            Menunggu ACC{mine.to_room ? ` → ${mine.to_room}` : ""}
          </Badge>
          <Button
            variant="outline"
            className="h-8 px-3 text-xs border-red-300 text-red-600 hover:bg-red-50"
            disabled={cancellingId === mine.transfer_id}
            onClick={() => handleCancelPinjam(mine.transfer_id)}
          >
            {cancellingId === mine.transfer_id ? "Membatalkan..." : "Batal"}
          </Button>
        </div>
      )
    }
    if (other) {
      return (
        <Badge variant="default">
          Diminta {other.to_room ?? "ruangan lain"}
          {other.requested_by ? ` (${other.requested_by})` : ""}
        </Badge>
      )
    }
    return (
      <Button
        variant="outline"
        className="border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/10 h-8 px-3 text-xs shrink-0"
        onClick={() => openPinjam(order, label, units)}
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Pinjam
      </Button>
    )
  }

  // Buka inbox permintaan pinjam masuk (yang menunggu ACC user ini).
  function openInbox() {
    setInboxOpen(true)
    dispatch(fetchOrderTransfers())
  }

  // ACC / Tolak satu permintaan pinjam.
  async function handleRespond(transfer: OrderTransfer, action: "accept" | "reject") {
    if (actingId !== null) return
    setActingId(transfer.id)
    try {
      await api.post(`/master/order-transfers/${transfer.id}/${action}`)
      dispatch(invalidateOrderTransfers())
      dispatch(fetchOrderTransfers())
      dispatch(fetchPendingTransferCount())
      // ACC memindahkan unit → daftar order & data monitoring (nama peminjam
      // terbaru, distribusi ruangan) ikut berubah.
      if (action === "accept") {
        dispatch(invalidateOrders())
        dispatch(invalidateMonitoring())
      }
    } finally {
      setActingId(null)
    }
  }

  function toggleOrder(id: number) {
    setExpandedOrder((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePaket(key: string) {
    setExpandedPaket((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Bangun tampilan: per order (peminjam + tanggal) → di dalamnya per paket / satuan.
  // Pencarian mencocokkan nama peminjam, nama paket, instrumen, atau kode unit.
  const visibleBorrowed = useMemo(() => {
    const q = borrowedQuery.trim().toLowerCase()
    const unitMatch = (u: BorrowableUnit) =>
      (u.code ?? "").toLowerCase().includes(q) ||
      (u.instrument_name ?? "").toLowerCase().includes(q) ||
      (u.package_name ?? "").toLowerCase().includes(q)

    const out = []
    for (const o of borrowedOrders) {
      const borrowerMatch = !q || (o.borrowedBy ?? "").toLowerCase().includes(q) ||
        (o.room?.name ?? "").toLowerCase().includes(q) ||
        (o.medicalRecordNo ?? "").toLowerCase().includes(q) ||
        (o.patientName ?? "").toLowerCase().includes(q)
      const units = o.units.filter((u) => !q || borrowerMatch || unitMatch(u))
      if (units.length === 0) continue

      const paket = new Map<string, BorrowableUnit[]>()
      const satuan: BorrowableUnit[] = []
      for (const u of units) {
        if (u.source === "paket") {
          const name = u.package_name ?? "Paket"
          const arr = paket.get(name) ?? []
          arr.push(u)
          paket.set(name, arr)
        } else {
          satuan.push(u)
        }
      }

      out.push({
        ...o,
        totalUnits: units.length,
        paketGroups: [...paket.entries()].map(([name, us]) => ({ name, units: us })),
        satuanUnits: satuan,
      })
    }
    return out
  }, [borrowedOrders, borrowedQuery])

  // Buka/tutup rincian isi paket pada baris permintaan di modal detail.
  function toggleReq(id: number) {
    setExpandedReq((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleUnitPaket(name: string) {
    setExpandedUnitPaket((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Kelompokkan unit instrumen di modal detail: paket → per nama paket, satuan → per unit.
  const detailUnitGroups = useMemo(() => {
    const items = detail?.items ?? []
    const paket = new Map<string, OrderItem[]>()
    const satuan: OrderItem[] = []
    for (const it of items) {
      if (it.source === "paket") {
        const name = it.package_name ?? "Paket"
        const arr = paket.get(name) ?? []
        arr.push(it)
        paket.set(name, arr)
      } else {
        satuan.push(it)
      }
    }
    return {
      paketGroups: [...paket.entries()].map(([name, units]) => ({ name, units })),
      satuanUnits: satuan,
    }
  }, [detail])

  async function openDetail(row: Order) {
    setDetail(row)
    setExpandedReq(new Set())
    setExpandedUnitPaket(new Set())
    setDetailLoading(true)
    try {
      const res = await api.get(`/master/orders/${row.id}`)
      setDetail(res.data.data)
    } finally {
      setDetailLoading(false)
    }
  }

  // Ubah status order (mis. Pinjamkan / Batalkan). Pengembalian instrumen tidak
  // dilakukan dari sini — detail order bersifat lihat-saja untuk instrumennya.
  async function handleChangeStatus(to: OrderStatus) {
    if (!detail || statusBusy) return
    setStatusBusy(true)
    try {
      const res = await api.put(`/master/orders/${detail.id}`, { status: to })
      setDetail(res.data.data)
      dispatch(invalidateOrders())
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/orders/${deleteTarget.id}`)
      dispatch(invalidateOrders())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<Order>[] = [
    {
      header: "Tanggal dan Waktu Pinjam",
      cell: (row) => {
        const f = formatDateWithTime(row.order_date, row.order_time)
        return f ? <span className="text-sm text-gray-600">{f}</span> : dash
      },
    },
    {
      header: "Kode",
      // No. invoice (code_transaction) baru terbit setelah order diterima. Selama
      // belum ada, tampilkan no. order sebagai gantinya — hanya satu kode per baris.
      cell: (row) => {
        const invoice = row.status !== "diajukan" ? row.code_transaction : null
        return invoice ? (
          <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-1 rounded w-fit inline-block">
            {invoice}
          </span>
        ) : (
          <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded w-fit inline-block">
            {row.code}
          </span>
        )
      },
      className: "w-36",
    },
    {
      header: "Dipinjam Oleh",
      cell: (row) => {
        const name = row.borrowed_by ?? row.user?.name
        return name ? <span className="font-medium text-gray-900">{name}</span> : dash
      },
    },
    {
      header: "Ruangan",
      cell: (row) =>
        row.room?.name ? <span className="text-gray-700">{row.room.name}</span> : dash,
    },
    {
      header: "Instrumen",
      cell: (row) => <span className="text-gray-700">{row.items_count ?? row.items?.length ?? 0} unit</span>,
      className: "w-20",
    },
    {
      header: "Status",
      cell: (row) => <OrderStatusBadge status={row.status} />,
      className: "w-40",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Order Instrumen" subtitle="Daftar order peminjaman instrumen CSSD" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={openInbox}
            className="relative border-[#075489] text-[#075489] hover:bg-[#075489]/10"
          >
            Permintaan Pinjam
            {pendingTransferCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                {pendingTransferCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={openBorrowed}
            className="border-[#075489] text-[#075489] hover:bg-[#075489]/10"
          >
            Pinjam Instrumen
          </Button>
          <Link href="/cssd/order/instrumen/tambah">
            <Button className="w-full bg-[#075489] hover:bg-[#075489]/90 text-white sm:w-auto">
              Buat Order
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
          >
            {/* Pencarian */}
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="order-search">Cari</Label>
              <div className="relative">
                {loading ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#075489] pointer-events-none" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                )}
                <Input
                  id="order-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className={"pl-9 " + (loading ? "cursor-not-allowed" : "")}
                />
              </div>
            </div>

            {/* Status */}
            <div className="w-full space-y-1.5 sm:w-48">
              <Label>Status</Label>
              <SelectSearch
                options={statusFilterOptions}
                value={status}
                onChange={(v) => dispatch(setOrderStatus(v as OrderStatus | ""))}
                placeholder="Semua Status"
              />
            </div>

            {/* Rentang tanggal pinjam */}
            <div className="space-y-1.5">
              <Label htmlFor="order-date-from">Dari Tanggal</Label>
              <Input
                id="order-date-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => dispatch(setOrderDateRange({ from: e.target.value, to: dateTo }))}
                className="sm:w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-date-to">Sampai Tanggal</Label>
              <Input
                id="order-date-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => dispatch(setOrderDateRange({ from: dateFrom, to: e.target.value }))}
                className="sm:w-44"
              />
            </div>

            {/* Aksi */}
            <div className="flex gap-2">
              <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
                Cari
              </Button>
              {(dateFrom || dateTo) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => dispatch(setOrderDateRange({ from: "", to: "" }))}
                  className="shrink-0"
                >
                  Reset
                </Button>
              )}
            </div>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            hideRowNumber
            extraActions={[
              {
                label: "Detail",
                onClick: openDetail,
                className: "border-[#075489] text-[#075489] hover:bg-[#075489]/10",
              },
            ]}
            onDelete={(row) => setDeleteTarget(row)}
            canDelete={(row) => !isProcessed(row.status)}
            isRowLoading={(row) => deletingId === row.id}
            emptyMessage="Belum ada order tercatat."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setOrderPage(p))}
        />
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      {/* Pinjam Instrumen — instrumen yang sedang dipinjam pihak lain; bisa diminta
          pinjam-alih (paket / satuan) tanpa order ulang ke CSSD. */}
      <Modal
        open={borrowedOpen}
        onClose={() => setBorrowedOpen(false)}
        title="Pinjam Instrumen"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setBorrowedOpen(false)}>
            Tutup
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Instrumen yang sedang dipinjam unit lain. Klik <b>Pinjam</b> pada paket atau unit untuk
            mengirim permintaan ke peminjam saat ini — bila disetujui, instrumen berpindah ke Anda.
          </p>
          <form onSubmit={handleBorrowedSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari ruangan, peminjam, paket, instrumen, atau kode unit..."
                value={borrowedSearchInput}
                onChange={(e) => setBorrowedSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              Cari
            </Button>
          </form>

          {borrowedLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">Memuat data...</div>
          ) : visibleBorrowed.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Tidak ada instrumen pihak lain yang sedang dipinjam.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Level 1: per order — peminjam, ruangan, tanggal */}
              {visibleBorrowed.map((o) => {
                const orderOpen = expandedOrder.has(o.id)
                return (
                  <div key={o.id} className="rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => toggleOrder(o.id)}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left"
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
                            <span className="text-sm font-semibold text-gray-900">
                              {o.borrowedBy ?? "—"}
                            </span>
                            {o.room?.name && (
                              <Badge variant="default">{o.room.name}</Badge>
                            )}
                            <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                              {o.code}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                            <span>No. RM: {o.medicalRecordNo ?? "—"}</span>
                            <span>Pasien: {o.patientName ?? "—"}</span>
                            <span>Pinjam: {formatDateWithTime(o.orderDate, o.orderTime) ?? "—"}</span>
                            <span>Rencana kembali: {formatDate(o.returnPlanDate) ?? "—"}</span>
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-gray-500">{o.totalUnits} unit</span>
                    </button>

                    {/* Level 2: rincian instrumen — paket (bisa di-expand) + satuan, masing-masing punya tombol Pinjam */}
                    {orderOpen && (
                      <div className="space-y-2 border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
                        {o.paketGroups.map((g) => {
                          const key = `${o.id}::${g.name}`
                          const paketOpen = expandedPaket.has(key)
                          return (
                            <div key={key} className="rounded-lg border border-gray-200 bg-white">
                              <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => togglePaket(key)}
                                  className="flex flex-1 items-center gap-2 text-left"
                                >
                                  <ChevronRight
                                    className={
                                      "h-4 w-4 text-gray-400 transition-transform " +
                                      (paketOpen ? "rotate-90" : "")
                                    }
                                  />
                                  <Badge variant="info">Paket</Badge>
                                  <span className="text-sm font-medium text-gray-800">{g.name}</span>
                                  <span className="text-xs text-gray-500">· {g.units.length} unit</span>
                                </button>
                                {pinjamAction(o, `Paket ${g.name}`, g.units)}
                              </div>

                              {paketOpen && (
                                <ul className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/60">
                                  {g.units.map((u) => (
                                    <li
                                      key={u.order_item_id}
                                      className="flex items-center gap-2 px-3 py-2 text-sm"
                                    >
                                      <span className="ml-6 font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
                                        {u.code ?? "—"}
                                      </span>
                                      <span className="text-gray-700">
                                        {u.instrument_name ?? `Instrumen #${u.instrument_stock_id}`}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        })}

                        {/* Satuan: ditampilkan per unit + tombol Pinjam */}
                        {o.satuanUnits.map((u) => (
                          <div
                            key={`satuan-${u.order_item_id}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Badge variant="default">Satuan</Badge>
                              <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
                                {u.code ?? "—"}
                              </span>
                              <span className="truncate text-sm font-medium text-gray-800">
                                {u.instrument_name ?? `Instrumen #${u.instrument_stock_id}`}
                              </span>
                            </div>
                            {pinjamAction(o, u.instrument_name ?? `Unit ${u.code}`, [u])}
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
      </Modal>

      {/* Form Pinjam: kirim permintaan pinjam-alih ke peminjam saat ini */}
      <Modal
        open={pinjamTarget !== null}
        onClose={() => setPinjamTarget(null)}
        title="Pinjam Instrumen"
        size="md"
        footer={
          pinjamSuccess ? (
            <Button variant="outline" onClick={() => setPinjamTarget(null)}>
              Tutup
            </Button>
          ) : (
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setPinjamTarget(null)}>
                Batal
              </Button>
              <Button
                onClick={handleSubmitPinjam}
                disabled={
                  pinjamSaving ||
                  !pinjamRoomId ||
                  !pinjamBorrowedBy.trim() ||
                  !pinjamMedicalRecordNo.trim() ||
                  !pinjamPatientName.trim()
                }
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {pinjamSaving ? "Mengirim..." : "Kirim Permintaan"}
              </Button>
            </div>
          )
        }
      >
        {pinjamTarget && (
          <div className="space-y-4">
            {pinjamSuccess ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-green-700">
                  Permintaan pinjam terkirim ke peminjam saat ini.
                </p>
                <p className="mt-1 text-xs text-green-600">
                  Instrumen akan berpindah ke Anda setelah permintaan disetujui (di-ACC).
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-800">{pinjamTarget.label}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Dari order{" "}
                    <span className="font-mono font-semibold text-[#075489]">
                      {pinjamTarget.fromOrderCode}
                    </span>{" "}
                    · {pinjamTarget.units.length} unit
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {pinjamTarget.units.map((u) => (
                      <li
                        key={u.stockId}
                        className="font-mono text-[11px] font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-1.5 py-0.5 rounded"
                      >
                        {u.code}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Ruangan Tujuan <span className="text-red-500">*</span>
                  </label>
                  <SelectSearch
                    options={roomOptions}
                    value={pinjamRoomId}
                    onChange={setPinjamRoomId}
                    placeholder="Pilih ruangan peminjam baru"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Nama Peminjam <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="Nama peminjam baru"
                    value={pinjamBorrowedBy}
                    onChange={(e) => setPinjamBorrowedBy(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      No. RM Pasien <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="No. rekam medis pasien"
                      value={pinjamMedicalRecordNo}
                      onChange={(e) => setPinjamMedicalRecordNo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Nama Pasien <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="Nama pasien"
                      value={pinjamPatientName}
                      onChange={(e) => setPinjamPatientName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Catatan (opsional)
                  </label>
                  <Input
                    placeholder="Catatan untuk peminjam saat ini"
                    value={pinjamNote}
                    onChange={(e) => setPinjamNote(e.target.value)}
                  />
                </div>

                {pinjamError && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{pinjamError}</p>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Inbox Permintaan Pinjam: permintaan masuk yang menunggu ACC user ini */}
      <Modal
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        title="Permintaan Pinjam Masuk"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setInboxOpen(false)}>
            Tutup
          </Button>
        }
      >
        {transfersLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">Memuat data...</div>
        ) : transfers.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Tidak ada permintaan pinjam yang menunggu persetujuan.
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.map((t) => (
              <div key={t.id} className="rounded-lg border border-gray-200 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {t.requested_by?.name ?? "—"}
                      </span>
                      <ArrowLeftRight className="h-3.5 w-3.5 text-gray-400" />
                      {t.to_room?.name && <Badge variant="info">{t.to_room.name}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Dari order{" "}
                      <span className="font-mono font-semibold text-[#075489]">
                        {t.from_order?.code ?? "—"}
                      </span>
                      {t.borrowed_by ? ` · a/n ${t.borrowed_by}` : ""}
                    </p>
                    {(t.medical_record_no || t.patient_name) && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        Pasien: {t.patient_name ?? "—"}
                        {t.medical_record_no ? ` · No. RM ${t.medical_record_no}` : ""}
                      </p>
                    )}
                    {t.note && <p className="mt-1 text-xs text-gray-500 italic">“{t.note}”</p>}
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">
                    {t.items?.length ?? 0} unit
                  </span>
                </div>

                <ul className="mt-2 flex flex-wrap gap-1">
                  {(t.items ?? []).map((it) => (
                    <li
                      key={it.id}
                      className="font-mono text-[11px] font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-1.5 py-0.5 rounded"
                    >
                      {it.instrument_stock?.code ?? `#${it.instrument_stock_id}`}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    disabled={actingId === t.id}
                    onClick={() => handleRespond(t, "reject")}
                  >
                    {actingId === t.id ? "Memproses..." : "Tolak"}
                  </Button>
                  <Button
                    className="h-8 px-3 text-xs bg-[#075489] hover:bg-[#075489]/90 text-white"
                    disabled={actingId === t.id}
                    onClick={() => handleRespond(t, "accept")}
                  >
                    {actingId === t.id ? "Memproses..." : "Setujui (ACC)"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>


      {/* Detail Order Modal */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Detail Order : ${detailTitleCodes(detail)}` : "Detail Order"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex gap-2">
              {detail &&
                nextActions[detail.status].map((a) => (
                  <Button
                    key={a.to}
                    onClick={() => handleChangeStatus(a.to)}
                    disabled={statusBusy || detailLoading}
                    variant={a.variant === "danger" ? "destructive" : undefined}
                    className={
                      a.variant === "primary" ? "bg-[#075489] hover:bg-[#075489]/90 text-white" : undefined
                    }
                  >
                    {statusBusy ? "Memproses..." : a.label}
                  </Button>
                ))}
            </div>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Tutup
            </Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat data...</div>
        ) : detail ? (
          <div className="space-y-5">
            {/* Status tracking alur CSSD: Diterima → Dicuci → Packaging → Steril → Distribusi */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Status Tracking
              </p>
              <OrderStatusTracker status={detail.status} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Dipinjam Oleh" value={detail.borrowed_by ?? detail.user?.name} />
              <Field label="Ruangan / Unit" value={detail.room?.name} />
              <Field label="Tanggal Pinjam" value={formatDate(detail.order_date)} />
              <Field label="Jam Pinjam" value={formatTime(detail.order_time)} />
              <Field label="Waktu Diajukan" value={formatDateTime(timelineTimeOf(detail.timeline, "dibuat"))} />
              <Field label="Waktu ACC / Dipinjamkan" value={formatDateTime(timelineTimeOf(detail.timeline, "diterima"))} />
              <Field label="Rencana Kembali" value={formatDate(detail.return_plan_date)} />
              <Field label="Tanggal Kembali" value={formatDate(detail.return_actual_date)} />
              <Field label="Dikembalikan Oleh" value={detail.returned_by} />
              <Field label="No. RM Pasien" value={detail.medical_record_no} />
              <Field label="Nama Pasien" value={detail.patient_name} />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p>
                <OrderStatusBadge status={detail.status} />
              </div>
            </div>

            {detail.note && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Catatan</p>
                <p className="text-sm text-gray-700">{detail.note}</p>
              </div>
            )}

            {/* Riwayat Peminjaman: timeline tracking order (dibuat → diterima → dipinjam → dst.) */}
            <OrderTimeline events={detail.timeline} />

            {detail.request_items && detail.request_items.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Daftar Permintaan
                </p>
                <div className="space-y-2">
                  {detail.request_items.map((r) => {
                    const hasContents =
                      r.type === "paket" && !!r.catalog?.items && r.catalog.items.length > 0
                    const open = expandedReq.has(r.id)
                    return (
                      <div key={r.id} className="rounded-lg border border-gray-200">
                        {/* Paket: klik untuk buka/tutup isi paket */}
                        {r.type === "paket" ? (
                          <button
                            type="button"
                            onClick={() => toggleReq(r.id)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={
                                  "h-4 w-4 text-gray-400 transition-transform " + (open ? "rotate-90" : "")
                                }
                              />
                              <Badge variant="info">Paket</Badge>
                              <span className="text-sm font-medium text-gray-800">
                                {r.package_name ?? r.catalog?.name ?? "Paket"}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">{r.quantity} paket</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="default">Satuan</Badge>
                              <span className="text-sm font-medium text-gray-800">
                                {r.instrument?.name ?? `Instrumen #${r.instrument_id}`}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">{r.quantity} unit</span>
                          </div>
                        )}

                        {/* Isi paket — tampil saat baris dibuka */}
                        {r.type === "paket" && open && hasContents && (
                          <ul className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/60">
                            {r.catalog!.items!.map((ci) => (
                              <li
                                key={ci.instrument_id}
                                className="flex items-center justify-between px-3 py-1.5 text-sm"
                              >
                                <span className="pl-6 text-gray-600">
                                  {ci.instrument?.name ?? `Instrumen #${ci.instrument_id}`}
                                </span>
                                <span className="text-xs font-semibold text-gray-700">
                                  {ci.quantity * r.quantity}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {r.type === "paket" && open && !hasContents && (
                          <p className="border-t border-gray-100 bg-gray-50/60 px-3 py-2 pl-9 text-xs text-gray-400">
                            Paket tanpa rincian instrumen.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Unit Instrumen
              </p>
              {detail.items && detail.items.length > 0 ? (
                <div className="space-y-2">
                  {/* Paket: dikelompokkan per nama paket, klik untuk lihat rincian unit */}
                  {detailUnitGroups.paketGroups.map((g) => {
                    const open = expandedUnitPaket.has(g.name)
                    return (
                      <div key={`paket-${g.name}`} className="rounded-lg border border-gray-200">
                        <button
                          type="button"
                          onClick={() => toggleUnitPaket(g.name)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              className={"h-4 w-4 text-gray-400 transition-transform " + (open ? "rotate-90" : "")}
                            />
                            <Badge variant="info">Paket</Badge>
                            <span className="text-sm font-medium text-gray-800">{g.name}</span>
                          </div>
                          <span className="text-xs text-gray-500">{g.units.length} unit</span>
                        </button>

                        {open && (
                          <div className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/60">
                            {g.units.map((u) => (
                              <DetailUnitRow key={u.id} unit={u} indent />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Satuan: ditampilkan per unit */}
                  {detailUnitGroups.satuanUnits.map((u) => (
                    <div key={`satuan-${u.id}`} className="rounded-lg border border-gray-200">
                      <DetailUnitRow unit={u} satuan />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-gray-400">
                  Unit fisik belum di-generate — akan dialokasikan saat pesanan diterima CSSD.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

// Satu baris unit instrumen di modal detail (lihat-saja). `indent` untuk unit
// di dalam grup paket; `satuan` menambahkan badge "Satuan".
function DetailUnitRow({
  unit,
  indent = false,
  satuan = false,
}: {
  unit: OrderItem
  indent?: boolean
  satuan?: boolean
}) {
  const name = unit.instrument_stock?.instrument?.name ?? `Instrumen #${unit.instrument_stock_id}`
  const pad = indent ? "pl-6" : ""
  return (
    <div className="px-3 py-2">
      {/* Baris 1: identitas unit — nama muat penuh (badge status pindah ke bawah). */}
      <div className={"flex min-w-0 items-center gap-2 " + pad}>
        {satuan && <Badge variant="default">Satuan</Badge>}
        <span className="shrink-0 font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
          {unit.instrument_stock?.code ?? "—"}
        </span>
        <span className="truncate text-sm text-gray-700">{name}</span>
      </div>
      {/* Baris 2: status + kondisi keluar → masuk. */}
      <div className={"mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 " + pad}>
        {unit.is_returned ? (
          <Badge variant="success">Kembali</Badge>
        ) : (
          <Badge variant="warning">Dipinjam</Badge>
        )}
        <span>Kondisi Keluar: {unit.condition_out?.name ?? "—"}</span>
        <span>Kondisi Masuk: {unit.condition_in?.name ?? "—"}</span>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
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

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Box, Layers, PackageCheck, Stethoscope, Image as ImageIcon, Upload, X, ZoomIn, Waypoints, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchInstruments,
  setInstrumentSearch,
  setInstrumentPage,
  setInstrumentSort,
  invalidateInstruments,
  type Instrument,
  type InstrumentSort,
} from "@/lib/store/slices/instrumentSlice"

const sortOptions = [
  { value: "", label: "Urutkan" },
  { value: "stock_asc", label: "Sisa Stok Tersedikit" },
  { value: "stock_desc", label: "Sisa Stok Terbanyak" },
]
import { fetchConditions } from "@/lib/store/slices/conditionSlice"
import api from "@/lib/axios"

type Stock = {
  id: number
  instrument_id: number
  code: string
  condition_id: number | null
  status: string
  // Tahap pipeline aktual (pencucian/pengemasan/sterilisasi/disimpan/dipinjam) —
  // lebih rinci dari `status` yang hanya enum kasar.
  stage?: string | null
  stage_label?: string | null
  condition: { id: number; name: string } | null
}

const statusLabel: Record<string, string> = {
  tersedia: "Tersedia",
  dipinjam: "Dipinjam",
  sterilisasi: "Dalam Sterilisasi",
  dikembalikan: "Dikembalikan",
}

const statusVariant: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  tersedia: "success",
  dipinjam: "warning",
  sterilisasi: "info",
  dikembalikan: "default",
}

// Warna badge per tahap pipeline aktual pada daftar stok.
const stageVariant: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  pencucian: "info",
  pengemasan: "info",
  sterilisasi: "info",
  disimpan: "success",
  dipinjam: "warning",
  dikembalikan: "default",
  proses: "info",
}

const kondisiBadgeVariant: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  "Baik": "success",
  "Cukup Baik": "info",
  "Rusak Ringan": "warning",
  "Rusak Berat": "danger",
  "Dalam Perbaikan": "default",
}

// Tracking pipeline CSSD (posisi unit saat status ≠ tersedia).
type TrackStage = { key: string; label: string; code: string | null; status: string | null; at: string | null }
type TrackHistory = {
  from_status: string | null
  to_status: string
  context: string | null
  reference_code: string | null
  note: string | null
  by: string | null
  at: string | null
}
type TrackingData = {
  unit: {
    id: number
    code: string
    status: string
    status_label: string
    instrument: { code: string; name: string } | null
    condition: string | null
  }
  production_code: string | null
  current_stage: TrackStage | null
  stages: TrackStage[]
  order: { code: string; code_transaction: string | null; status: string; borrowed_by: string | null; room: string | null } | null
  history: TrackHistory[]
}

// Label status tiap tahap pipeline (mentah → terbaca), mis. "dalam_proses" → "Dalam Proses".
function pipelineStatusLabel(s: string | null): string {
  if (!s) return "—"
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const pipelineStatusVariant: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  selesai: "success",
  steril: "success",
  tersimpan: "success",
  diproses: "info",
  dalam_proses: "info",
  dipinjam: "warning",
  keluar: "warning",
  gagal: "danger",
  batal: "default",
}

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

const emptyForm = { code: "", name: "" }

export default function MasterInstrumenPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, sortBy, loading, loaded, dirty } =
    useAppSelector((s) => s.instruments)
  const conditions = useAppSelector((s) => s.conditions.items)
  const kondisiOptions = conditions.map((c) => ({ value: String(c.id), label: c.name }))

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Gambar instrumen (opsional): file baru terpilih, gambar lama dari server, penanda hapus.
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [existingImage, setExistingImage] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Pratinjau gambar yang baru dipilih; object URL dibersihkan saat berganti/unmount.
  const objectUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile])
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  const previewSrc = objectUrl ?? (removeImage ? null : existingImage)

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f) {
      setImageFile(f)
      setRemoveImage(false)
    }
  }

  function handleClearImage() {
    setImageFile(null)
    setRemoveImage(true)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function resetImageState() {
    setImageFile(null)
    setExistingImage(null)
    setRemoveImage(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }
  const [deleteInstrumenTarget, setDeleteInstrumenTarget] = useState<Instrument | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [stats, setStats] = useState({ total_instruments: 0, total_units: 0, available_units: 0 })

  // Stock state
  const [stockModal, setStockModal] = useState<Instrument | null>(null)
  const [stocks, setStocks] = useState<Stock[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [stockBusy, setStockBusy] = useState(false)
  const [newConditionId, setNewConditionId] = useState("")
  const [editingStockId, setEditingStockId] = useState<number | null>(null)
  const [editConditionId, setEditConditionId] = useState("")
  const [deleteStockTarget, setDeleteStockTarget] = useState<Stock | null>(null)
  // Tracking pipeline: unit yang sedang dilacak + datanya.
  const [trackTarget, setTrackTarget] = useState<Stock | null>(null)
  const [tracking, setTracking] = useState<TrackingData | null>(null)
  const [trackingLoading, setTrackingLoading] = useState(false)
  // Pratinjau (zoom) gambar instrumen di modal.
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchInstruments())
  }, [loaded, dirty, dispatch])

  useEffect(() => {
    dispatch(fetchConditions())
  }, [dispatch])

  async function loadStats() {
    try {
      const res = await api.get("/master/instruments/stats")
      setStats(res.data.data)
    } catch {
      // abaikan — kartu statistik bersifat informatif
    }
  }

  useEffect(() => {
    loadStats()
  }, [items])

  async function loadStocks(instrumentId: number) {
    setStockLoading(true)
    try {
      const res = await api.get("/master/instrument-stocks", {
        params: { instrument_id: instrumentId },
      })
      setStocks(res.data.data.data)
    } finally {
      setStockLoading(false)
    }
  }

  useEffect(() => {
    if (stockModal) {
      setEditingStockId(null)
      loadStocks(stockModal.id)
    } else {
      setStocks([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockModal])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setInstrumentSearch(searchInput))
  }

  function handlePageChange(p: number) {
    dispatch(setInstrumentPage(p))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    resetImageState()
    setModal("tambah")
  }

  function openEdit(row: Instrument) {
    setForm({ code: row.code, name: row.name })
    setEditId(row.id)
    resetImageState()
    setExistingImage(row.image_url ?? null)
    setModal("edit")
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) return
    setSaving(true)
    try {
      let instrumentId = editId
      if (modal === "tambah") {
        const res = await api.post("/master/instruments", form)
        instrumentId = res.data.data.id
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/instruments/${editId}`, form)
      }
      // Sinkronkan gambar (opsional) setelah instrumen tersimpan.
      if (instrumentId != null) {
        if (imageFile) {
          const fd = new FormData()
          fd.append("image", imageFile)
          await api.post(`/master/instruments/${instrumentId}/image`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        } else if (removeImage && existingImage) {
          await api.delete(`/master/instruments/${instrumentId}/image`)
        }
      }
      dispatch(invalidateInstruments())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteInstrumenTarget || deletingId !== null) return
    setDeletingId(deleteInstrumenTarget.id)
    try {
      await api.delete(`/master/instruments/${deleteInstrumenTarget.id}`)
      dispatch(invalidateInstruments())
      setDeleteInstrumenTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleAddStock() {
    if (!stockModal || stockBusy) return
    setStockBusy(true)
    try {
      await api.post("/master/instrument-stocks", {
        instrument_id: stockModal.id,
        condition_id: newConditionId ? Number(newConditionId) : null,
        status: "tersedia",
      })
      setNewConditionId("")
      await loadStocks(stockModal.id)
      dispatch(invalidateInstruments())
    } finally {
      setStockBusy(false)
    }
  }

  async function handleSaveStockEdit() {
    if (!stockModal || editingStockId === null) return
    setStockBusy(true)
    try {
      await api.put(`/master/instrument-stocks/${editingStockId}`, {
        instrument_id: stockModal.id,
        condition_id: editConditionId ? Number(editConditionId) : null,
      })
      setEditingStockId(null)
      await loadStocks(stockModal.id)
    } finally {
      setStockBusy(false)
    }
  }

  async function handleDeleteStock() {
    if (!stockModal || !deleteStockTarget) return
    setStockBusy(true)
    try {
      await api.delete(`/master/instrument-stocks/${deleteStockTarget.id}`)
      setDeleteStockTarget(null)
      await loadStocks(stockModal.id)
      dispatch(invalidateInstruments())
    } finally {
      setStockBusy(false)
    }
  }

  async function openTracking(stock: Stock) {
    setTrackTarget(stock)
    setTracking(null)
    setTrackingLoading(true)
    try {
      const res = await api.get(`/master/instrument-stocks/${stock.id}/tracking`)
      setTracking(res.data.data as TrackingData)
    } finally {
      setTrackingLoading(false)
    }
  }

  const columns: Column<Instrument>[] = [
    {
      header: "Kode",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.code}
        </span>
      ),
      className: "w-32",
    },
    {
      header: "Nama Instrumen",
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          {row.image_url ? (
            <button
              type="button"
              onClick={() => setPreviewImage({ src: row.image_url!, name: row.name })}
              title="Lihat gambar"
              className="group relative shrink-0 cursor-zoom-in overflow-hidden rounded border border-gray-200 transition hover:ring-2 hover:ring-[#075489]/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.image_url} alt={row.name} className="h-8 w-8 object-cover" />
              <span className="absolute inset-0 hidden items-center justify-center bg-black/30 text-white group-hover:flex">
                <ZoomIn className="h-3.5 w-3.5" />
              </span>
            </button>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-100 bg-gray-50 text-gray-300">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
          <span className="font-medium text-gray-900">{row.name}</span>
        </div>
      ),
    },
    {
      header: "Total Unit",
      cell: (row) => (
        <span className="font-semibold text-gray-900">{row.stocks_count}</span>
      ),
      className: "w-24",
    },
    {
      header: "Sisa Stok",
      cell: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            row.available_stocks_count <= 0
              ? "bg-red-100 text-red-600"
              : row.available_stocks_count <= 5
                ? "bg-amber-100 text-amber-700"
                : "bg-green-100 text-green-700"
          }`}
          title="Jumlah unit berstatus tersedia"
        >
          {row.available_stocks_count} tersedia
        </span>
      ),
      className: "w-32",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Master Instrumen</h1>
            <p className="text-sm text-gray-500 mt-0.5">Kelola data instrumen medis</p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Instrumen
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total Jenis Instrumen" value={String(stats.total_instruments)} icon={Box} />
        <StatCard title="Total Unit Stok" value={String(stats.total_units)} icon={Layers} />
        <StatCard title="Unit Tersedia" value={String(stats.available_units)} icon={PackageCheck} />
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama instrumen..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              Cari
            </Button>
            <div className="w-44 shrink-0">
              <SelectSearch
                options={sortOptions}
                value={sortBy}
                onChange={(v) => dispatch(setInstrumentSort(v as InstrumentSort))}
                placeholder="Urutkan"
                triggerClassName="h-10 px-4"
              />
            </div>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            extraActions={[
              {
                label: "+ Stock",
                onClick: (row) => setStockModal(row),
                className: "border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/10",
              },
            ]}
            onEdit={openEdit}
            onDelete={(row) => setDeleteInstrumenTarget(row)}
            isRowLoading={(row) => deletingId === row.id}
            emptyMessage="Belum ada data instrumen."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={handlePageChange}
        />
      </Card>

      <ConfirmDialog
        open={deleteInstrumenTarget !== null}
        onClose={() => setDeleteInstrumenTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      {/* Tambah / Edit Instrumen Modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? "Tambah Instrumen" : "Edit Instrumen"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving || !form.code.trim() || !form.name.trim()} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ins-kode">Kode Instrumen</Label>
            <Input
              id="ins-kode"
              placeholder="Contoh: INS-001"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins-nama">Nama Instrumen</Label>
            <Input
              id="ins-nama"
              placeholder="Contoh: Stetoskop"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Gambar instrumen (opsional) */}
          <div className="space-y-1.5">
            <Label>Gambar (opsional)</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewSrc} alt="Pratinjau gambar instrumen" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-gray-300" />
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-[#075489] text-[#075489] hover:bg-[#075489]/10"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {previewSrc ? "Ganti" : "Pilih Gambar"}
                  </Button>
                  {previewSrc && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={handleClearImage}
                      className="border-red-300 text-red-500 hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-400">JPG/PNG/WEBP, maks 2 MB.</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePickImage}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Stock Modal */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-5xl rounded-xl bg-white shadow-xl flex flex-col max-h-[95vh]">
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4ba69d]/10 text-[#4ba69d]">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Stock Instrumen</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                      {stockModal.code}
                    </span>
                    <span className="text-sm text-gray-600">{stockModal.name}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStockModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {!stockLoading && stocks.length > 0 && (
              <div className="flex items-center gap-6 border-b border-gray-100 px-6 py-3 text-sm">
                <span className="text-gray-500">Total unit: <span className="font-semibold text-gray-900">{stocks.length}</span></span>
                <span className="text-gray-500">Tersedia: <span className="font-semibold text-[#4ba69d]">{stocks.filter((s) => s.status === "tersedia").length}</span></span>
                <span className="text-gray-500">Dipakai/Proses: <span className="font-semibold text-amber-500">{stocks.filter((s) => s.status !== "tersedia").length}</span></span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {stockLoading ? (
                <div className="py-10 text-center text-sm text-gray-400">Memuat stock...</div>
              ) : stocks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-gray-400">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
                    <Layers className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">Belum ada stock untuk instrumen ini.</p>
                  <p className="text-xs">Tambahkan unit pertama lewat form di bawah.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-10">No</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Kode Stock</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-44">Kondisi</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-36">Status</th>
                      <th className="py-3 pl-3 pr-4 w-48" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stocks.map((item, i) => {
                      const isEditing = editingStockId === item.id
                      const kondisiName = item.condition?.name ?? "-"
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 pl-4 pr-3 text-gray-400">{i + 1}</td>
                          <td className="py-3 px-3">
                            <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-1 rounded">
                              {item.code}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {isEditing ? (
                              <SelectSearch options={kondisiOptions} value={editConditionId} onChange={setEditConditionId} placeholder="-- Pilih kondisi --" />
                            ) : (
                              <Badge variant={kondisiBadgeVariant[kondisiName] ?? "default"}>{kondisiName}</Badge>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {item.status === "tersedia" ? (
                              <Badge variant={statusVariant[item.status] ?? "default"}>
                                {statusLabel[item.status] ?? item.status}
                              </Badge>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openTracking(item)}
                                title="Lihat tracking unit di pipeline CSSD"
                                className="group inline-flex items-center gap-1.5 rounded-full transition hover:opacity-90"
                              >
                                <Badge
                                  variant={
                                    item.stage
                                      ? stageVariant[item.stage] ?? "info"
                                      : statusVariant[item.status] ?? "default"
                                  }
                                >
                                  {item.stage_label ?? statusLabel[item.status] ?? item.status}
                                </Badge>
                                <Waypoints className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#075489]" />
                              </button>
                            )}
                          </td>
                          <td className="py-3 pl-3 pr-4">
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <Button size="xs" onClick={handleSaveStockEdit} disabled={stockBusy} className="bg-[#075489] hover:bg-[#075489]/90 text-white">Simpan</Button>
                                  <Button size="xs" variant="outline" onClick={() => setEditingStockId(null)}>Batal</Button>
                                </>
                              ) : (
                                <>
                                  <Button size="xs" variant="outline" onClick={() => { setEditingStockId(item.id); setEditConditionId(item.condition_id ? String(item.condition_id) : "") }}>Edit</Button>
                                  <Button size="xs" variant="destructive" onClick={() => setDeleteStockTarget(item)}>Hapus</Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Tambah Stock</p>
              <div className="flex items-end gap-3">
                <div className="w-56 space-y-1.5">
                  <Label>Kondisi</Label>
                  <SelectSearch options={kondisiOptions} value={newConditionId} onChange={setNewConditionId} disabled={stockBusy} placeholder="-- Pilih kondisi --" />
                </div>
                <Button type="button" onClick={handleAddStock} disabled={stockBusy} className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white min-w-[100px] shrink-0">
                  {stockBusy ? "Menyimpan..." : "+ Tambah"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tracking pipeline unit — dibuka dari badge status (saat ≠ tersedia) */}
      <Modal
        open={trackTarget !== null}
        onClose={() => setTrackTarget(null)}
        title="Tracking Unit Instrumen"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setTrackTarget(null)}>
            Tutup
          </Button>
        }
      >
        {trackingLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat tracking...</div>
        ) : !tracking ? (
          <div className="py-10 text-center text-sm text-gray-400">Data tracking tidak tersedia.</div>
        ) : (
          <div className="space-y-5">
            {/* Identitas unit */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-1 rounded">
                {tracking.unit.code}
              </span>
              <span className="text-sm text-gray-700">{tracking.unit.instrument?.name ?? "—"}</span>
              {tracking.unit.condition && <Badge variant="default">{tracking.unit.condition}</Badge>}
              <Badge variant={statusVariant[tracking.unit.status] ?? "default"} className="ml-auto">
                {tracking.unit.status_label}
              </Badge>
            </div>

            {/* Tahap saat ini + kode produksi */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#075489]/20 bg-[#075489]/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#075489]/70">Tahap Saat Ini</p>
                <p className="mt-0.5 text-lg font-bold text-[#075489]">
                  {tracking.current_stage?.label ?? "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {tracking.current_stage?.code && (
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded">
                      {tracking.current_stage.code}
                    </span>
                  )}
                  {tracking.current_stage?.status && (
                    <Badge variant={pipelineStatusVariant[tracking.current_stage.status] ?? "info"}>
                      {pipelineStatusLabel(tracking.current_stage.status)}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Kode Produksi</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-gray-800">
                  {tracking.production_code ?? "—"}
                </p>
                {tracking.order && (
                  <p className="mt-1 text-xs text-gray-500">
                    Order <span className="font-semibold text-gray-700">{tracking.order.code}</span>
                    {tracking.order.room ? ` · ${tracking.order.room}` : ""}
                    {tracking.order.borrowed_by ? ` · ${tracking.order.borrowed_by}` : ""}
                  </p>
                )}
              </div>
            </div>

            {/* Perjalanan unit antar tahap */}
            {tracking.stages.length > 0 && (
              <div className="space-y-1.5">
                <Label>Perjalanan Unit</Label>
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {tracking.stages.map((stage) => {
                    const isCurrent = stage.key === tracking.current_stage?.key
                    return (
                      <div
                        key={stage.key}
                        className={`flex items-center gap-3 px-3 py-2.5 ${isCurrent ? "bg-[#075489]/5" : ""}`}
                      >
                        {isCurrent ? (
                          <Clock className="h-4 w-4 shrink-0 text-[#075489]" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4ba69d]" />
                        )}
                        <span className={`text-sm ${isCurrent ? "font-semibold text-[#075489]" : "text-gray-700"}`}>
                          {stage.label}
                        </span>
                        {stage.code && (
                          <span className="font-mono text-[11px] font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                            {stage.code}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {stage.status && (
                            <Badge variant={pipelineStatusVariant[stage.status] ?? "default"}>
                              {pipelineStatusLabel(stage.status)}
                            </Badge>
                          )}
                          <span className="hidden text-xs text-gray-400 sm:inline">{formatDateTime(stage.at)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Riwayat status (log) */}
            {tracking.history.length > 0 && (
              <details className="rounded-lg border border-gray-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                  Riwayat Status ({tracking.history.length})
                </summary>
                <div className="divide-y divide-gray-50 border-t border-gray-100">
                  {tracking.history.map((h, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                      <span className="text-gray-500">
                        {h.from_status ? `${h.from_status} → ` : ""}
                        <span className="font-semibold text-gray-800">{h.to_status}</span>
                      </span>
                      {h.reference_code && (
                        <span className="font-mono text-[11px] font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded">
                          {h.reference_code}
                        </span>
                      )}
                      {h.context && <span className="text-gray-400">({h.context})</span>}
                      <span className="ml-auto text-gray-400">{formatDateTime(h.at)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </Modal>

      {/* Pratinjau / zoom gambar instrumen */}
      <Modal
        open={previewImage !== null}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.name ?? "Gambar Instrumen"}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setPreviewImage(null)}>
            Tutup
          </Button>
        }
      >
        {previewImage && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="max-h-[70vh] w-auto rounded-lg object-contain"
            />
          </div>
        )}
      </Modal>

      {/* Stock delete confirm — dirender setelah modal stock agar tampil di depan */}
      <ConfirmDialog
        open={deleteStockTarget !== null}
        onClose={() => setDeleteStockTarget(null)}
        onConfirm={handleDeleteStock}
        loading={stockBusy}
        description="Apakah Anda yakin ingin menghapus stock ini? Tindakan ini tidak dapat dibatalkan."
      />
    </div>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Box, Layers, PackageCheck, Stethoscope, Image as ImageIcon, Upload, X, ZoomIn, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { SortHeader } from "@/components/atoms/SortHeader"
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

import { fetchConditions } from "@/lib/store/slices/conditionSlice"
import { useLanguage, localeOf, type Lang } from "@/lib/i18n"
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
  // Penanda dari server (jejak relasi + kolom audit, bukan `status`): unit ini tersedia?
  // Dipakai untuk badge Status, hitungan Tersedia/Dipakai, dan kunci tombol Edit/Hapus.
  is_available?: boolean
  condition: { id: number; name: string } | null
}

// Warna badge per tahap pipeline aktual pada daftar stok.
const stageVariant: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  produksi: "info",
  pencucian: "info",
  pengemasan: "info",
  sterilisasi: "info",
  menunggu_disimpan: "info",
  disimpan: "success",
  kedaluwarsa: "danger",
  dipinjam: "warning",
  // Nilai warisan — unit yang sudah dikembalikan kini kembali berstatus Tersedia.
  dikembalikan: "default",
}

const kondisiBadgeVariant: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  "Baik": "success",
  "Cukup Baik": "info",
  "Rusak Ringan": "warning",
  "Rusak Berat": "danger",
  "Dalam Perbaikan": "default",
}

// Tracking pipeline CSSD (posisi unit saat status ≠ tersedia).
type TrackStage = {
  key: string
  label: string
  code: string | null
  status: string | null
  at: string | null
  // No. invoice order yang terkait tahap ini — hanya terisi pada tahap yang memang
  // menyangkut order (unit keluar gudang & dipinjam).
  invoice?: string | null
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
}

// Label status tiap tahap pipeline (mentah → terbaca), mis. "dalam_proses" →
// "Dalam Proses". Statusnya nilai mentah dari server, jadi hasilnya masih perlu
// dilewatkan glosarium (`tn`) di tempat pemakaian agar ikut bahasa aktif.
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

function formatDateTime(value: string | null, lang: Lang): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(localeOf(lang), {
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
  // `t` = teks antarmuka (kamus tetap); `tn` = nama/label yang datang dari server
  // (kondisi, tahap pipeline) — lewat glosarium, karena datanya bisa bertambah.
  const { t, tn, lang } = useLanguage()
  const { items, totalItems, totalPages, page, search, sortBy, loading, loaded, dirty } =
    useAppSelector((s) => s.instruments)
  const conditions = useAppSelector((s) => s.conditions.items)
  // Nama kondisi ikut diterjemahkan di dropdown, tapi NILAINYA tetap id aslinya.
  const kondisiOptions = conditions.map((c) => ({ value: String(c.id), label: tn(c.name) }))
  // Kondisi bawaan unit baru: "Baik" bila ada di master Kondisi, kalau tidak ketemu
  // pakai entri pertama agar unit tetap punya kondisi (bukan null).
  const defaultCondition =
    conditions.find((c) => c.name.trim().toLowerCase() === "baik") ?? conditions[0] ?? null

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
  // Tambah stok kini per JUMLAH, bukan per unit: kondisinya tidak lagi dipilih
  // manual melainkan selalu "Baik" (unit baru memang belum terpakai).
  const [newQty, setNewQty] = useState("1")
  const [addStockOpen, setAddStockOpen] = useState(false)
  // Batas 1–100 disamakan dengan validasi server.
  const qtyValid = /^\d+$/.test(newQty) && Number(newQty) >= 1 && Number(newQty) <= 100
  // Alasan penguncian menyebut tahap aktual unit, bukan kalimat umum — supaya petugas
  // langsung tahu apa yang harus dibereskan (mis. "Kedaluwarsa" → sterilkan ulang).
  const lockedHint = (s: Stock) =>
    t("masterInstrument.lockedHint", {
      stage: s.stage_label ? ` (${tn(s.stage_label)})` : "",
    })
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
    if (!stockModal || stockBusy || !qtyValid) return
    setStockBusy(true)
    try {
      // Satu request membuat sekaligus N unit (server membungkusnya dalam transaksi),
      // jadi tidak ada unit setengah jadi bila gagal di tengah.
      await api.post("/master/instrument-stocks", {
        instrument_id: stockModal.id,
        condition_id: defaultCondition?.id ?? null,
        status: "tersedia",
        quantity: Number(newQty),
      })
      setNewQty("1")
      setAddStockOpen(false)
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
      header: t("masterInstrument.colCode"),
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.code}
        </span>
      ),
      className: "w-32",
    },
    {
      header: t("masterInstrument.colName"),
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          {row.image_url ? (
            <button
              type="button"
              onClick={() => setPreviewImage({ src: row.image_url!, name: row.name })}
              title={t("masterInstrument.viewImage")}
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
      header: t("masterInstrument.colTotalUnits"),
      cell: (row) => (
        <span className="font-semibold text-gray-900">{row.stocks_count}</span>
      ),
      className: "w-24",
    },
    {
      header: t("masterInstrument.colRemaining"),
      // Urutan pindah ke sini dari dropdown terpisah: satu klik di kolomnya sendiri,
      // arahnya langsung terbaca dari panah yang menyala.
      headerCell: (
        <SortHeader
          label={t("masterInstrument.colRemaining")}
          direction={sortBy === "stock_asc" ? "asc" : sortBy === "stock_desc" ? "desc" : null}
          onChange={(next) =>
            dispatch(
              setInstrumentSort(
                (next === "asc" ? "stock_asc" : next === "desc" ? "stock_desc" : "") as InstrumentSort
              )
            )
          }
        />
      ),
      cell: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            row.available_stocks_count <= 0
              ? "bg-red-100 text-red-600"
              : row.available_stocks_count <= 5
                ? "bg-blue-100 text-blue-700"
                : "bg-green-100 text-green-700"
          }`}
          title={t("masterInstrument.remainingHint")}
        >
          {row.available_stocks_count} {t("masterInstrument.remainingSuffix")}
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
            <h1 className="text-2xl font-bold text-gray-900">{t("masterInstrument.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("masterInstrument.subtitle")}</p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          {t("masterInstrument.addInstrument")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title={t("masterInstrument.statTypes")} value={String(stats.total_instruments)} icon={Box} />
        <StatCard title={t("masterInstrument.statUnits")} value={String(stats.total_units)} icon={Layers} />
        <StatCard title={t("masterInstrument.statAvailable")} value={String(stats.available_units)} icon={PackageCheck} />
      </div>

      <Card className="p-0">
        <div className="px-4 py-4 border-b border-gray-100 sm:px-5">
          <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("masterInstrument.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              Cari
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : (
          <DataTable
            rowNumberOffset={(page - 1) * 20}
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
            emptyMessage={t("masterInstrument.emptyInstruments")}
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
        title={modal === "tambah" ? t("masterInstrument.addModalTitle") : t("masterInstrument.editModalTitle")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !form.code.trim() || !form.name.trim()} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ins-kode">{t("masterInstrument.fieldCode")}</Label>
            <Input
              id="ins-kode"
              placeholder={t("masterInstrument.fieldCodeHint")}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins-nama">{t("masterInstrument.fieldName")}</Label>
            <Input
              id="ins-nama"
              placeholder={t("masterInstrument.fieldNameHint")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Gambar instrumen (opsional) */}
          <div className="space-y-1.5">
            <Label>{t("masterInstrument.fieldImage")}</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewSrc} alt={t("masterInstrument.fieldImage")} className="h-full w-full object-cover" />
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
                    {previewSrc ? t("masterInstrument.imageReplace") : t("masterInstrument.imagePick")}
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
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-400">{t("masterInstrument.imageHint")}</p>
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
            <div className="flex items-start justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4ba69d]/10 text-[#4ba69d]">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{t("masterInstrument.stockTitle")}</h2>
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
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-gray-100 px-4 py-3 text-sm sm:px-6">
                <span className="text-gray-500">{t("masterInstrument.stockTotal")}: <span className="font-semibold text-gray-900">{stocks.length}</span></span>
                <span className="text-gray-500">{t("masterInstrument.stockAvailable")}: <span className="font-semibold text-[#4ba69d]">{stocks.filter((s) => s.is_available).length}</span></span>
                <span className="text-gray-500">{t("masterInstrument.stockInUse")}: <span className="font-semibold text-amber-500">{stocks.filter((s) => !s.is_available).length}</span></span>
              </div>
            )}

            <div className="flex-1 overflow-x-auto overflow-y-auto">
              {stockLoading ? (
                <div className="py-10 text-center text-sm text-gray-400">{t("masterInstrument.stockLoading")}</div>
              ) : stocks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-gray-400">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
                    <Layers className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">{t("masterInstrument.stockEmpty")}</p>
                  <p className="text-xs">{t("masterInstrument.stockEmptyHint")}</p>
                </div>
              ) : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-10">No</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{t("masterInstrument.colStockCode")}</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{t("masterInstrument.colName")}</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-44">{t("masterInstrument.colCondition")}</th>
                      <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-36">{t("common.status")}</th>
                      <th className="py-3 pl-3 pr-4 w-48" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stocks.map((item, i) => {
                      const isEditing = editingStockId === item.id
                      // Sejalan dgn penjaga di server (assertAvailable): hanya unit
                      // TERSEDIA yang boleh diubah/dihapus. Begitu unit masuk alur CSSD
                      // — dipinjam, di pipeline, menunggu proses ulang, kedaluwarsa —
                      // barisnya terkunci.
                      const isLocked = !item.is_available
                      const kondisiName = item.condition?.name ?? "-"
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 pl-4 pr-3 text-gray-400">{i + 1}</td>
                          <td className="py-3 px-3">
                            <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-1 rounded">
                              {item.code}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-gray-700">{stockModal.name}</td>
                          <td className="py-3 px-3">
                            {isEditing ? (
                              <SelectSearch options={kondisiOptions} value={editConditionId} onChange={setEditConditionId} placeholder={t("masterInstrument.pickCondition")} />
                            ) : (
                              <Badge variant={kondisiBadgeVariant[kondisiName] ?? "default"}>{tn(kondisiName)}</Badge>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {/* Cabangnya ditentukan `is_available` (jejak relasi), bukan
                                `status` — kalau tidak, unit yang dihitung sebagai
                                "Dipakai/Proses" di atas bisa tetap ber-badge "Tersedia". */}
                            {item.is_available ? (
                              <Badge variant="success">{t("masterInstrument.available")}</Badge>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openTracking(item)}
                                title={t("masterInstrument.trackingViewTitle")}
                                className="inline-flex items-center rounded-full transition hover:opacity-90"
                              >
                                <Badge variant={stageVariant[item.stage ?? ""] ?? "default"}>
                                  {item.stage_label ? tn(item.stage_label) : t("masterInstrument.unavailable")}
                                </Badge>
                              </button>
                            )}
                          </td>
                          <td className="py-3 pl-3 pr-4">
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <Button size="xs" onClick={handleSaveStockEdit} disabled={stockBusy} className="bg-[#075489] hover:bg-[#075489]/90 text-white">{t("common.save")}</Button>
                                  <Button size="xs" variant="outline" onClick={() => setEditingStockId(null)}>{t("common.cancel")}</Button>
                                </>
                              ) : (
                                <>
                                  {/* Hanya unit tersedia yang boleh diubah/dihapus. Server
                                      juga menolaknya (assertAvailable), ini lapisan pertama. */}
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={isLocked}
                                    title={isLocked ? lockedHint(item) : undefined}
                                    onClick={() => { setEditingStockId(item.id); setEditConditionId(item.condition_id ? String(item.condition_id) : "") }}
                                  >
                                    {t("common.edit")}
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    disabled={isLocked}
                                    title={isLocked ? lockedHint(item) : undefined}
                                    onClick={() => setDeleteStockTarget(item)}
                                  >
                                    {t("common.delete")}
                                  </Button>
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

            <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
              {/* Form-nya dipindah ke modal tersendiri — di sini cukup pemicunya. */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => {
                    setNewQty("1")
                    setAddStockOpen(true)
                  }}
                  className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
                >
                  {t("masterInstrument.addStock")}
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
        title={t("masterInstrument.trackingTitle")}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setTrackTarget(null)}>
            {t("common.close")}
          </Button>
        }
      >
        {trackingLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">{t("masterInstrument.trackingLoading")}</div>
        ) : !tracking ? (
          <div className="py-10 text-center text-sm text-gray-400">{t("masterInstrument.trackingEmpty")}</div>
        ) : (
          <div className="space-y-5">
            {/* Identitas unit */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-1 rounded">
                {tracking.unit.code}
              </span>
              <span className="text-sm text-gray-700">{tracking.unit.instrument?.name ?? "—"}</span>
              {tracking.unit.condition && <Badge variant="default">{tn(tracking.unit.condition)}</Badge>}
              {/* Tahap aktual (jejak pipeline), bukan kolom `status` unit. */}
              <Badge
                variant={stageVariant[tracking.current_stage?.key ?? ""] ?? "default"}
                className="ml-auto"
              >
                {tracking.current_stage?.label ? tn(tracking.current_stage.label) : t("masterInstrument.available")}
              </Badge>
            </div>

            {/* Tahap saat ini + kode produksi */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#075489]/20 bg-[#075489]/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#075489]/70">{t("masterInstrument.trackingCurrentStage")}</p>
                <p className="mt-0.5 text-lg font-bold text-[#075489]">
                  {tracking.current_stage?.label ? tn(tracking.current_stage.label) : "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {tracking.current_stage?.code && (
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded">
                      {tracking.current_stage.code}
                    </span>
                  )}
                  {tracking.current_stage?.status && (
                    <Badge variant={pipelineStatusVariant[tracking.current_stage.status] ?? "info"}>
                      {tn(pipelineStatusLabel(tracking.current_stage.status))}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("masterInstrument.trackingProductionCode")}</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-gray-800">
                  {tracking.production_code ?? "—"}
                </p>
                {tracking.order && (
                  <p className="mt-1 text-xs text-gray-500">
                    Order <span className="font-semibold text-gray-700">{tracking.order.code}</span>
                    {/* No. invoice terbit setelah order diterima CSSD — bisa masih kosong. */}
                    {tracking.order.code_transaction ? (
                      <>
                        {" · Invoice "}
                        <span className="font-semibold text-[#4ba69d]">
                          {tracking.order.code_transaction}
                        </span>
                      </>
                    ) : null}
                    {tracking.order.room ? ` · ${tracking.order.room}` : ""}
                    {tracking.order.borrowed_by ? ` · ${tracking.order.borrowed_by}` : ""}
                  </p>
                )}
              </div>
            </div>

            {/* Perjalanan unit antar tahap */}
            {tracking.stages.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("masterInstrument.trackingJourney")}</Label>
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
                          {tn(stage.label)}
                        </span>
                        {stage.code && (
                          <span className="font-mono text-[11px] font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                            {stage.code}
                          </span>
                        )}
                        {/* No. invoice order yang mengeluarkan/meminjam unit ini. */}
                        {stage.invoice && (
                          <span
                            title={t("masterInstrument.trackingInvoiceTitle")}
                            className="font-mono text-[11px] font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-1.5 py-0.5 rounded"
                          >
                            {stage.invoice}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {stage.status && (
                            <Badge variant={pipelineStatusVariant[stage.status] ?? "default"}>
                              {tn(pipelineStatusLabel(stage.status))}
                            </Badge>
                          )}
                          <span className="hidden text-xs text-gray-400 sm:inline">{formatDateTime(stage.at, lang)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </Modal>

      {/* Pratinjau / zoom gambar instrumen */}
      <Modal
        open={previewImage !== null}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.name ?? t("masterInstrument.imageModalTitle")}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setPreviewImage(null)}>
            {t("common.close")}
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

      {/* Tambah stock — dirender setelah modal stock agar tampil di depannya */}
      <Modal
        open={addStockOpen}
        onClose={stockBusy ? () => {} : () => setAddStockOpen(false)}
        title={t("masterInstrument.addStockTitle")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddStockOpen(false)} disabled={stockBusy}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAddStock}
              disabled={stockBusy || !qtyValid}
              className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
            >
              {stockBusy ? t("common.saving") : t("common.add")}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="stock-qty">{t("masterInstrument.addStockQty")}</Label>
          <Input
            id="stock-qty"
            type="number"
            min={1}
            max={100}
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            disabled={stockBusy}
            autoFocus
          />
        </div>
      </Modal>

      {/* Stock delete confirm — dirender setelah modal stock agar tampil di depan */}
      <ConfirmDialog
        open={deleteStockTarget !== null}
        onClose={() => setDeleteStockTarget(null)}
        onConfirm={handleDeleteStock}
        loading={stockBusy}
        description={t("masterInstrument.deleteStockDesc")}
      />
    </div>
  )
}

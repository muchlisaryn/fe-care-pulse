"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Boxes,
  Package,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  PackagePlus,
  FileText,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { Badge } from "@/components/atoms/Badge"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { useToast } from "@/components/molecules/ToastProvider"
import { useLanguage } from "@/lib/i18n"
import api from "@/lib/axios"

export type CandidateBmhp = {
  id: number
  code: string
  name: string
  unit?: string | null
  price?: number
}

export type CandidatePackageItem = {
  id: number
  bmhp_id: number
  qty: number
  bmhp?: {
    id: number
    name: string
    unit?: string | null
  }
}

export type CandidatePackage = {
  id: number
  code: string
  name: string
  total_price?: number
  items: CandidatePackageItem[]
}

export type ProduksiBmhpLine = {
  id: string // temporary client id
  type: "satuan" | "paket"
  refId: number
  code: string
  name: string
  quantity: number
  unit: string
  items?: CandidatePackageItem[] // detail isi jika paket
}

type Props = {
  onSuccess: () => void
}

export function ProductionBmhpNewTab({ onSuccess }: Props) {
  const toast = useToast()
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [bmhps, setBmhps] = useState<CandidateBmhp[]>([])
  const [packages, setPackages] = useState<CandidatePackage[]>([])

  // Form input
  const [addMode, setAddMode] = useState<"satuan" | "paket">("satuan")
  const [selectedRefId, setSelectedRefId] = useState<string>("")
  const [quantity, setQuantity] = useState<number>(1)
  const [note, setNote] = useState<string>("")

  // Daftar item produksi yang akan diajukan
  const [lines, setLines] = useState<ProduksiBmhpLine[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadCandidates() {
      try {
        setLoading(true)
        const res = await api.get("/master/production-bmhp/candidates")
        const data = res.data?.data
        setBmhps(data?.bmhps ?? [])
        setPackages(data?.packages ?? [])
      } catch (err) {
        toast.error("Gagal memuat daftar master BMHP & Paket.")
      } finally {
        setLoading(false)
      }
    }
    loadCandidates()
  }, [toast])

  // Pilihan dropdown sesuai mode
  const selectOptions = useMemo(() => {
    if (addMode === "satuan") {
      return bmhps.map((b) => ({
        value: String(b.id),
        label: `${b.code} - ${b.name} (${b.unit ?? "Pcs"})`,
      }))
    }
    return packages.map((p) => ({
      value: String(p.id),
      label: `${p.code} - ${p.name} (${p.items?.length ?? 0} item)`,
    }))
  }, [addMode, bmhps, packages])

  // Detail item yang sedang dipilih di form
  const currentSelectedBmhp = useMemo(() => {
    if (addMode !== "satuan" || !selectedRefId) return null
    return bmhps.find((b) => b.id === Number(selectedRefId)) ?? null
  }, [addMode, selectedRefId, bmhps])

  const currentSelectedPackage = useMemo(() => {
    if (addMode !== "paket" || !selectedRefId) return null
    return packages.find((p) => p.id === Number(selectedRefId)) ?? null
  }, [addMode, selectedRefId, packages])

  // Tambah item ke tabel
  function handleAddLine() {
    if (!selectedRefId) {
      toast.error("Silakan pilih item BMHP terlebih dahulu.")
      return
    }
    if (quantity <= 0) {
      toast.error("Jumlah produksi minimal 1.")
      return
    }

    if (addMode === "satuan") {
      const bmhp = currentSelectedBmhp
      if (!bmhp) return

      // Cek apakah sudah ada di tabel
      const existing = lines.find((l) => l.type === "satuan" && l.refId === bmhp.id)
      if (existing) {
        setLines(
          lines.map((l) =>
            l.type === "satuan" && l.refId === bmhp.id
              ? { ...l, quantity: l.quantity + quantity }
              : l,
          ),
        )
      } else {
        setLines([
          ...lines,
          {
            id: `satuan-${bmhp.id}-${Date.now()}`,
            type: "satuan",
            refId: bmhp.id,
            code: bmhp.code,
            name: bmhp.name,
            quantity: quantity,
            unit: bmhp.unit ?? "Pcs",
          },
        ])
      }
    } else {
      const pkg = currentSelectedPackage
      if (!pkg) return

      const existing = lines.find((l) => l.type === "paket" && l.refId === pkg.id)
      if (existing) {
        setLines(
          lines.map((l) =>
            l.type === "paket" && l.refId === pkg.id
              ? { ...l, quantity: l.quantity + quantity }
              : l,
          ),
        )
      } else {
        setLines([
          ...lines,
          {
            id: `paket-${pkg.id}-${Date.now()}`,
            type: "paket",
            refId: pkg.id,
            code: pkg.code,
            name: pkg.name,
            quantity: quantity,
            unit: "Paket",
            items: pkg.items,
          },
        ])
      }
    }

    setSelectedRefId("")
    setQuantity(1)
  }

  function handleRemoveLine(id: string) {
    setLines(lines.filter((l) => l.id !== id))
  }

  function handleUpdateQty(id: string, newQty: number) {
    if (newQty < 1) return
    setLines(lines.map((l) => (l.id === id ? { ...l, quantity: newQty } : l)))
  }

  // Master BMHP tidak menyimpan stok — produksi tidak perlu dicek stoknya.
  async function handleSubmit() {
    if (lines.length === 0) {
      toast.error("Daftar produksi masih kosong.")
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        note: note.trim() || null,
        items: lines.map((l) => ({
          type: l.type,
          ref_id: l.refId,
          quantity: l.quantity,
        })),
      }

      const res = await api.post("/master/production-bmhp", payload)
      toast.success(res.data?.message ?? "Produksi BMHP berhasil dibuat.")

      // Kosongkan form dan arahkan ke tab pengemasan
      setLines([])
      setNote("")
      onSuccess()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e.response?.data?.message ?? "Gagal memproses produksi BMHP.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin text-[#075489]" />
        <span className="ml-2 text-sm">Memuat data master BMHP...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Box Input Tambah Item */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-[#075489]" />
            <h3 className="text-sm font-semibold text-gray-900">Pilih BMHP yang Akan Diproduksi</h3>
          </div>

          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setAddMode("satuan")
                setSelectedRefId("")
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                addMode === "satuan"
                  ? "bg-[#075489] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              BMHP Satuan
            </button>
            <button
              type="button"
              onClick={() => {
                setAddMode("paket")
                setSelectedRefId("")
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                addMode === "paket"
                  ? "bg-[#075489] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Boxes className="h-3.5 w-3.5" />
              Paket BMHP
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <Label htmlFor="item-select">
              {addMode === "satuan" ? "Nama BMHP Satuan" : "Nama Paket BMHP"}
            </Label>
            <SelectSearch
              value={selectedRefId}
              onChange={(val) => setSelectedRefId(val)}
              options={selectOptions}
              placeholder={
                addMode === "satuan"
                  ? "Pilih atau cari BMHP satuan..."
                  : "Pilih atau cari paket BMHP..."
              }
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="qty-input">Jumlah Produksi</Label>
            <Input
              id="qty-input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <div className="md:col-span-2">
            <Button
              type="button"
              onClick={handleAddLine}
              className="w-full bg-[#075489] text-white hover:bg-[#064775]"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Tambah
            </Button>
          </div>
        </div>

        {/* Preview isi paket jika sedang memilih paket */}
        {currentSelectedPackage && currentSelectedPackage.items?.length > 0 && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900">
            <span className="font-semibold">Rincian Komponen Paket (per 1 set):</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {currentSelectedPackage.items.map((it) => (
                <span
                  key={it.id}
                  className="inline-flex items-center rounded-md bg-white px-2 py-1 font-medium text-blue-800 shadow-sm"
                >
                  {it.bmhp?.name ?? "BMHP"} × {it.qty} {it.bmhp?.unit ?? "Pcs"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabel Rincian Batch Produksi */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Daftar Item dalam Batch Produksi ({lines.length})
          </h3>
          {lines.length > 0 && (
            <button
              type="button"
              onClick={() => setLines([])}
              className="text-xs text-red-600 hover:underline"
            >
              Kosongkan Semua
            </button>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
            Belum ada item BMHP yang ditambahkan ke batch ini.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/75 text-xs font-semibold text-gray-600">
                <tr>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3">Kode & Nama</th>
                  <th className="px-4 py-3">Isi Komponen</th>
                  <th className="px-4 py-3 text-center">Jumlah</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <Badge
                        variant={line.type === "paket" ? "default" : "info"}
                        className={
                          line.type === "paket"
                            ? "bg-purple-100 text-purple-700 hover:bg-purple-100"
                            : "bg-blue-50 text-blue-700"
                        }
                      >
                        {line.type === "paket" ? "Paket" : "Satuan"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{line.name}</div>
                      <div className="text-xs text-gray-400">{line.code}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {line.type === "paket" && line.items ? (
                        <div className="space-y-0.5">
                          {line.items.map((it) => (
                            <div key={it.id}>
                              • {it.bmhp?.name ?? "BMHP"} × {it.qty * line.quantity}{" "}
                              {it.bmhp?.unit ?? "Pcs"}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>
                          {line.quantity} {line.unit}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(line.id, line.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        >
                          -
                        </button>
                        <span className="w-10 text-center font-semibold text-gray-900">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(line.id, line.quantity + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(line.id)}
                        className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Hapus baris"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Catatan & Tombol Eksekusi */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <Label htmlFor="production-note">Catatan Produksi (Opsional)</Label>
          <Textarea
            id="production-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan tambahan untuk batch produksi BMHP ini..."
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 pt-4">
          <div className="text-xs text-gray-500">
            Setelah tombol ditekan, batch langsung masuk ke antrean{" "}
            <strong>Inspeksi & Pengemasan</strong>.
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || lines.length === 0}
            className="bg-[#075489] text-white hover:bg-[#064775]"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mulai Produksi BMHP
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

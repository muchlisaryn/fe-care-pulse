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
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { Badge } from "@/components/atoms/Badge"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { useToast } from "@/components/molecules/ToastProvider"
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
      } catch {
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Panel tambah item — mengikuti layout form Produksi CSSD. */}
      <Card className="space-y-4 p-5 lg:col-span-2">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-[#075489]" />
          <h2 className="text-sm font-semibold text-gray-800">Tambah BMHP yang Diproduksi</h2>
        </div>

        {/* Mode satuan / paket */}
        <div className="flex gap-2">
          {(
            [
              { key: "satuan" as const, label: "BMHP Satuan", icon: Package },
              { key: "paket" as const, label: "Paket BMHP", icon: Boxes },
            ]
          ).map((m) => {
            const Icon = m.icon
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setAddMode(m.key)
                  setSelectedRefId("")
                }}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium " +
                  (addMode === m.key
                    ? "border-[#075489] bg-[#075489]/8 text-[#075489]"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            )
          })}
        </div>

        <div className="space-y-1.5">
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

        {/* Rincian isi paket (informasi) */}
        {currentSelectedPackage && currentSelectedPackage.items?.length > 0 && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
            <span className="font-semibold text-gray-600">Rincian isi paket (per 1 set):</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {currentSelectedPackage.items.map((it) => (
                <span
                  key={it.id}
                  className="rounded bg-white px-1.5 py-0.5 text-gray-600 ring-1 ring-gray-200"
                >
                  {it.bmhp?.name ?? "BMHP"} × {it.qty} {it.bmhp?.unit ?? "Pcs"}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="w-24 space-y-1.5">
            <Label htmlFor="qty-input">Jumlah</Label>
            <Input
              id="qty-input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <Button
            type="button"
            onClick={handleAddLine}
            disabled={!selectedRefId}
            className="bg-[#075489] text-white hover:bg-[#075489]/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah
          </Button>
        </div>
      </Card>

      {/* Daftar baris + submit — kartu kanan seperti Produksi CSSD. */}
      <Card className="flex flex-col p-5 lg:col-span-3">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Daftar Produksi</h2>
          {lines.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-[#075489]/10 px-2.5 py-1 text-xs font-semibold text-[#075489]">
              {lines.length} jenis
            </span>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-14 text-center">
            <p className="text-sm text-gray-400">
              Belum ada BMHP. Tambahkan dari panel kiri.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lines.map((line, i) => {
              const isPaket = line.type === "paket"
              return (
                <div
                  key={line.id}
                  className={
                    "group relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
                    (isPaket ? "border-[#4ba69d]/30" : "border-[#075489]/20")
                  }
                >
                  {/* Aksen warna kiri sesuai tipe (paket = teal, satuan = biru). */}
                  <span
                    className={"absolute inset-y-0 left-0 w-1 " + (isPaket ? "bg-[#4ba69d]" : "bg-[#075489]")}
                  />
                  <div className="flex items-center gap-3 py-2.5 pl-4 pr-3">
                    <span
                      className={
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white " +
                        (isPaket ? "bg-[#4ba69d]" : "bg-[#075489]")
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-800">{line.name}</span>
                        <Badge variant={isPaket ? "info" : "default"}>
                          {isPaket ? "Paket" : "Satuan"}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-400">{line.code}</div>

                      {isPaket && line.items && line.items.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <Package className="h-3 w-3" /> Berisi:
                          </span>
                          {line.items.map((it) => (
                            <span
                              key={it.id}
                              className="rounded-md bg-[#4ba69d]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#4ba69d] ring-1 ring-[#4ba69d]/20"
                            >
                              {it.bmhp?.name ?? "BMHP"} ×{it.qty * line.quantity}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => handleUpdateQty(line.id, Number(e.target.value) || 1)}
                        className="h-9 w-16 text-center font-semibold"
                      />
                      <span className="w-6 text-[11px] text-gray-400">{isPaket ? "set" : "unit"}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(line.id)}
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Hapus baris"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="production-note">Catatan (opsional)</Label>
          <Textarea
            id="production-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan tambahan untuk batch produksi BMHP ini..."
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Setelah tombol ditekan, batch langsung masuk ke antrean{" "}
            <strong>Inspeksi &amp; Pengemasan</strong>.
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || lines.length === 0}
            className="bg-[#4ba69d] text-white shadow-sm hover:bg-[#4ba69d]/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mulai Produksi BMHP
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}

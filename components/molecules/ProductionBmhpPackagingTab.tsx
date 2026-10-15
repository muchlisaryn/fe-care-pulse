"use client"

import { useEffect, useMemo, useState } from "react"
import {
  PackageCheck,
  Printer,
  Search,
  Loader2,
  Calendar,
  CheckCircle2,
  Tag,
  Clock,
  Sparkles,
  Boxes,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import { Barcode } from "@/components/atoms/Barcode"
import { useToast } from "@/components/molecules/ToastProvider"
import { useLanguage } from "@/lib/i18n"
import api from "@/lib/axios"

export type PackagingBmhpItem = {
  id: number
  packaging_bmhp_id: number
  production_bmhp_item_id: number
  barcode_no: string
  production_item?: {
    id: number
    name: string
    source: string
    package_name?: string
    package_no?: number
    quantity: number
    unit_name?: string
  }
}

export type PackagingBmhpRecord = {
  id: number
  prefix: string
  code: string
  status: "diproses" | "selesai" | "sterilisasi"
  packaging_type_id?: number | null
  packaging_type?: {
    id: number
    name: string
    shelf_life_days: number
  } | null
  chemical_indicator?: string | null
  operator?: string | null
  packaged_at?: string | null
  expiry_date?: string | null
  note?: string | null
  created_at: string
  production?: {
    id: number
    code: string
    note?: string | null
    items?: {
      id: number
      source: string
      name: string
      package_no?: number
      quantity: number
      unit_name?: string
    }[]
  } | null
  items?: PackagingBmhpItem[]
}

type Props = {
  onGoToSterilization: () => void
}

export function ProductionBmhpPackagingTab({ onGoToSterilization }: Props) {
  const toast = useToast()
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<PackagingBmhpRecord[]>([])
  const [search, setSearch] = useState("")

  // Master jenis kemasan
  const [packagingTypes, setPackagingTypes] = useState<
    { id: number; name: string; shelf_life_days: number }[]
  >([])

  // Modal Inspeksi & Pengemasan
  const [packagingModalItem, setPackagingModalItem] = useState<PackagingBmhpRecord | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<string>("")
  const [chemicalIndicator, setChemicalIndicator] = useState<string>("")
  const [operator, setOperator] = useState<string>("")
  const [packNote, setPackNote] = useState<string>("")
  const [completing, setCompleting] = useState(false)

  // Modal Cetak Label
  const [printModalData, setPrintModalData] = useState<{
    packaging: PackagingBmhpRecord
    labels: {
      label_code: string
      barcode_no: string
      title: string
      kind: string
      package_no?: number
      operator?: string
      packaged_at?: string
      expiry_date?: string
      packaging_type?: string
    }[]
  } | null>(null)

  async function loadData() {
    try {
      setLoading(true)
      const [resPkg, resCand] = await Promise.all([
        api.get("/master/production-bmhp/packaging", { params: { search: search || undefined } }),
        api.get("/master/production-bmhp/candidates"),
      ])
      setItems(resPkg.data?.data ?? [])
      setPackagingTypes(resCand.data?.data?.packaging_types ?? [])
    } catch {
      toast.error("Gagal memuat daftar antrean pengemasan BMHP.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [search])

  const typeOptions = useMemo(
    () =>
      packagingTypes.map((pt) => ({
        value: String(pt.id),
        label: `${pt.name} (Masa simpan: ${pt.shelf_life_days} hari)`,
      })),
    [packagingTypes],
  )

  function openPackagingModal(record: PackagingBmhpRecord) {
    setPackagingModalItem(record)
    setSelectedTypeId(record.packaging_type_id ? String(record.packaging_type_id) : "")
    setChemicalIndicator(record.chemical_indicator ?? "")
    setOperator(record.operator ?? "")
    setPackNote(record.note ?? "")
  }

  async function handleCompletePackaging() {
    if (!packagingModalItem) return
    if (!selectedTypeId) {
      toast.error("Silakan pilih jenis kemasan.")
      return
    }
    if (!chemicalIndicator.trim()) {
      toast.error("Nomor lot indikator kimia wajib diisi.")
      return
    }

    setCompleting(true)
    try {
      const payload = {
        packaging_type_id: Number(selectedTypeId),
        chemical_indicator: chemicalIndicator.trim(),
        operator: operator.trim() || undefined,
        note: packNote.trim() || undefined,
      }

      const res = await api.post(
        `/master/production-bmhp/packaging/${packagingModalItem.id}/complete`,
        payload,
      )

      toast.success("Pengemasan selesai — batch siap untuk sterilisasi.")
      setPackagingModalItem(null)

      // Buka modal cetak label
      if (res.data?.data?.labels) {
        setPrintModalData({
          packaging: res.data.data.packaging,
          labels: res.data.data.labels,
        })
      }

      loadData()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e.response?.data?.message ?? "Gagal menyelesaikan pengemasan.")
    } finally {
      setCompleting(false)
    }
  }

  function handleViewLabels(record: PackagingBmhpRecord) {
    const labels = (record.items ?? []).map((it) => {
      const pi = it.production_item
      return {
        label_code: `${record.prefix} ${record.code}${pi?.package_no ? ` ${pi.package_no}` : ""}`,
        barcode_no: it.barcode_no,
        title: pi?.name ?? "BMHP",
        kind: pi?.source ?? "satuan",
        package_no: pi?.package_no,
        operator: record.operator ?? undefined,
        packaged_at: record.packaged_at ?? undefined,
        expiry_date: record.expiry_date ?? undefined,
        packaging_type: record.packaging_type?.name,
      }
    })

    setPrintModalData({
      packaging: record,
      labels,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header bar & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode batch, produksi, atau item..."
            className="pl-9"
          />
        </div>

        <Button
          type="button"
          onClick={loadData}
          variant="outline"
          className="text-xs text-gray-600"
        >
          Muat Ulang
        </Button>
      </div>

      {/* Tabel Daftar Pengemasan */}
      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#075489]" />
          <span className="ml-2 text-sm">Memuat antrean pengemasan...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          Tidak ada antrean pengemasan BMHP saat ini.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((pkg) => {
            const isCompleted = pkg.status === "selesai" || pkg.status === "sterilisasi"

            return (
              <div
                key={pkg.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-[#075489]">
                      {pkg.prefix}
                      {pkg.code}
                    </span>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-gray-600">
                      Dari Produksi:{" "}
                      <strong className="text-gray-900">{pkg.production?.code ?? "-"}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        pkg.status === "sterilisasi"
                          ? "bg-purple-50 text-purple-700"
                          : isCompleted
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                      }
                    >
                      {pkg.status === "sterilisasi"
                        ? "Dalam Sterilisasi"
                        : isCompleted
                          ? "Siap Steril"
                          : "Menunggu Pengemasan"}
                    </Badge>
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
                    <div className="space-y-1.5 md:col-span-8">
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Rincian Item BMHP
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pkg.production?.items?.map((it) => (
                          <div
                            key={it.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-800"
                          >
                            <Boxes className="h-3.5 w-3.5 text-[#075489]" />
                            <span>{it.name}</span>
                            <span className="text-gray-400">•</span>
                            <span className="font-semibold text-[#075489]">
                              {it.quantity} {it.unit_name}
                            </span>
                          </div>
                        ))}
                      </div>

                      {pkg.packaging_type && (
                        <div className="mt-2 text-xs text-gray-500">
                          Kemasan: <strong>{pkg.packaging_type.name}</strong> • Expired:{" "}
                          <strong>{pkg.expiry_date ?? "-"}</strong>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 md:col-span-4">
                      {isCompleted ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleViewLabels(pkg)}
                            className="text-xs text-[#075489] hover:bg-blue-50"
                          >
                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                            Cetak Label
                          </Button>

                          {pkg.status === "selesai" && (
                            <Button
                              type="button"
                              onClick={onGoToSterilization}
                              className="bg-[#075489] text-xs text-white hover:bg-[#064775]"
                            >
                              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                              Ke Sterilisasi
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => openPackagingModal(pkg)}
                          className="bg-amber-600 text-xs text-white hover:bg-amber-700"
                        >
                          <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
                          Inspeksi & Kemas
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Form Inspeksi & Pengemasan */}
      {packagingModalItem && (
        <Modal
          open={!!packagingModalItem}
          onClose={() => setPackagingModalItem(null)}
          title="Inspeksi & Pengemasan BMHP"
          size="md"
        >
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              Batch:{" "}
              <strong className="text-gray-900">
                {packagingModalItem.prefix}
                {packagingModalItem.code}
              </strong>{" "}
              • Produksi:{" "}
              <strong className="text-gray-900">
                {packagingModalItem.production?.code ?? "-"}
              </strong>
            </div>

            <div>
              <Label htmlFor="pkg-type-select">
                Jenis Kemasan <span className="text-red-500">*</span>
              </Label>
              <SelectSearch
                value={selectedTypeId}
                onChange={(v) => setSelectedTypeId(v)}
                options={typeOptions}
                placeholder="Pilih jenis kemasan..."
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Jenis kemasan menentukan masa simpan steril (tgl kedaluwarsa otomatis).
              </p>
            </div>

            <div>
              <Label htmlFor="chem-ind">
                Lot / Batch Indikator Kimia <span className="text-red-500">*</span>
              </Label>
              <Input
                id="chem-ind"
                value={chemicalIndicator}
                onChange={(e) => setChemicalIndicator(e.target.value)}
                placeholder="Contoh: LOT-CHEM-2026-001"
              />
            </div>

            <div>
              <Label htmlFor="op-name">Nama Petugas Pengemas</Label>
              <Input
                id="op-name"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="Nama operator yang melakukan pengemasan..."
              />
            </div>

            <div>
              <Label htmlFor="pack-note">Catatan Tambahan</Label>
              <Input
                id="pack-note"
                value={packNote}
                onChange={(e) => setPackNote(e.target.value)}
                placeholder="Catatan inspeksi atau kondisi..."
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPackagingModalItem(null)}
                disabled={completing}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleCompletePackaging}
                disabled={completing}
                className="bg-[#075489] text-white hover:bg-[#064775]"
              >
                {completing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Selesai & Cetak Label
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Dialog Cetak Label Barcode */}
      {printModalData && (
        <Modal
          open={!!printModalData}
          onClose={() => setPrintModalData(null)}
          title="Label Kemasan Steril BMHP"
          size="lg"
        >
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Total Label: <strong>{printModalData.labels.length}</strong>
              </span>
              <Button
                type="button"
                onClick={() => window.print()}
                className="bg-[#075489] text-xs text-white hover:bg-[#064775]"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Cetak ke Printer
              </Button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {printModalData.labels.map((lbl, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center justify-between gap-4 rounded-xl border border-gray-300 bg-white p-4 sm:flex-row"
                >
                  <div className="space-y-1 text-center sm:text-left">
                    <div className="font-mono text-sm font-bold text-gray-900">
                      {lbl.label_code}
                    </div>
                    <div className="text-xs font-semibold text-[#075489]">{lbl.title}</div>
                    <div className="text-[11px] text-gray-500">
                      Kemasan: {lbl.packaging_type ?? "-"} • Petugas: {lbl.operator ?? "-"}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Tgl Kemas: {lbl.packaged_at ?? "-"} | Exp: {lbl.expiry_date ?? "-"}
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <Barcode value={lbl.barcode_no} moduleWidth={1.4} height={45} />
                    <span className="font-mono text-[10px] text-gray-400">{lbl.barcode_no}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setPrintModalData(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

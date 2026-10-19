"use client"

import { useMemo, useRef, useState } from "react"
import {
  PackageCheck,
  Printer,
  Search,
  Loader2,
  Calendar,
  CheckCircle2,
  Tag,
  Clock,
  Boxes,
  RotateCcw,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Pagination } from "@/components/molecules/Pagination"
import { Barcode } from "@/components/atoms/Barcode"
import { useToast } from "@/components/molecules/ToastProvider"
import { useLanguage } from "@/lib/i18n"
import { usePagedList } from "@/lib/usePagedList"
import { packagingContents } from "@/lib/bmhpPackaging"
import { rentangSemingguTerakhir } from "@/lib/dateRange"
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

export function ProductionBmhpPackagingTab() {
  const toast = useToast()
  const { t } = useLanguage()

  // Filter: `draft` = isi form; baru diterapkan (`filter`) saat form Cari disubmit.
  // Rentang tanggal (tgl kemasan dibuat) bawaannya seminggu terakhir.
  const [defaultFilter] = useState(() => {
    const { from, to } = rentangSemingguTerakhir()
    return { search: "", dateFrom: from, dateTo: to }
  })
  const [draft, setDraft] = useState(defaultFilter)
  const [filter, setFilter] = useState(defaultFilter)
  const isFiltered =
    filter.search !== defaultFilter.search ||
    filter.dateFrom !== defaultFilter.dateFrom ||
    filter.dateTo !== defaultFilter.dateTo

  // Antrean ber-pagination: hanya halaman yang dibuka yang diambil (20 per halaman).
  const { items, loading, page, setPage, totalPages, totalItems, perPage, reload } =
    usePagedList<PackagingBmhpRecord>(
      "/master/production-bmhp/packaging",
      {
        search: filter.search || undefined,
        date_from: filter.dateFrom || undefined,
        date_to: filter.dateTo || undefined,
      },
      () => toast.error("Gagal memuat daftar antrean pengemasan BMHP."),
    )

  // Master jenis kemasan — baru diambil saat modal pengemasan pertama kali dibuka.
  const [packagingTypes, setPackagingTypes] = useState<
    { value: number; label: string; shelf_life_days: number }[]
  >([])
  const [packagingTypesLoading, setPackagingTypesLoading] = useState(false)
  const packagingTypesLoadedRef = useRef(false)

  // Modal Inspeksi & Pengemasan
  const [packagingModalItem, setPackagingModalItem] = useState<PackagingBmhpRecord | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<string>("")
  const [chemicalIndicator, setChemicalIndicator] = useState<string>("")
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

  async function loadPackagingTypes() {
    if (packagingTypesLoadedRef.current || packagingTypesLoading) return
    setPackagingTypesLoading(true)
    try {
      const res = await api.get("/master/packaging-types/options")
      setPackagingTypes(res.data?.data ?? [])
      packagingTypesLoadedRef.current = true
    } catch {
      toast.error("Gagal memuat daftar jenis kemasan.")
    } finally {
      setPackagingTypesLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setFilter(draft)
    setPage(1)
  }

  function resetFilter() {
    setDraft(defaultFilter)
    setFilter(defaultFilter)
    setPage(1)
  }

  const typeOptions = useMemo(
    () =>
      packagingTypes.map((pt) => ({
        value: String(pt.value),
        label: `${pt.label} (Masa simpan: ${pt.shelf_life_days} hari)`,
      })),
    [packagingTypes],
  )

  function openPackagingModal(record: PackagingBmhpRecord) {
    loadPackagingTypes()
    setPackagingModalItem(record)
    setSelectedTypeId(record.packaging_type_id ? String(record.packaging_type_id) : "")
    setChemicalIndicator(record.chemical_indicator ?? "")
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
      // Petugas pengemas tidak diisi manual — backend memakai nama user yang login.
      const payload = {
        packaging_type_id: Number(selectedTypeId),
        chemical_indicator: chemicalIndicator.trim(),
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

      reload()
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
        label_code: `${record.prefix}${record.code}${pi?.package_no ? ` ${pi.package_no}` : ""}`,
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
      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10.5rem_10.5rem_auto] lg:items-end"
      >
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            placeholder="Cari kode batch, produksi, atau item..."
            className="pl-9"
          />
        </div>
        <DateRangeFields
          from={draft.dateFrom}
          to={draft.dateTo}
          onFromChange={(v) => setDraft((d) => ({ ...d, dateFrom: v }))}
          onToChange={(v) => setDraft((d) => ({ ...d, dateTo: v }))}
        />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" className="flex-1 bg-[#075489] text-white hover:bg-[#075489]/90 lg:flex-none">
            {t("common.search")}
          </Button>
          {isFiltered && (
            <Button
              type="button"
              onClick={resetFilter}
              variant="outline"
              title={t("common.reset")}
              aria-label={t("common.reset")}
              className="shrink-0 text-gray-600"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            onClick={reload}
            variant="outline"
            className="shrink-0 text-xs text-gray-600"
          >
            Muat Ulang
          </Button>
        </div>
      </form>

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
                        {packagingContents(pkg.items).map((it) => (
                          <div
                            key={`${it.name}|${it.unit_name ?? ""}`}
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

                      {/* Kemasan GS- = kemas ulang otomatis setelah batch gagal steril. */}
                      {pkg.prefix.startsWith("GS-") && pkg.note && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {pkg.note}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 md:col-span-4">
                      {isCompleted ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleViewLabels(pkg)}
                          className="text-xs text-[#075489] hover:bg-blue-50"
                        >
                          <Printer className="mr-1.5 h-3.5 w-3.5" />
                          Cetak Label
                        </Button>
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
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={setPage}
          />
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
                placeholder={packagingTypesLoading ? t("common.loading") : "Pilih jenis kemasan..."}
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

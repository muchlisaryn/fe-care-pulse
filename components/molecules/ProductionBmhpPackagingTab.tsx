"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  PackageCheck,
  Printer,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import { Pagination } from "@/components/molecules/Pagination"
import { BmhpContentChips } from "@/components/molecules/BmhpContentChips"
import { Barcode } from "@/components/atoms/Barcode"
import { useToast } from "@/components/molecules/ToastProvider"
import { useLanguage, localeOf, type Lang } from "@/lib/i18n"
import { usePagedList } from "@/lib/usePagedList"
import type { BmhpPipelineFilter } from "@/lib/bmhpPackaging"
import { FAILURE_REASONS } from "@/lib/bmhpSterilization"
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
  /** Terisi = sudah selesai dikemas (siap / sudah masuk sterilisasi). */
  completed_at?: string | null
  /** Tahap kemasan dari backend (PackagingBmhp::stage()) — menentukan warna kartu. */
  stage?: PackagingStage
  /** Kemasan di-void (mis. gagal steril) — tampil sebagai riwayat saja. */
  disabled?: boolean
  /** Rincian void (JSON) — lihat PackagingBmhp::$casts di backend. */
  disabled_reason?: {
    reason: string
    packaging?: { id: number; code: string } | null
    sterilization?: { id: number; code: string; failure_reason?: string | null; failure_note?: string | null } | null
    replaced_by?: { id: number; code: string } | null
    by?: string | null
    at?: string | null
  } | null
  disabled_by?: string | null
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
  items?: PackagingBmhpItem[]
}

type PackagingStage = "belum" | "siap" | "sterilisasi" | "steril" | "gagal"

// Lencana tahap di pojok kartu — status tetap terbaca tanpa aksen garis tepi.
const STAGE_BADGE: Record<PackagingStage, { label: string; tone: string }> = {
  belum: { label: "Belum dikemas", tone: "bg-amber-100 text-amber-800" },
  siap: { label: "Siap steril", tone: "bg-sky-100 text-sky-800" },
  sterilisasi: { label: "Proses steril", tone: "bg-indigo-100 text-indigo-800" },
  steril: { label: "Steril", tone: "bg-emerald-100 text-emerald-800" },
  gagal: { label: "Gagal steril", tone: "bg-red-100 text-red-700" },
}

// Label `disabled_reason.reason` (PackagingBmhp::DISABLED_*).
const DISABLED_REASON_LABEL: Record<string, string> = {
  gagal_steril: "Gagal steril",
}

/** Rincian kemasan void: "Gagal steril — Kemasan rusak (AUT01-…) • Packaging ulang dengan kode GS-…". */
function VoidInfo({ detail }: { detail: PackagingBmhpRecord["disabled_reason"] }) {
  const ster = detail?.sterilization
  const failure =
    ster?.failure_reason === "lainnya"
      ? ster.failure_note
      : FAILURE_REASONS.find((r) => r.value === ster?.failure_reason)?.label

  return (
    <div className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>{DISABLED_REASON_LABEL[detail?.reason ?? ""] ?? "Di-void"}</span>
      {failure && <span>— {failure}</span>}
      {ster?.code && <span className="font-mono font-normal">({ster.code})</span>}
      {detail?.replaced_by && (
        <span className="font-normal">
          • Packaging ulang dengan kode <span className="font-mono">{detail.replaced_by.code}</span>
        </span>
      )}
    </div>
  )
}

// Chip filter tahap (`?stage=` di backend) — tanpa penanda warna tahap.
type StageFilter = "" | "belum" | "proses" | "steril" | "gagal"
const STAGE_FILTERS: { key: StageFilter; label: string }[] = [
  { key: "", label: "Semua" },
  { key: "belum", label: "Belum dikemas" },
  { key: "proses", label: "Proses sterilisasi" },
  { key: "steril", label: "Berhasil steril" },
  { key: "gagal", label: "Gagal steril" },
]

// Tanggal dari API berupa ISO (2026-11-19T00:00:00.000000Z) — tampilkan tanggalnya
// saja, nama bulan ikut bahasa aktif.
function formatDate(value: string | null | undefined, lang: Lang) {
  if (!value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(localeOf(lang), { day: "2-digit", month: "short", year: "numeric" })
}

type Props = {
  /** Filter pencarian & rentang tanggal dari halaman (sama seperti Produksi CSSD). */
  filter: BmhpPipelineFilter
}

export function ProductionBmhpPackagingTab({ filter }: Props) {
  const toast = useToast()
  const { t, lang } = useLanguage()

  // Filter tahap dari chip — langsung diterapkan saat diklik.
  const [stage, setStage] = useState<StageFilter>("")

  // Antrean ber-pagination: hanya halaman yang dibuka yang diambil (20 per halaman).
  const { items, loading, page, setPage, totalPages, totalItems, perPage, reload } =
    usePagedList<PackagingBmhpRecord>(
      "/master/production-bmhp/packaging",
      {
        search: filter.search || undefined,
        date_from: filter.dateFrom || undefined,
        date_to: filter.dateTo || undefined,
        stage: stage || undefined,
      },
      () => toast.error("Gagal memuat daftar antrean pengemasan BMHP."),
    )

  // Filter berubah dari halaman → kembali ke halaman pertama daftar.
  useEffect(() => {
    setPage(1)
  }, [filter.search, filter.dateFrom, filter.dateTo, setPage])

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

  function changeStage(next: StageFilter) {
    setStage(next)
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
      {/* Filter tahap — sekaligus keterangan warna garis kiri kartu. Langsung
          diterapkan saat diklik (bukan lewat tombol Cari). */}
      <div className="flex flex-wrap gap-2">
        {STAGE_FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            type="button"
            onClick={() => changeStage(f.key)}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              stage === f.key
                ? "border-[#075489] bg-[#075489]/10 text-[#075489]"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
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
        <div className="space-y-3">
          {/* Kotak-kotak ringkas seperti tab Sterilisasi — 3 kolom di layar lebar. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((pkg) => {
              const isCompleted = Boolean(pkg.completed_at)
              const isVoid = Boolean(pkg.disabled)
              const stageKey = pkg.stage ?? (isCompleted ? "siap" : "belum")

              return (
                <div
                  key={pkg.id}
                  className={`flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition hover:shadow-sm ${
                    isVoid ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-sm font-bold text-[#075489]">
                        {pkg.prefix}
                        {pkg.code}
                      </span>
                      {/* Tanggal dikemas — kosong selama belum Inspeksi & Kemas. */}
                      <div className="text-[11px] text-gray-500">
                        Dikemas:{" "}
                        {pkg.packaged_at ? formatDate(pkg.packaged_at, lang) : <span className="text-gray-400">—</span>}
                      </div>
                    </div>
                    <Badge className={`shrink-0 ${STAGE_BADGE[stageKey].tone}`}>{STAGE_BADGE[stageKey].label}</Badge>
                  </div>

                  <div className="mt-3 flex-1 space-y-1 border-t border-gray-100 pt-3 text-xs">
                    <BmhpContentChips packagings={[pkg.items]} />
                    <div className="text-[11px] text-gray-500">
                      Kemasan: <strong>{pkg.packaging_type?.name ?? "-"}</strong>
                      {pkg.expiry_date && (
                        <>
                          {" "}
                          • Exp: <strong>{formatDate(pkg.expiry_date, lang)}</strong>
                        </>
                      )}
                    </div>

                    {/* Kemasan void: rinciannya dari JSON `disabled_reason` — alasan,
                        siklus steril & alasan gagalnya, kemasan packaging ulang. */}
                    {isVoid && <VoidInfo detail={pkg.disabled_reason} />}
                  </div>

                  {/* Kemasan void sudah digantikan kemasan baru — tanpa aksi. */}
                  {!isVoid && (
                    <div className="mt-3">
                      {isCompleted ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleViewLabels(pkg)}
                          className="w-full text-xs text-[#075489] hover:bg-blue-50"
                        >
                          <Printer className="mr-1.5 h-3.5 w-3.5" />
                          Cetak Label
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => openPackagingModal(pkg)}
                          className="w-full bg-amber-600 text-xs text-white hover:bg-amber-700"
                        >
                          <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
                          Inspeksi & Kemas
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="pkg-type-select">
                Jenis Kemasan <span className="text-red-500">*</span>
              </Label>
              <SelectSearch
                value={selectedTypeId}
                onChange={(v) => setSelectedTypeId(v)}
                options={typeOptions}
                placeholder={packagingTypesLoading ? t("common.loading") : "Pilih jenis kemasan..."}
              />
              <p className="text-[11px] text-gray-500">
                Jenis kemasan menentukan masa simpan steril (tgl kedaluwarsa otomatis).
              </p>
            </div>

            <div className="space-y-1.5">
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
                      Tgl Kemas: {formatDate(lbl.packaged_at, lang)} | Exp:{" "}
                      {formatDate(lbl.expiry_date, lang)}
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

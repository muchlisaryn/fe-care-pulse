"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Check,
  Flame,
  Layers,
  AlertTriangle,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Pagination } from "@/components/molecules/Pagination"
import { BmhpContentChips } from "@/components/molecules/BmhpContentChips"
import { useToast } from "@/components/molecules/ToastProvider"
import { localeOf, useLanguage } from "@/lib/i18n"
import { usePagedList } from "@/lib/usePagedList"
import { packagingContents } from "@/lib/bmhpPackaging"
import { FAILURE_REASONS } from "@/lib/bmhpSterilization"
import { tanggalLokal } from "@/lib/dateRange"
import api from "@/lib/axios"

type SterilizerMachineOption = { id: number; name: string; temperature?: number; duration_minutes?: number }

export type SterilReadyPackaging = {
  id: number
  prefix: string
  code: string
  packaging_type?: { name: string } | null
  packaged_at?: string | null
  expiry_date?: string | null
  production?: {
    code: string
    items?: { id: number; name: string; quantity: number; unit_name?: string }[]
  } | null
  items?: {
    id: number
    barcode_no: string
    production_item?: { name: string; quantity?: number; unit_name?: string | null }
  }[]
}

/** Batch sterilisasi — kode {kode mesin}-{ddmmyy}-{urut}, mis. AUT01-191026-03. */
type IndicatorResult = "lulus" | "gagal"

// Indikator yang dicek saat validasi; Bowie-Dick hanya untuk mesin uap.
// `reason` = alasan gagal yang otomatis dipilih bila indikator itu gagal.
const INDICATORS = [
  { key: "chemical_indicator_result", label: "Indikator Kimia", reason: "indikator_kimia", uapOnly: false },
  { key: "bio_indicator_result", label: "Indikator Biologi", reason: "indikator_biologi", uapOnly: false },
  { key: "bowie_dick_result", label: "Bowie-Dick", reason: "bowie_dick", uapOnly: true },
] as const

type IndicatorKey = (typeof INDICATORS)[number]["key"]

const emptyIndicators: Record<IndicatorKey, IndicatorResult | ""> = {
  chemical_indicator_result: "",
  bio_indicator_result: "",
  bowie_dick_result: "",
}

export type SterilizationBmhpBatch = {
  id: number
  code: string
  machine_id?: number | null
  machine_name?: string | null
  method: string
  cycle_number?: number | null
  temperature?: number | null
  duration_minutes?: number | null
  operator?: string | null
  bio_indicator_lot?: string | null
  chemical_indicator_lot?: string | null
  chemical_indicator_result?: IndicatorResult | null
  bio_indicator_result?: IndicatorResult | null
  bowie_dick_result?: IndicatorResult | null
  status: "diproses" | "selesai" | "gagal"
  failure_reason?: string | null
  failure_note?: string | null
  sterilized_at?: string | null
  expiry_date?: string | null
  note?: string | null
  started_by?: string | null
  started_at?: string | null
  completed_by?: string | null
  completed_at?: string | null
  created_at: string
  machine?: { id: number; name: string; temperature?: number; duration_minutes?: number } | null
  items?: {
    id: number
    packaging_barcode?: string | null
    result?: string | null
    packaging?: {
      id: number
      prefix: string
      code: string
      packaging_type?: { name: string } | null
      disabled?: boolean
      disabled_by?: string | null
      items?: SterilReadyPackaging["items"]
    } | null
  }[]
}

/** Tahap baris di daftar Sterilisasi — menentukan warna kartu. */
type SterilStage = "belum" | "menunggu" | "sudah"

/** Satu baris feed `/sterilization/feed`: kemasan siap steril ATAU batch sterilisasi. */
type SterilFeedRow =
  | { kind: "packaging"; status: "belum"; packaging: SterilReadyPackaging; batch: null }
  | { kind: "batch"; status: "menunggu" | "sudah"; packaging: null; batch: SterilizationBmhpBatch }

// Chip filter tahap. Warna titiknya = warna aksen kartu tahap itu.
const STAGE_FILTERS: { key: SterilStage | ""; labelKey: string; dot: string }[] = [
  { key: "", labelKey: "productionBmhp.sterAll", dot: "bg-gray-300" },
  { key: "belum", labelKey: "productionBmhp.sterPending", dot: "bg-sky-500" },
  { key: "menunggu", labelKey: "productionBmhp.sterWaiting", dot: "bg-indigo-500" },
  { key: "sudah", labelKey: "productionBmhp.sterDone", dot: "bg-emerald-500" },
]

/** Kemasan unik dalam satu batch — satu item batch = satu label, jadi kemasan paket muncul berulang per set. */
function batchPackagings(batch: SterilizationBmhpBatch) {
  return [
    ...new Map(
      (batch.items ?? []).flatMap((it) => (it.packaging ? [[it.packaging.id, it.packaging] as const] : [])),
    ).values(),
  ]
}


export function ProductionBmhpSterilizationTab() {
  const toast = useToast()
  const { t } = useLanguage()

  // Satu daftar untuk ketiga tahap; `stage` menyaring satu tahap saja (chip filter).
  const [stage, setStage] = useState<SterilStage | "">("")
  // Filter: `draft` = isi form; baru diterapkan (`filter`) saat form Cari disubmit.
  // Rentang tanggal bawaannya hari ini saja — kemasan: tgl dikemas, batch: tgl
  // steril (atau dibuat bila belum divalidasi).
  const [defaultFilter] = useState(() => {
    const today = tanggalLokal(new Date())
    return { search: "", dateFrom: today, dateTo: today }
  })
  const [draft, setDraft] = useState(defaultFilter)
  const [filter, setFilter] = useState(defaultFilter)
  const isFiltered =
    filter.search !== defaultFilter.search ||
    filter.dateFrom !== defaultFilter.dateFrom ||
    filter.dateTo !== defaultFilter.dateTo
  const filterParams = {
    search: filter.search || undefined,
    date_from: filter.dateFrom || undefined,
    date_to: filter.dateTo || undefined,
  }

  // Ber-pagination: hanya halaman yang dibuka yang diambil (10 per halaman).
  const {
    items: rows,
    loading,
    page,
    setPage,
    totalPages,
    totalItems,
    perPage,
    reload: reloadFeed,
  } = usePagedList<SterilFeedRow>(
    "/master/production-bmhp/sterilization/feed",
    { ...filterParams, status: stage || undefined },
    () => toast.error("Gagal memuat data sterilisasi BMHP."),
  )
  const readyList = useMemo(
    () => rows.flatMap((r) => (r.kind === "packaging" ? [r.packaging] : [])),
    [rows],
  )

  // Jumlah di chip filter — dihitung server, bukan dari daftar yang baru termuat
  // sebagian.
  const [summary, setSummary] = useState<Record<SterilStage, number> | null>(null)
  const [summaryVersion, setSummaryVersion] = useState(0)
  const filterJson = JSON.stringify(filterParams)
  useEffect(() => {
    let cancelled = false
    api
      .get("/master/production-bmhp/sterilization/summary", { params: JSON.parse(filterJson) })
      .then((res) => {
        if (!cancelled) setSummary(res.data?.data ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [filterJson, summaryVersion])

  function reloadAll() {
    reloadFeed()
    setSummaryVersion((v) => v + 1)
  }

  function changeStage(next: SterilStage | "") {
    setStage(next)
    setPage(1)
    setSelectedPkgIds(new Set())
  }

  function changePage(next: number) {
    setPage(next)
    setSelectedPkgIds(new Set())
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSelectedPkgIds(new Set())
    setFilter(draft)
    setPage(1)
  }

  function resetFilter() {
    setSelectedPkgIds(new Set())
    setDraft(defaultFilter)
    setFilter(defaultFilter)
    setPage(1)
  }

  // Master mesin sterilisator — baru diambil saat modal Mulai Sterilisasi dibuka.
  const [machines, setMachines] = useState<SterilizerMachineOption[]>([])
  const [machinesLoading, setMachinesLoading] = useState(false)
  const machinesLoadedRef = useRef(false)

  // Centang kemasan yang mau disterilisasi
  const [selectedPkgIds, setSelectedPkgIds] = useState<Set<number>>(new Set())

  // Modal Mulai Sterilisasi
  const [startModalOpen, setStartModalOpen] = useState(false)
  const [selectedMachineId, setSelectedMachineId] = useState<string>("")
  const [method, setMethod] = useState<string>("uap")
  const [cycleNumber, setCycleNumber] = useState<string>("")
  const [temperature, setTemperature] = useState<string>("")
  const [durationMinutes, setDurationMinutes] = useState<string>("")
  const [bioIndicatorLot, setBioIndicatorLot] = useState<string>("")
  const [chemIndicatorLot, setChemIndicatorLot] = useState<string>("")
  const [sterilNote, setSterilNote] = useState<string>("")
  const [submittingBatch, setSubmittingBatch] = useState(false)

  // Modal Validasi Hasil
  const [validatingBatch, setValidatingBatch] = useState<SterilizationBmhpBatch | null>(null)
  // Kode batch yang barusan divalidasi steril → dialog "Berhasil Steril".
  const [sterileResult, setSterileResult] = useState<string | null>(null)
  // Modal Detail Batch (klik kartu batch)
  const [detailBatch, setDetailBatch] = useState<SterilizationBmhpBatch | null>(null)
  const [validationResult, setValidationResult] = useState<"steril" | "gagal">("steril")
  const [indicators, setIndicators] = useState(emptyIndicators)
  const [failureReason, setFailureReason] = useState<string>("")
  // Alasan yang diketik sendiri — hanya untuk alasan "Lainnya".
  const [failureNote, setFailureNote] = useState<string>("")
  const [submittingValidation, setSubmittingValidation] = useState(false)

  // Indikator yang ditampilkan untuk batch ini, dan apakah salah satunya gagal —
  // bila ya, batch tidak bisa dinyatakan steril.
  const shownIndicators = INDICATORS.filter((i) => !i.uapOnly || validatingBatch?.method === "uap")
  const indicatorFailed = shownIndicators.some((i) => indicators[i.key] === "gagal")
  const isOtherReason = failureReason === "lainnya"
  const canValidate =
    validationResult === "steril"
      ? !indicatorFailed
      : failureReason !== "" && (!isOtherReason || failureNote.trim() !== "")

  function openValidation(batch: SterilizationBmhpBatch) {
    setValidatingBatch(batch)
    setValidationResult("steril")
    setIndicators(emptyIndicators)
    setFailureReason("")
    setFailureNote("")
  }

  function setIndicator(key: IndicatorKey, value: IndicatorResult | "", reason: string) {
    setIndicators((prev) => ({ ...prev, [key]: value }))
    // Indikator gagal → hasil otomatis GAGAL, alasan terisi bila belum dipilih.
    if (value === "gagal") {
      setValidationResult("gagal")
      setFailureReason((r) => r || reason)
    }
  }

  async function loadMachines(): Promise<SterilizerMachineOption[]> {
    if (machinesLoadedRef.current) return machines
    setMachinesLoading(true)
    try {
      const res = await api.get("/master/sterilizer-machines/options")
      const list: SterilizerMachineOption[] = res.data?.data ?? []
      setMachines(list)
      machinesLoadedRef.current = true
      return list
    } catch {
      toast.error("Gagal memuat daftar mesin sterilisator.")
      return []
    } finally {
      setMachinesLoading(false)
    }
  }

  const machineOptions = useMemo(
    () =>
      machines.map((m) => ({
        value: String(m.id),
        label: `${m.name} (${m.temperature ?? 121}°C, ${m.duration_minutes ?? 45} mnt)`,
      })),
    [machines],
  )

  function handleSelectMachine(mId: string, list: SterilizerMachineOption[] = machines) {
    setSelectedMachineId(mId)
    const m = list.find((x) => x.id === Number(mId))
    if (m) {
      if (m.temperature) setTemperature(String(m.temperature))
      if (m.duration_minutes) setDurationMinutes(String(m.duration_minutes))
    }
  }

  function togglePkg(id: number) {
    const next = new Set(selectedPkgIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedPkgIds(next)
  }

  function toggleAll() {
    if (readyList.length > 0 && selectedPkgIds.size === readyList.length) {
      setSelectedPkgIds(new Set())
    } else {
      setSelectedPkgIds(new Set(readyList.map((r) => r.id)))
    }
  }

  async function openStartModal() {
    if (selectedPkgIds.size === 0) {
      toast.error("Pilih minimal satu kemasan BMHP yang akan disterilkan.")
      return
    }
    setStartModalOpen(true)
    const list = await loadMachines()
    if (list.length > 0 && !selectedMachineId) {
      handleSelectMachine(String(list[0].id), list)
    }
  }

  async function handleStartSterilization() {
    if (!selectedMachineId) {
      toast.error("Silakan pilih mesin sterilisator.")
      return
    }

    setSubmittingBatch(true)
    try {
      const payload = {
        packaging_ids: Array.from(selectedPkgIds),
        machine_id: Number(selectedMachineId),
        method,
        cycle_number: cycleNumber ? Number(cycleNumber) : undefined,
        temperature: temperature ? Number(temperature) : undefined,
        duration_minutes: durationMinutes ? Number(durationMinutes) : undefined,
        bio_indicator_lot: bioIndicatorLot.trim() || undefined,
        chemical_indicator_lot: chemIndicatorLot.trim() || undefined,
        note: sterilNote.trim() || undefined,
      }

      await api.post("/master/production-bmhp/sterilization/batch", payload)
      toast.success("Batch sterilisasi berhasil dimulai.")

      setStartModalOpen(false)
      setSelectedPkgIds(new Set())
      reloadAll()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e.response?.data?.message ?? "Gagal memulai sterilisasi BMHP.")
    } finally {
      setSubmittingBatch(false)
    }
  }

  async function handleValidateSterilization() {
    if (!validatingBatch || !canValidate) return

    setSubmittingValidation(true)
    try {
      const indicatorPayload = Object.fromEntries(
        shownIndicators.map((i) => [i.key, indicators[i.key] || null]),
      )
      await api.post(
        `/master/production-bmhp/sterilization/${validatingBatch.id}/validate`,
        {
          result: validationResult,
          ...indicatorPayload,
          failure_reason: validationResult === "gagal" ? failureReason : null,
          failure_note: validationResult === "gagal" && isOtherReason ? failureNote.trim() : null,
        },
      )

      if (validationResult === "steril") {
        setSterileResult(validatingBatch.code)
      } else {
        toast.success("Batch BMHP dinyatakan GAGAL steril.")
      }

      setValidatingBatch(null)
      reloadAll()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e.response?.data?.message ?? "Gagal memvalidasi sterilisasi.")
    } finally {
      setSubmittingValidation(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Chip filter tahap (warna = warna kartu), lalu search + rentang tanggal */}
      <div>
        <div className="flex flex-wrap gap-2">
          {STAGE_FILTERS.map((f) => {
            const activeChip = stage === f.key
            const count = summary
              ? f.key
                ? summary[f.key]
                : summary.belum + summary.menunggu + summary.sudah
              : null
            return (
              <button
                key={f.key || "all"}
                type="button"
                onClick={() => changeStage(f.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeChip
                    ? "border-[#075489] bg-[#075489]/10 text-[#075489]"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className={`h-3 w-1 rounded-full ${f.dot}`} aria-hidden />
                {t(f.labelKey)}
                <span className="text-gray-400">{count ?? "…"}</span>
              </button>
            )
          })}
        </div>

      </div>

      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10.5rem_10.5rem_auto] lg:items-end"
      >
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            placeholder="Cari kode batch / kode kemasan / mesin..."
            className="pl-9"
          />
        </div>
        {/* Rentang bebas — tanggal akhir tidak ikut digeser saat tanggal awal diubah. */}
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
        </div>
      </form>

      {/* Bar aksi: kemasan belum diproses dicentang lalu dimasukkan ke satu batch. */}
      {readyList.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="select-all"
              checked={selectedPkgIds.size === readyList.length}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-gray-300 accent-sky-600"
            />
            <label htmlFor="select-all" className="cursor-pointer text-xs font-semibold text-gray-700">
              Pilih Semua Kemasan Belum Diproses ({selectedPkgIds.size} dipilih)
            </label>
          </div>

          <Button
            type="button"
            onClick={openStartModal}
            disabled={selectedPkgIds.size === 0}
            className="bg-[#075489] text-xs text-white hover:bg-[#064775]"
          >
            <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
            Mulai Sterilisasi ({selectedPkgIds.size})
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#075489]" />
          <span className="ml-2 text-sm">Memuat data sterilisasi...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          {t("productionBmhp.sterEmpty")}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) =>
              row.kind === "packaging" ? (
                <ReadyPackagingCard
                  key={`p-${row.packaging.id}`}
                  pkg={row.packaging}
                  checked={selectedPkgIds.has(row.packaging.id)}
                  onToggle={() => togglePkg(row.packaging.id)}
                />
              ) : (
                <BatchCard
                  key={`b-${row.batch.id}`}
                  batch={row.batch}
                  onValidate={() => openValidation(row.batch)}
                  onOpen={() => setDetailBatch(row.batch)}
                />
              ),
            )}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={changePage}
          />
        </div>
      )}

      {/* Modal Mulai Sterilisasi */}
      {startModalOpen && (
        <Modal
          open={startModalOpen}
          onClose={() => setStartModalOpen(false)}
          title="Mulai Siklus Sterilisasi BMHP"
          size="md"
        >
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
              Total kemasan BMHP yang akan disterilkan:{" "}
              <strong>{selectedPkgIds.size} bungkus</strong>
            </div>

            <div>
              <Label htmlFor="ster-machine">
                Mesin Sterilisator <span className="text-red-500">*</span>
              </Label>
              <SelectSearch
                value={selectedMachineId}
                onChange={(v) => handleSelectMachine(v)}
                options={machineOptions}
                placeholder={machinesLoading ? t("common.loading") : "Pilih mesin sterilisator..."}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ster-temp">Suhu (°C)</Label>
                <Input
                  id="ster-temp"
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="121"
                />
              </div>
              <div>
                <Label htmlFor="ster-dur">Durasi (Menit)</Label>
                <Input
                  id="ster-dur"
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="45"
                />
              </div>
            </div>

            {/* Petugas tidak diisi manual — backend memakai nama user yang login. */}
            <div>
              <Label htmlFor="ster-cycle">Nomor Siklus</Label>
              <Input
                id="ster-cycle"
                type="number"
                value={cycleNumber}
                onChange={(e) => setCycleNumber(e.target.value)}
                placeholder="1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ster-chem">Lot Indikator Kimia</Label>
                <Input
                  id="ster-chem"
                  value={chemIndicatorLot}
                  onChange={(e) => setChemIndicatorLot(e.target.value)}
                  placeholder="Lot kimia..."
                />
              </div>
              <div>
                <Label htmlFor="ster-bio">Lot Indikator Biologis</Label>
                <Input
                  id="ster-bio"
                  value={bioIndicatorLot}
                  onChange={(e) => setBioIndicatorLot(e.target.value)}
                  placeholder="Lot biologis..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStartModalOpen(false)}
                disabled={submittingBatch}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleStartSterilization}
                disabled={submittingBatch}
                className="bg-[#075489] text-white hover:bg-[#064775]"
              >
                {submittingBatch ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    Mulai Siklus
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <BatchDetailModal batch={detailBatch} onClose={() => setDetailBatch(null)} />

      <ResultDialog
        open={sterileResult !== null}
        onClose={() => setSterileResult(null)}
        variant="success"
        title="Berhasil Steril"
        description={`Batch ${sterileResult ?? ""} dinyatakan steril dan siap disimpan di Gudang Steril BMHP.`}
      />

      {/* Modal Validasi Hasil Sterilisasi */}
      {validatingBatch && (
        <Modal
          open={!!validatingBatch}
          onClose={() => setValidatingBatch(null)}
          title="Validasi Hasil Sterilisasi BMHP"
          size="md"
        >
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
              <div>
                Batch Steril: <strong className="font-mono">{validatingBatch.code}</strong>
              </div>
              <div>
                Mesin: <strong>{validatingBatch.machine_name ?? "-"}</strong>
              </div>
            </div>

            <BatchContentsTable batch={validatingBatch} />

            <div>
              <Label>Hasil Indikator</Label>
              <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                {shownIndicators.map((ind) => (
                  <div
                    key={ind.key}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm text-gray-700">{ind.label}</span>
                    <IndicatorToggle
                      value={indicators[ind.key]}
                      onChange={(v) => setIndicator(ind.key, v, ind.reason)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Hasil Pengujian Siklus</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setValidationResult("steril")}
                  disabled={indicatorFailed}
                  title={indicatorFailed ? "Ada indikator yang gagal" : undefined}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    validationResult === "steril"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  STERIL (Lolos)
                </button>

                <button
                  type="button"
                  onClick={() => setValidationResult("gagal")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3.5 text-sm font-semibold transition ${
                    validationResult === "gagal"
                      ? "border-red-600 bg-red-50 text-red-800"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <XCircle className="h-5 w-5 text-red-600" />
                  GAGAL Steril
                </button>
              </div>
            </div>

            {validationResult === "gagal" && (
              <div>
                <Label htmlFor="val-reason">
                  Alasan Gagal <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="val-reason"
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Pilih alasan gagal...</option>
                  {FAILURE_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                {isOtherReason && (
                  <Input
                    aria-label="Alasan gagal lainnya"
                    value={failureNote}
                    onChange={(e) => setFailureNote(e.target.value)}
                    maxLength={255}
                    placeholder="Tulis alasan gagal..."
                    className="mt-2"
                    autoFocus
                  />
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setValidatingBatch(null)}
                disabled={submittingValidation}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={handleValidateSterilization}
                disabled={submittingValidation || !canValidate}
                className={
                  validationResult === "steril"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }
              >
                {submittingValidation ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 h-4 w-4" />
                    Selesaikan Validasi
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// Warna kartu per tahap: aksen garis kiri + latar tipis + lencana. Sama dengan
// tab Pengemasan — siap steril biru langit, proses steril indigo, steril hijau,
// gagal merah.
const CARD_TONE = {
  belum: { card: "border-l-sky-500 bg-white", badge: "bg-sky-100 text-sky-800" },
  menunggu: { card: "border-l-indigo-500 bg-white", badge: "bg-indigo-100 text-indigo-800" },
  steril: { card: "border-l-emerald-500 bg-emerald-50/20", badge: "bg-emerald-100 text-emerald-800" },
  gagal: { card: "border-l-red-500 bg-red-50/30", badge: "bg-red-100 text-red-700" },
} as const

/** Kemasan siap steril (tahap "Belum Diproses") — klik kartu untuk mencentang. */
function ReadyPackagingCard({
  pkg,
  checked,
  onToggle,
}: {
  pkg: SterilReadyPackaging
  checked: boolean
  onToggle: () => void
}) {
  const { t } = useLanguage()
  return (
    <div
      onClick={onToggle}
      className={`flex cursor-pointer flex-col rounded-xl border border-l-4 p-4 transition-all ${CARD_TONE.belum.card} ${
        checked ? "border-sky-500 shadow-sm ring-1 ring-sky-400" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {}} // ditangani onClick kartu
            className="h-4 w-4 rounded border-gray-300 accent-sky-600"
          />
          <div>
            <span className="font-mono text-sm font-bold text-gray-900">
              {pkg.prefix}
              {pkg.code}
            </span>
            <div className="text-[11px] text-gray-500">Dari Produksi: {pkg.production?.code ?? "-"}</div>
          </div>
        </div>
        <Badge className={CARD_TONE.belum.badge}>{t("productionBmhp.sterPending")}</Badge>
      </div>

      <div className="mt-3 space-y-1 border-t border-gray-200 pt-3 text-xs">
        <BmhpContentChips packagings={[pkg.items]} />
        <div className="text-[11px] text-gray-500">
          Kemasan: <strong>{pkg.packaging_type?.name ?? "-"}</strong>
          {pkg.expiry_date && (
            <>
              {" "}
              • Exp: <strong>{pkg.expiry_date.slice(0, 10)}</strong>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Batch sterilisasi — "Menunggu Validasi" (diproses) atau "Sudah Diproses" (steril / gagal). */
function BatchCard({
  batch,
  onValidate,
  onOpen,
}: {
  batch: SterilizationBmhpBatch
  onValidate: () => void
  onOpen: () => void
}) {
  const { t } = useLanguage()
  const isProcessing = batch.status === "diproses"
  const tone = isProcessing ? CARD_TONE.menunggu : batch.status === "selesai" ? CARD_TONE.steril : CARD_TONE.gagal
  const badgeLabel = isProcessing
    ? t("productionBmhp.sterWaiting")
    : batch.status === "selesai"
      ? "Steril"
      : "Gagal Steril"

  const packagings = batchPackagings(batch)

  return (
    // Klik kartu → modal detail batch (isi, indikator, petugas, alasan gagal).
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`flex cursor-pointer flex-col rounded-xl border border-l-4 border-gray-200 p-4 transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#075489]/30 ${tone.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Judul = kode batch; kode kemasan di dalamnya ada di tooltip. */}
        <div className="min-w-0" title={packagings.map((p) => `${p.prefix}${p.code}`).join(", ")}>
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-sm font-bold text-[#075489]">
            <Flame className="h-4 w-4 shrink-0" />
            <span className="truncate">{batch.code}</span>
          </span>
          <div className="text-[11px] text-gray-500">Mesin: {batch.machine_name ?? "-"}</div>
        </div>
        <Badge className={`shrink-0 ${tone.badge}`}>{badgeLabel}</Badge>
      </div>

      <div className="mt-3 flex-1 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-600">
        {/* Isi batch: nama + jumlah saja (tanpa kode kemasan). */}
        <div className="pb-1">
          <BmhpContentChips packagings={packagings.map((p) => p.items)} />
        </div>
        <div className="text-[11px]">
          Siklus <strong>{batch.cycle_number ?? "-"}</strong> • <strong>{batch.temperature ? `${batch.temperature}°C` : "-"}</strong>{" "}
          • <strong>{batch.duration_minutes ? `${batch.duration_minutes} mnt` : "-"}</strong>
        </div>
        <div className="text-[11px]">
          Petugas: <strong>{batch.operator ?? "-"}</strong> • <strong>{packagings.length} bungkus</strong>
        </div>
        {batch.chemical_indicator_lot && (
          <div className="text-[11px] text-gray-400">
            Indikator Kimia: {batch.chemical_indicator_lot}
            {batch.bio_indicator_lot && ` • Biologis: ${batch.bio_indicator_lot}`}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {isProcessing ? (
          <Button
            type="button"
            onClick={(e) => {
              e.stopPropagation() // jangan ikut membuka modal detail
              onValidate()
            }}
            className="w-full bg-emerald-600 text-xs text-white hover:bg-emerald-700"
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Validasi Hasil
          </Button>
        ) : (
          <span className="text-[11px] text-gray-400">Divalidasi {batch.completed_at?.slice(0, 10)}</span>
        )}
      </div>
    </div>
  )
}

// Pilihan hasil satu indikator: tidak dipakai / lulus / gagal.
function IndicatorToggle({
  value,
  onChange,
}: {
  value: IndicatorResult | ""
  onChange: (value: IndicatorResult | "") => void
}) {
  const options: { value: IndicatorResult | ""; label: string; active: string }[] = [
    { value: "", label: "Tidak dipakai", active: "border-gray-400 bg-gray-100 text-gray-700" },
    { value: "lulus", label: "Lulus", active: "border-emerald-600 bg-emerald-50 text-emerald-800" },
    { value: "gagal", label: "Gagal", active: "border-red-600 bg-red-50 text-red-800" },
  ]

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:flex">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            value === o.value ? o.active : "border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Rincian isi batch: satu baris per BMHP di tiap kemasan. */
function BatchContentsTable({ batch }: { batch: SterilizationBmhpBatch }) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Kode Kemasan</th>
            <th className="px-3 py-2 font-semibold">Nama BMHP</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {batchPackagings(batch).flatMap((p) => {
            const contents = packagingContents(p.items)
            const rows = contents.length > 0 ? contents : [null]
            return rows.map((it, i) => (
              <tr key={`${p.id}-${i}`} className="align-top">
                {i === 0 && (
                  <td rowSpan={rows.length} className="whitespace-nowrap px-3 py-2">
                    <span className="font-mono font-semibold text-[#075489]">
                      {p.prefix}
                      {p.code}
                    </span>
                    {p.packaging_type?.name && (
                      <div className="text-[11px] text-gray-400">{p.packaging_type.name}</div>
                    )}
                  </td>
                )}
                <td className="px-3 py-2 text-gray-800">
                  {it ? it.name : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-900">
                  {it ? (
                    [it.quantity, it.unit_name].filter(Boolean).join(" ")
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}

const INDICATOR_BADGE: Record<IndicatorResult, string> = {
  lulus: "bg-emerald-100 text-emerald-800",
  gagal: "bg-red-100 text-red-700",
}

/** Detail satu batch sterilisasi: hasil, alasan gagal, indikator, petugas & isinya. */
function BatchDetailModal({ batch, onClose }: { batch: SterilizationBmhpBatch | null; onClose: () => void }) {
  const { lang } = useLanguage()
  if (!batch) return null

  const kosong = <span className="text-xs text-gray-400">—</span>
  const waktu = (v?: string | null) =>
    v
      ? new Date(v).toLocaleString(localeOf(lang), {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null

  const isProcessing = batch.status === "diproses"
  const isFailed = batch.status === "gagal"
  const tone = isProcessing ? CARD_TONE.menunggu : isFailed ? CARD_TONE.gagal : CARD_TONE.steril
  const statusLabel = isProcessing ? "Menunggu Validasi" : isFailed ? "Gagal Steril" : "Steril"
  const reasonLabel = FAILURE_REASONS.find((r) => r.value === batch.failure_reason)?.label ?? batch.failure_reason

  // Lot dicatat saat mulai steril, hasilnya saat validasi.
  const indicatorRows = [
    { label: "Indikator Kimia", lot: batch.chemical_indicator_lot, result: batch.chemical_indicator_result },
    { label: "Indikator Biologi", lot: batch.bio_indicator_lot, result: batch.bio_indicator_result },
    ...(batch.method === "uap" ? [{ label: "Bowie-Dick", lot: null, result: batch.bowie_dick_result }] : []),
  ]

  const officers = [
    { label: "Mulai steril", by: batch.started_by ?? batch.operator, at: waktu(batch.started_at ?? batch.created_at) },
    { label: "Divalidasi", by: batch.completed_by, at: waktu(batch.completed_at) },
  ]

  return (
    <Modal open onClose={onClose} title="Detail Batch Sterilisasi BMHP" size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="flex items-center gap-1.5 font-mono text-base font-bold text-[#075489]">
              <Flame className="h-4 w-4" />
              {batch.code}
            </span>
            <div className="mt-0.5 text-xs text-gray-500">
              Mesin <strong>{batch.machine_name ?? "-"}</strong> • Metode <strong>{batch.method}</strong> • Siklus{" "}
              <strong>{batch.cycle_number ?? "-"}</strong> •{" "}
              <strong>{batch.temperature ? `${batch.temperature}°C` : "-"}</strong> •{" "}
              <strong>{batch.duration_minutes ? `${batch.duration_minutes} mnt` : "-"}</strong>
            </div>
          </div>
          <Badge className={tone.badge}>{statusLabel}</Badge>
        </div>

        {batch.status === "selesai" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Berhasil Steril
            </div>
            <p className="mt-1 text-emerald-900">
              Divalidasi oleh <strong>{batch.completed_by ?? "-"}</strong>
              {batch.completed_at && <> • {waktu(batch.completed_at)}</>}
            </p>
            {batch.expiry_date && (
              <p className="mt-0.5 text-emerald-800">
                Steril sampai{" "}
                <strong>
                  {new Date(batch.expiry_date).toLocaleDateString(localeOf(lang), {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </strong>
              </p>
            )}
            <p className="mt-2 text-xs text-emerald-700">Kemasan siap disimpan di Gudang Steril BMHP.</p>
          </div>
        )}

        {isFailed && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-red-800">
              <AlertTriangle className="h-4 w-4" />
              Alasan Gagal
            </div>
            <p className="mt-1 text-red-900">{reasonLabel ?? "Tidak dicatat"}</p>
            {batch.failure_note && <p className="mt-0.5 text-red-800">&ldquo;{batch.failure_note}&rdquo;</p>}
            <p className="mt-2 text-xs text-red-700">
              Kemasan di batch ini di-void dan dikemas ulang (GS-), kembali ke antrean Inspeksi &amp; Pengemasan.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Petugas</Label>
            <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
              {officers.map((o) => (
                <div key={o.label} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="text-gray-500">{o.label}</span>
                  <span className="text-right">
                    {o.by ? <span className="font-medium text-gray-900">{o.by}</span> : kosong}
                    {o.at && <span className="block text-[11px] text-gray-400">{o.at}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Hasil Indikator</Label>
            <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
              {indicatorRows.map((ind) => (
                <div key={ind.label} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-gray-500">
                    {ind.label}
                    {ind.lot && <span className="block text-[11px] text-gray-400">Lot {ind.lot}</span>}
                  </span>
                  {ind.result ? (
                    <Badge className={INDICATOR_BADGE[ind.result]}>{ind.result === "lulus" ? "Lulus" : "Gagal"}</Badge>
                  ) : isProcessing ? (
                    kosong
                  ) : (
                    <span className="text-xs text-gray-400">Tidak dipakai</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {batch.note && (
          <div className="text-sm">
            <Label>Catatan</Label>
            <p className="mt-1 text-gray-700">{batch.note}</p>
          </div>
        )}

        <BatchContentsTable batch={batch} />
      </div>
    </Modal>
  )
}

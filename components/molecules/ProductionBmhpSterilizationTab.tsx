"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
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
  Warehouse,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Pagination } from "@/components/molecules/Pagination"
import { useToast } from "@/components/molecules/ToastProvider"
import { useLanguage } from "@/lib/i18n"
import { usePagedList } from "@/lib/usePagedList"
import { packagingContents } from "@/lib/bmhpPackaging"
import { tanggalLokal } from "@/lib/dateRange"
import api from "@/lib/axios"

type SterilizerMachineOption = { id: number; name: string; temperature?: number; duration_minutes?: number }

export type SterilReadyPackaging = {
  id: number
  prefix: string
  code: string
  status: string
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
  status: "diproses" | "selesai" | "gagal"
  sterilized_at?: string | null
  expiry_date?: string | null
  note?: string | null
  started_at?: string | null
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
  { key: "belum", labelKey: "productionBmhp.sterPending", dot: "bg-gray-400" },
  { key: "menunggu", labelKey: "productionBmhp.sterWaiting", dot: "bg-amber-400" },
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

/**
 * Isi kemasan sebagai chip "nama · jumlah" (tanpa kode kemasan). `packagings` =
 * label-label per kemasan. Jumlah hanya digabung untuk BMHP yang sama DI DALAM
 * satu kemasan (mis. set-set paket); BMHP berbeda atau kemasan berbeda tetap jadi
 * chip sendiri-sendiri.
 */
function ContentChips({ packagings }: { packagings: SterilReadyPackaging["items"][] }) {
  const contents = packagings.flatMap((items) => packagingContents(items))
  if (contents.length === 0) return <span className="text-xs text-gray-400">—</span>
  const qty = (it: (typeof contents)[number]) => [it.quantity, it.unit_name].filter(Boolean).join(" ")
  // Selalu SATU baris supaya tinggi kartu seragam: chip yang tidak muat disembunyikan
  // & diganti "…" (text-overflow pada chip inline), isi lengkapnya ada di tooltip.
  return (
    <div
      className="truncate text-xs leading-7 text-gray-400"
      title={contents.map((it) => `${it.name} ${qty(it)}`).join(", ")}
    >
      {contents.map((it, i) => (
        <span
          key={`${i}|${it.name}|${it.unit_name ?? ""}`}
          className="mr-1.5 inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-100 bg-white px-2 py-0.5 align-middle text-xs font-medium leading-5 text-gray-800"
        >
          <span className="truncate">{it.name}</span>
          <span className="shrink-0 font-semibold text-[#075489]">{qty(it)}</span>
        </span>
      ))}
    </div>
  )
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
  const [validationResult, setValidationResult] = useState<"steril" | "gagal">("steril")
  const [validationNote, setValidationNote] = useState<string>("")
  const [submittingValidation, setSubmittingValidation] = useState(false)

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
    if (!validatingBatch) return

    setSubmittingValidation(true)
    try {
      await api.post(
        `/master/production-bmhp/sterilization/${validatingBatch.id}/validate`,
        {
          result: validationResult,
          note: validationNote.trim() || undefined,
        },
      )

      toast.success(
        validationResult === "steril"
          ? "Batch BMHP berhasil divalidasi STERIL."
          : "Batch BMHP dinyatakan GAGAL steril.",
      )

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
                <span className={`h-2 w-2 rounded-full ${f.dot}`} aria-hidden />
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
        {/* Maks. 3 hari — sama dengan validasi backend (STERIL_MAX_DAYS). */}
        <DateRangeFields
          from={draft.dateFrom}
          to={draft.dateTo}
          onFromChange={(v) => setDraft((d) => ({ ...d, dateFrom: v }))}
          onToChange={(v) => setDraft((d) => ({ ...d, dateTo: v }))}
          maxDays={3}
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
              className="h-4 w-4 rounded border-gray-300 accent-gray-700"
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
                  onValidate={() => {
                    setValidatingBatch(row.batch)
                    setValidationResult("steril")
                    setValidationNote("")
                  }}
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
                Mesin: <strong>{validatingBatch.machine_name ?? "-"}</strong> • Total:{" "}
                <strong>{batchPackagings(validatingBatch).length} kemasan</strong>
              </div>
            </div>

            {/* Rincian isi batch: satu baris per BMHP di tiap kemasan. */}
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
                  {batchPackagings(validatingBatch).flatMap((p) => {
                    const contents = packagingContents(p.items)
                    const rows = contents.length > 0 ? contents : [null]
                    return rows.map((it, i) => (
                      <tr key={`${p.id}-${i}`} className="align-top">
                        {i === 0 && (
                          <td rowSpan={rows.length} className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-[#075489]">
                            {p.prefix}
                            {p.code}
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

            <div>
              <Label>Hasil Pengujian Siklus</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setValidationResult("steril")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3.5 text-sm font-semibold transition ${
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

            <div>
              <Label htmlFor="val-note">Catatan Validasi</Label>
              <Input
                id="val-note"
                value={validationNote}
                onChange={(e) => setValidationNote(e.target.value)}
                placeholder="Catatan hasil indikator atau kondisi..."
              />
            </div>

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
                disabled={submittingValidation}
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

// Warna kartu per tahap: aksen garis kiri + latar tipis + lencana.
const CARD_TONE = {
  belum: { card: "border-l-gray-400 bg-gray-50", badge: "bg-gray-200 text-gray-700" },
  menunggu: { card: "border-l-amber-400 bg-amber-50/40", badge: "bg-amber-100 text-amber-800" },
  steril: { card: "border-l-emerald-500 bg-emerald-50/30", badge: "bg-emerald-100 text-emerald-800" },
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
        checked ? "border-gray-500 shadow-sm ring-1 ring-gray-400" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {}} // ditangani onClick kartu
            className="h-4 w-4 rounded border-gray-300 accent-gray-700"
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
        <ContentChips packagings={[pkg.items]} />
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
function BatchCard({ batch, onValidate }: { batch: SterilizationBmhpBatch; onValidate: () => void }) {
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
    <div className={`flex flex-col rounded-xl border border-l-4 border-gray-200 p-4 transition hover:shadow-sm ${tone.card}`}>
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
          <ContentChips packagings={packagings.map((p) => p.items)} />
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
          <Button type="button" onClick={onValidate} className="w-full bg-emerald-600 text-xs text-white hover:bg-emerald-700">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Validasi Hasil
          </Button>
        ) : (
          <>
            <span className="text-[11px] text-gray-400">Divalidasi {batch.completed_at?.slice(0, 10)}</span>
            {batch.status === "selesai" && (
              <Link
                href="/cssd/storage-steril-bmhp?tab=simpan"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#075489]/90"
              >
                <Warehouse className="h-3.5 w-3.5" />
                Ke Gudang Steril
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}

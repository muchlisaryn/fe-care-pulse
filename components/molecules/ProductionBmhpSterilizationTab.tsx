"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Sparkles,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Check,
  Flame,
  Layers,
  History,
  AlertTriangle,
  Warehouse,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import { useToast } from "@/components/molecules/ToastProvider"
import { useLanguage } from "@/lib/i18n"
import api from "@/lib/axios"

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
  items?: { id: number; barcode_no: string; production_item?: { name: string } }[]
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
      production?: {
        code: string
        items?: { name: string; quantity: number; unit_name?: string }[]
      } | null
    } | null
  }[]
}

export function ProductionBmhpSterilizationTab() {
  const toast = useToast()
  const { t } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [subView, setSubView] = useState<"ready" | "batches">("ready")
  const [search, setSearch] = useState("")

  const [readyList, setReadyList] = useState<SterilReadyPackaging[]>([])
  const [batchList, setBatchList] = useState<SterilizationBmhpBatch[]>([])

  // Master mesin sterilisator
  const [machines, setMachines] = useState<
    { id: number; name: string; temperature?: number; duration_minutes?: number }[]
  >([])

  // Centang kemasan yang mau disterilisasi
  const [selectedPkgIds, setSelectedPkgIds] = useState<Set<number>>(new Set())

  // Modal Mulai Sterilisasi
  const [startModalOpen, setStartModalOpen] = useState(false)
  const [selectedMachineId, setSelectedMachineId] = useState<string>("")
  const [method, setMethod] = useState<string>("uap")
  const [cycleNumber, setCycleNumber] = useState<string>("")
  const [temperature, setTemperature] = useState<string>("")
  const [durationMinutes, setDurationMinutes] = useState<string>("")
  const [operator, setOperator] = useState<string>("")
  const [bioIndicatorLot, setBioIndicatorLot] = useState<string>("")
  const [chemIndicatorLot, setChemIndicatorLot] = useState<string>("")
  const [sterilNote, setSterilNote] = useState<string>("")
  const [submittingBatch, setSubmittingBatch] = useState(false)

  // Modal Validasi Hasil
  const [validatingBatch, setValidatingBatch] = useState<SterilizationBmhpBatch | null>(null)
  const [validationResult, setValidationResult] = useState<"steril" | "gagal">("steril")
  const [validationNote, setValidationNote] = useState<string>("")
  const [submittingValidation, setSubmittingValidation] = useState(false)

  async function loadData() {
    try {
      setLoading(true)
      const [resQueue, resCand] = await Promise.all([
        api.get("/master/production-bmhp/sterilization", {
          params: { search: search || undefined },
        }),
        api.get("/master/production-bmhp/candidates"),
      ])

      const data = resQueue.data?.data
      setReadyList(data?.ready ?? [])
      setBatchList(data?.batches ?? [])
      setMachines(resCand.data?.data?.machines ?? [])
    } catch {
      toast.error("Gagal memuat antrean sterilisasi BMHP.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [search])

  const machineOptions = useMemo(
    () =>
      machines.map((m) => ({
        value: String(m.id),
        label: `${m.name} (${m.temperature ?? 121}°C, ${m.duration_minutes ?? 45} mnt)`,
      })),
    [machines],
  )

  function handleSelectMachine(mId: string) {
    setSelectedMachineId(mId)
    const m = machines.find((x) => x.id === Number(mId))
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
    if (selectedPkgIds.size === readyList.length) {
      setSelectedPkgIds(new Set())
    } else {
      setSelectedPkgIds(new Set(readyList.map((r) => r.id)))
    }
  }

  function openStartModal() {
    if (selectedPkgIds.size === 0) {
      toast.error("Pilih minimal satu kemasan BMHP yang akan disterilkan.")
      return
    }
    setStartModalOpen(true)
    if (machines.length > 0 && !selectedMachineId) {
      handleSelectMachine(String(machines[0].id))
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
        operator: operator.trim() || undefined,
        bio_indicator_lot: bioIndicatorLot.trim() || undefined,
        chemical_indicator_lot: chemIndicatorLot.trim() || undefined,
        note: sterilNote.trim() || undefined,
      }

      await api.post("/master/production-bmhp/sterilization/batch", payload)
      toast.success("Batch sterilisasi berhasil dimulai.")

      setStartModalOpen(false)
      setSelectedPkgIds(new Set())
      setSubView("batches")
      loadData()
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
      loadData()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e.response?.data?.message ?? "Gagal memvalidasi sterilisasi.")
    } finally {
      setSubmittingValidation(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Sub-view toggle & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50/70 p-1">
          <button
            type="button"
            onClick={() => setSubView("ready")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === "ready"
                ? "bg-white text-[#075489] shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Kemasan Siap Steril ({readyList.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView("batches")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === "batches"
                ? "bg-white text-[#075489] shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Riwayat & Validasi Sterilisasi ({batchList.length})
          </button>
        </div>

        <div className="relative max-w-sm flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari barcode / batch steril..."
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin text-[#075489]" />
          <span className="ml-2 text-sm">Memuat data sterilisasi...</span>
        </div>
      ) : subView === "ready" ? (
        /* Sub-View: Kemasan Siap Steril */
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="select-all"
                checked={readyList.length > 0 && selectedPkgIds.size === readyList.length}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300 text-[#075489] focus:ring-[#075489]"
              />
              <label htmlFor="select-all" className="text-xs font-semibold text-gray-700 cursor-pointer">
                Pilih Semua Kemasan ({selectedPkgIds.size} dipilih)
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

          {readyList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              Belum ada kemasan BMHP yang siap disterilkan. Silakan selesaikan tahap Pengemasan terlebih dahulu.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {readyList.map((pkg) => {
                const isChecked = selectedPkgIds.has(pkg.id)
                return (
                  <div
                    key={pkg.id}
                    onClick={() => togglePkg(pkg.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isChecked
                        ? "border-[#075489] bg-blue-50/30 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent onClick
                          className="h-4 w-4 rounded border-gray-300 text-[#075489] focus:ring-[#075489]"
                        />
                        <div>
                          <span className="font-mono text-sm font-bold text-gray-900">
                            {pkg.prefix}
                            {pkg.code}
                          </span>
                          <div className="text-[11px] text-gray-400">
                            Dari Produksi: {pkg.production?.code ?? "-"}
                          </div>
                        </div>
                      </div>

                      <Badge className="bg-emerald-50 text-emerald-700">Siap Steril</Badge>
                    </div>

                    <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs">
                      <div className="font-medium text-gray-800">
                        {pkg.production?.items?.map((it) => it.name).join(", ") || "BMHP"}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Kemasan: <strong>{pkg.packaging_type?.name ?? "-"}</strong>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Barcode: <span className="font-mono">{pkg.items?.[0]?.barcode_no ?? "-"}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Sub-View: Riwayat & Validasi Sterilisasi */
        <div className="space-y-4">
          {batchList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              Belum ada riwayat batch sterilisasi BMHP.
            </div>
          ) : (
            <div className="space-y-3">
              {batchList.map((batch) => {
                const isProcessing = batch.status === "diproses"
                const isSteril = batch.status === "selesai"

                return (
                  <div
                    key={batch.id}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Flame className="h-4 w-4 text-[#075489]" />
                        <span className="font-mono text-sm font-bold text-[#075489]">
                          {batch.code}
                        </span>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs text-gray-600">
                          Mesin: <strong className="text-gray-900">{batch.machine_name ?? "-"}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            isSteril
                              ? "bg-emerald-50 text-emerald-700"
                              : isProcessing
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                          }
                        >
                          {isSteril
                            ? "STERIL (Berhasil)"
                            : isProcessing
                              ? "Sedang Diproses"
                              : "GAGAL Steril"}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
                        <div className="space-y-1 md:col-span-8 text-xs text-gray-600">
                          <div>
                            Siklus Ke: <strong>{batch.cycle_number ?? "-"}</strong> • Suhu:{" "}
                            <strong>{batch.temperature ? `${batch.temperature}°C` : "-"}</strong> • Durasi:{" "}
                            <strong>{batch.duration_minutes ? `${batch.duration_minutes} mnt` : "-"}</strong>
                          </div>
                          <div>
                            Petugas: <strong>{batch.operator ?? "-"}</strong> • Total Kemasan:{" "}
                            <strong>{batch.items?.length ?? 0} bungkus</strong>
                          </div>
                          {batch.chemical_indicator_lot && (
                            <div className="text-[11px] text-gray-400">
                              Indikator Kimia: {batch.chemical_indicator_lot}
                              {batch.bio_indicator_lot && ` • Biologis: ${batch.bio_indicator_lot}`}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end md:col-span-4">
                          {isProcessing ? (
                            <Button
                              type="button"
                              onClick={() => {
                                setValidatingBatch(batch)
                                setValidationResult("steril")
                                setValidationNote("")
                              }}
                              className="bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Validasi Hasil
                            </Button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {batch.status === "selesai" && (
                                <Link
                                  href="/cssd/storage-steril-bmhp?tab=simpan"
                                  className="inline-flex items-center gap-1.5 rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90 transition-colors"
                                >
                                  <Warehouse className="h-3.5 w-3.5" />
                                  Ke Gudang Steril BMHP
                                </Link>
                              )}
                              <span className="text-xs text-gray-400">
                                Divalidasi {batch.completed_at?.slice(0, 10)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
                onChange={handleSelectMachine}
                options={machineOptions}
                placeholder="Pilih mesin sterilisator..."
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

            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <Label htmlFor="ster-op">Nama Petugas</Label>
                <Input
                  id="ster-op"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  placeholder="Operator sterilisasi..."
                />
              </div>
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
                Batch Steril: <strong>{validatingBatch.code}</strong>
              </div>
              <div>
                Mesin: <strong>{validatingBatch.machine_name ?? "-"}</strong> • Total:{" "}
                <strong>{validatingBatch.items?.length ?? 0} kemasan</strong>
              </div>
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

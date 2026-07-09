"use client"

import { useMemo, useState } from "react"
import { FlaskConical, CheckCircle2, Layers, X, ChevronDown, ChevronRight, Check } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { useToast } from "@/components/molecules/ToastProvider"
import api from "@/lib/axios"
import type { ProdSterilizeOrder, ProdSterilizeUnit } from "@/lib/store/slices/productionSterilizeSlice"

function formatDateTime(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function nowLocalInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}


function errMsg(e: unknown): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? "Terjadi kesalahan."
}

const NO_INSTRUMENT = "(Tanpa nama instrumen)"

type UnitGroup = { instrument: string; image: string | null; source: ProdSterilizeUnit["source"] | null; units: ProdSterilizeUnit[] }

function groupUnits(units: ProdSterilizeUnit[]): UnitGroup[] {
  const groups: UnitGroup[] = []
  const index = new Map<string, UnitGroup>()
  for (const u of units) {
    const key = u.instrument ?? NO_INSTRUMENT
    let g = index.get(key)
    if (!g) {
      g = { instrument: key, image: u.image_url ?? null, source: u.source, units: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.units.push(u)
  }
  return groups
}

const METHOD_OPTIONS = [
  { value: "uap", label: "Uap (Steam / Autoclave)" },
  { value: "eo", label: "Ethylene Oxide (EO)" },
  { value: "plasma", label: "Plasma H2O2" },
  { value: "panas_kering", label: "Panas Kering" },
]
const METHOD_DEFAULTS: Record<string, { temperature: string; duration_minutes: string }> = {
  uap: { temperature: "134", duration_minutes: "30" },
  eo: { temperature: "55", duration_minutes: "180" },
  plasma: { temperature: "50", duration_minutes: "47" },
  panas_kering: { temperature: "170", duration_minutes: "60" },
}
const emptyForm = { machine: "", method: "uap", cycle_number: "", temperature: "", duration_minutes: "", sterilized_at: "", expiry_date: "", note: "" }

/**
 * Tab Sterilisasi pipeline PRODUKSI. Beberapa item "Siap Disterilkan" (satuan/paket)
 * bisa dicentang lalu digabung menjadi SATU batch sterilisasi (disterilkan bersamaan),
 * lalu batch divalidasi Steril/Gagal.
 */
export function ProductionSterilizationTab({
  items,
  onChanged,
}: {
  items: ProdSterilizeOrder[]
  onChanged: () => void
}) {
  const toast = useToast()
  const ready = useMemo(() => items.filter((o) => o.kind === "ready"), [items])

  // PKG id yang dicentang untuk digabung ke batch.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ batch: string; count: number } | null>(null)

  // Validasi hasil batch.
  const [validating, setValidating] = useState<ProdSterilizeOrder | null>(null)
  const [vForm, setVForm] = useState({
    chemical_indicator: "",
    bio_indicator_control: "",
    bio_indicator_test: "",
    note: "",
  })
  const [vSaving, setVSaving] = useState(false)
  const [vError, setVError] = useState<string | null>(null)
  // Konfirmasi "Selesaikan Validasi" sebelum benar-benar menyimpan.
  const [confirmValidate, setConfirmValidate] = useState(false)
  // instrument_stock_id unit yang dicentang BERHASIL steril (sisanya = gagal → re-proses).
  const [passed, setPassed] = useState<Set<number>>(new Set())

  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // Kartu yang daftar unitnya sedang ditampilkan.
  const [openUnits, setOpenUnits] = useState<Set<string>>(new Set())
  // Batch riwayat yang detail sterilisasinya sedang ditampilkan di modal.
  const [detailOrder, setDetailOrder] = useState<ProdSterilizeOrder | null>(null)

  const selectedReady = useMemo(() => ready.filter((o) => selected.has(o.id)), [ready, selected])
  const selectedUnitCount = selectedReady.reduce((s, o) => s + o.unit_count, 0)

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleUnits(key: string) {
    setOpenUnits((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openBatch() {
    if (selectedReady.length === 0) return
    setError(null)
    const preset = METHOD_DEFAULTS[emptyForm.method]
    setForm({ ...emptyForm, sterilized_at: nowLocalInput(), temperature: preset?.temperature ?? "", duration_minutes: preset?.duration_minutes ?? "" })
    setBatchOpen(true)
  }

  function changeMethod(method: string) {
    const preset = METHOD_DEFAULTS[method]
    setForm((f) => ({ ...f, method, temperature: preset?.temperature ?? f.temperature, duration_minutes: preset?.duration_minutes ?? f.duration_minutes }))
  }

  async function createBatch() {
    if (saving || selectedReady.length === 0) return
    if (!form.machine.trim()) return setError("Nama / nomor mesin sterilisator wajib diisi.")
    if (!form.sterilized_at) return setError("Waktu sterilisasi wajib diisi.")
    setSaving(true)
    setError(null)
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v))
      const res = await api.post("/master/sterilization-pipeline/batch", {
        // Tray PKG vs unit re-proses lepas dipisah ke dua field.
        packaging_ids: selectedReady.filter((o) => !o.reprocess).map((o) => o.id),
        reproc_stock_ids: selectedReady.filter((o) => o.reprocess).map((o) => o.stock_id),
        machine: form.machine.trim(),
        method: form.method,
        cycle_number: form.cycle_number.trim() || null,
        temperature: num(form.temperature),
        duration_minutes: num(form.duration_minutes),
        sterilized_at: new Date(form.sterilized_at).toISOString(),
        expiry_date: form.expiry_date || null,
        note: form.note.trim() || null,
      })
      setDone({ batch: res.data?.data?.code ?? "—", count: selectedReady.length })
      setBatchOpen(false)
      setSelected(new Set())
      onChanged()
      toast.success(res.data?.message ?? "Batch sterilisasi berhasil dibuat.")
    } catch (e) {
      const msg = errMsg(e)
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // stock id valid (non-null) dari unit sebuah batch.
  function unitStockIds(order: ProdSterilizeOrder): number[] {
    return order.units.map((u) => u.instrument_stock_id).filter((x): x is number => x != null)
  }

  function openValidate(order: ProdSterilizeOrder) {
    setValidating(order)
    setVError(null)
    const b = order.sterilization
    setVForm({
      chemical_indicator: b?.chemical_indicator ?? "",
      bio_indicator_control: b?.bio_indicator_control ?? "",
      bio_indicator_test: b?.bio_indicator_test ?? "",
      note: "",
    })
    // Default: tidak ada yang tercentang; operator mencentang unit yang berhasil steril.
    setPassed(new Set())
  }

  function togglePassed(stockId: number) {
    setPassed((prev) => {
      const next = new Set(prev)
      if (next.has(stockId)) next.delete(stockId)
      else next.add(stockId)
      return next
    })
  }

  // Klik "Simpan": validasi field wajib lalu minta konfirmasi selesai.
  function requestValidate() {
    if (!validating || vSaving) return
    if (!vForm.chemical_indicator.trim()) {
      setVError("Indikator Kimia wajib diisi.")
      return
    }
    setVError(null)
    setConfirmValidate(true)
  }

  async function submitValidate() {
    if (!validating || vSaving) return
    setVSaving(true)
    setVError(null)
    try {
      const failed_stock_ids = unitStockIds(validating).filter((id) => !passed.has(id))
      const res = await api.post(`/master/sterilization-pipeline/${validating.id}/validate`, {
        failed_stock_ids,
        chemical_indicator: vForm.chemical_indicator.trim() || null,
        bio_indicator_control: vForm.bio_indicator_control || null,
        bio_indicator_test: vForm.bio_indicator_test || null,
        note: vForm.note.trim() || null,
      })
      setConfirmValidate(false)
      setValidating(null)
      onChanged()
      toast.success(res.data?.message ?? "Validasi sterilisasi berhasil disimpan.")
    } catch (e) {
      const msg = errMsg(e)
      setConfirmValidate(false)
      setVError(msg)
      toast.error(msg)
    } finally {
      setVSaving(false)
    }
  }

  // Ringkasan centang validasi (berhasil vs gagal) untuk modal validasi.
  const vUnitIds = validating ? unitStockIds(validating) : []
  const vPassedCount = vUnitIds.filter((id) => passed.has(id)).length
  const vFailedCount = vUnitIds.length - vPassedCount
  // Unit berhasil vs gagal steril — untuk ditampilkan di konfirmasi.
  const vPassedUnits = validating
    ? validating.units.filter((u) => u.instrument_stock_id != null && passed.has(u.instrument_stock_id))
    : []
  const vFailedUnits = validating
    ? validating.units.filter((u) => u.instrument_stock_id != null && !passed.has(u.instrument_stock_id))
    : []

  return (
    <>
      {/* Toolbar aksi gabung batch */}
      {ready.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-gray-600">
            {selected.size > 0 ? `${selected.size} item dipilih · ${selectedUnitCount} unit` : "Pilih item untuk digabung ke batch."}
          </span>
          <Button
            type="button"
            onClick={openBatch}
            disabled={selected.size === 0}
            className="w-full bg-[#075489] hover:bg-[#075489]/90 text-white sm:w-auto"
          >
            Buat Batch
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {items.map((order) => {
          const inBatch = order.kind === "batch"
          const key = `${order.kind}-${order.id}`
          const checked = selected.has(order.id)
          // Daftar unit default tertutup (baik batch maupun ready); klik untuk membuka.
          const unitsOpen = openUnits.has(key)
          const groups = groupUnits(order.units)
          // Batch riwayat (sudah divalidasi) → tampilkan detail proses sterilisasinya.
          const ster = order.sterilization
          const isHistory = inBatch && ster != null && ster.status !== "diproses"
          return (
            <div
              key={key}
              onClick={
                isHistory
                  ? () => setDetailOrder(order)
                  : !inBatch
                    ? () => toggleSelect(order.id)
                    : undefined
              }
              className={
                "rounded-lg border transition-colors " +
                (isHistory
                  ? "border-gray-200 cursor-pointer hover:border-[#075489]/40 hover:bg-gray-50"
                  : !inBatch
                    ? "cursor-pointer " +
                      (checked
                        ? "border-[#075489] bg-[#075489]/5 ring-1 ring-[#075489]/20"
                        : "border-gray-200 hover:border-[#075489]/40 hover:bg-gray-50")
                    : "border-gray-200")
              }
            >
              <div className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {!inBatch && (
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      // Seluruh kartu yang menangani klik pilih; checkbox hanya indikator.
                      className="pointer-events-none mt-0.5 h-4 w-4 shrink-0 accent-[#075489]"
                      title="Pilih untuk digabung ke batch"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {inBatch ? (
                        <span className="text-sm font-semibold text-gray-900">Batch {order.code}</span>
                      ) : (
                        <span className="rounded bg-[#075489]/10 px-2 py-0.5 font-mono text-sm font-semibold text-[#075489]">
                          {order.code}
                        </span>
                      )}
                      {!inBatch && order.borrowed_by && (
                        <span className="truncate text-sm font-medium text-gray-700">{order.borrowed_by}</span>
                      )}
                      {inBatch &&
                        (order.sterilization?.status === "selesai" ? (
                          <Badge variant="success">Steril</Badge>
                        ) : order.sterilization?.status === "gagal" ? (
                          <Badge variant="danger">Gagal Steril</Badge>
                        ) : (
                          <Badge variant="warning">Menunggu Validasi</Badge>
                        ))}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5 text-gray-400" />
                        {order.unit_count} unit
                      </span>
                      {order.code_transaction && (
                        <span className="font-mono text-gray-400">{order.code_transaction}</span>
                      )}
                      {inBatch && order.sterilization && <span>Mesin: {order.sterilization.machine ?? "—"}</span>}
                    </div>
                    {/* Riwayat → detail dibuka lewat modal saat kartu diklik. */}
                    {!isHistory && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleUnits(key)
                          }}
                          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600"
                        >
                          Unit Disterilkan ({order.unit_count})
                          <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (unitsOpen ? "rotate-180" : "")} />
                        </button>
                        {unitsOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white"
                          >
                            {groups.map((g) => (
                              <div key={g.instrument} className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {g.image ? (
                                    <button
                                      type="button"
                                      onClick={() => setZoom({ url: g.image as string, name: g.instrument })}
                                      className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded border border-gray-200"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={g.image} alt={g.instrument} className="h-full w-full object-cover" />
                                    </button>
                                  ) : (
                                    <Layers className="h-4 w-4 shrink-0 text-[#075489]" />
                                  )}
                                  <span className="min-w-0 truncate text-sm font-medium text-gray-800">{g.instrument}</span>
                                  <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-[#075489]/10 px-2 py-0.5 text-xs font-semibold text-[#075489]">
                                    {g.units.length} unit
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {g.units.map((u) => (
                                    <span key={u.id} className="rounded bg-[#075489]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#075489]">
                                      {u.code ?? `#${u.id}`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {inBatch && order.sterilization?.status === "diproses" && (
                  <button
                    type="button"
                    onClick={() => openValidate(order)}
                    className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90"
                  >
                    Validasi Hasil
                  </button>
                )}
                {isHistory && (
                  <span className="flex shrink-0 items-center gap-1 self-center text-xs font-medium text-[#075489]">
                    Detail
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal buat batch gabungan */}
      <Modal
        open={batchOpen}
        onClose={saving ? () => {} : () => setBatchOpen(false)}
        title="Buat Batch Sterilisasi"
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <span className="text-xs text-gray-400">
                {selectedReady.length} item · {selectedUnitCount} unit digabung ke satu batch.
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button onClick={createBatch} disabled={saving} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
                {saving ? "Membuat..." : "Buat Batch"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Item dalam batch ({selectedReady.length} item · {selectedUnitCount} unit)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedReady.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1.5 rounded-md bg-white py-0.5 pl-0.5 pr-1.5 text-xs text-gray-700 ring-1 ring-gray-200">
                  {o.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.image_url} alt={o.borrowed_by ?? o.code} className="h-6 w-6 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400">
                      <FlaskConical className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="font-medium">{o.borrowed_by ?? o.code}</span>
                  <span className="text-gray-400">· {o.unit_count} unit</span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pstr-machine">Mesin Sterilisator *</Label>
              <Input id="pstr-machine" value={form.machine} onChange={(e) => setForm((f) => ({ ...f, machine: e.target.value }))} placeholder="mis. Autoclave-01" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pstr-method">Metode</Label>
              <Select id="pstr-method" value={form.method} onChange={(e) => changeMethod(e.target.value)}>
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pstr-cycle">Nomor Siklus</Label>
              <Input id="pstr-cycle" value={form.cycle_number} onChange={(e) => setForm((f) => ({ ...f, cycle_number: e.target.value }))} placeholder="mis. C-12" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pstr-temp">Suhu (°C)</Label>
                <Input id="pstr-temp" type="number" step="0.01" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))} placeholder="mis. 134" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pstr-dur">Durasi (mnt)</Label>
                <Input id="pstr-dur" type="number" min={0} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} placeholder="mis. 30" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pstr-at">Waktu Sterilisasi *</Label>
              <Input id="pstr-at" type="datetime-local" value={form.sterilized_at} onChange={(e) => setForm((f) => ({ ...f, sterilized_at: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pstr-expiry">Tanggal Kedaluwarsa Steril</Label>
              <Input id="pstr-expiry" type="date" min={form.sterilized_at ? form.sterilized_at.slice(0, 10) : undefined} value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
              <p className="text-xs text-gray-400">Kosongkan untuk memakai default (tgl sterilisasi + 7 hari).</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pstr-note">Catatan</Label>
            <Textarea id="pstr-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
          </div>
        </div>
      </Modal>

      {/* Modal validasi hasil */}
      <Modal
        open={validating !== null}
        onClose={vSaving ? () => {} : () => setValidating(null)}
        title={validating ? `Validasi Sterilisasi — ${validating.sterilization?.code ?? validating.code}` : "Validasi Sterilisasi"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {vError ? (
              <p className="text-sm text-red-600">{vError}</p>
            ) : (
              <span className="text-xs text-gray-400">
                {vPassedCount} berhasil · {vFailedCount} gagal
                {vFailedCount > 0 ? " → antre re-proses" : ""}
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setValidating(null)} disabled={vSaving}>
                Batal
              </Button>
              <Button onClick={() => requestValidate()} disabled={vSaving || !vForm.chemical_indicator.trim()} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
                {vSaving ? "Memproses..." : "Simpan"}
              </Button>
            </div>
          </div>
        }
      >
        {validating && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm sm:grid-cols-3">
              <Info label="Mesin" value={validating.sterilization?.machine} />
              <Info label="Metode" value={validating.sterilization?.method} />
              <Info label="No. Siklus" value={validating.sterilization?.cycle_number} />
              <Info label="Suhu" value={validating.sterilization?.temperature ? `${Number(validating.sterilization.temperature)}°C` : null} />
              <Info label="Durasi" value={validating.sterilization?.duration_minutes != null ? `${validating.sterilization.duration_minutes} mnt` : null} />
              <Info label="Waktu" value={formatDateTime(validating.sterilization?.sterilized_at ?? null)} />
              <Info label="Diproses oleh" value={validating.sterilization?.processed_by} />
            </div>


            {/* Checklist hasil per unit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Hasil per Unit ({vUnitIds.length})</Label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPassed(new Set(unitStockIds(validating)))}
                    className="font-medium text-green-600 hover:underline"
                  >
                    Semua berhasil
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setPassed(new Set())}
                    className="font-medium text-red-600 hover:underline"
                  >
                    Semua gagal
                  </button>
                </div>
              </div>
              <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {validating.units.map((u) => {
                  const sid = u.instrument_stock_id
                  const ok = sid != null && passed.has(sid)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={sid == null}
                      onClick={() => sid != null && togglePassed(sid)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span
                        className={
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border " +
                          (ok ? "border-green-600 bg-green-600 text-white" : "border-gray-300 bg-white")
                        }
                      >
                        {ok && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{u.instrument ?? "Instrumen"}</span>
                        <span className="block font-mono text-[11px] text-gray-500">{u.code ?? `#${u.id}`}</span>
                      </span>
                      {ok && (
                        <span className="shrink-0 text-xs font-semibold text-green-600">Berhasil</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pv-chem">
                  Indikator Kimia <span className="text-red-500">*</span>
                </Label>
                <Select id="pv-chem" value={vForm.chemical_indicator} onChange={(e) => setVForm((f) => ({ ...f, chemical_indicator: e.target.value }))}>
                  <option value="">— Pilih —</option>
                  <option value="Berhasil">Berhasil</option>
                  <option value="Tidak Berhasil">Tidak Berhasil</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-bio-control">Indikator Biologi Pembanding</Label>
                <Select id="pv-bio-control" value={vForm.bio_indicator_control} onChange={(e) => setVForm((f) => ({ ...f, bio_indicator_control: e.target.value }))}>
                  <option value="">— Pilih —</option>
                  <option value="Negatif">Negatif</option>
                  <option value="Positif">Positif</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-bio-test">Indikator Biologi Uji</Label>
                <Select id="pv-bio-test" value={vForm.bio_indicator_test} onChange={(e) => setVForm((f) => ({ ...f, bio_indicator_test: e.target.value }))}>
                  <option value="">— Pilih —</option>
                  <option value="Negatif">Negatif</option>
                  <option value="Positif">Positif</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-note">Catatan</Label>
                <Input id="pv-note" value={vForm.note} onChange={(e) => setVForm((f) => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Konfirmasi selesai validasi sterilisasi */}
      <ConfirmDialog
        open={confirmValidate}
        onClose={() => setConfirmValidate(false)}
        onConfirm={submitValidate}
        loading={vSaving}
        title="Selesaikan Validasi"
        confirmLabel="Selesaikan"
        loadingLabel="Memproses..."
        description={
          validating ? (
            <span className="block space-y-3">
              <span className="block">
                Selesaikan validasi batch{" "}
                <span className="font-semibold text-gray-900">
                  {validating.sterilization?.code ?? validating.code}
                </span>
                ?
              </span>
              {vPassedUnits.length > 0 && (
                <span className="block space-y-1 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-green-600">
                    Instrumen berhasil ({vPassedUnits.length}) — steril &amp; siap rilis
                  </span>
                  {vPassedUnits.map((u) => (
                    <span key={u.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-gray-700">{u.instrument ?? "Instrumen"}</span>
                      <span className="shrink-0 font-mono text-xs text-gray-500">{u.code ?? `#${u.id}`}</span>
                    </span>
                  ))}
                </span>
              )}
              {vFailedUnits.length > 0 && (
                <span className="block space-y-1 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-red-500">
                    Instrumen gagal ({vFailedUnits.length}) — masuk antrean re-proses
                  </span>
                  {vFailedUnits.map((u) => (
                    <span key={u.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-gray-700">{u.instrument ?? "Instrumen"}</span>
                      <span className="shrink-0 font-mono text-xs text-gray-500">{u.code ?? `#${u.id}`}</span>
                    </span>
                  ))}
                </span>
              )}
              <span className="block text-xs text-gray-400">Tindakan ini tidak dapat diubah.</span>
            </span>
          ) : undefined
        }
      />

      {/* Modal hasil batch dibuat */}
      <Modal
        open={done !== null}
        onClose={() => setDone(null)}
        title="Batch Sterilisasi Dibuat"
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button onClick={() => setDone(null)} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              Tutup
            </Button>
          </div>
        }
      >
        {done && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <p className="text-sm text-gray-600">
              {done.count} item digabung ke batch. Setelah siklus selesai, klik <b>Validasi Hasil</b> pada kartunya.
            </p>
            <div className="mt-1 inline-flex items-center gap-2 rounded-lg bg-[#075489]/10 px-3 py-1.5">
              <FlaskConical className="h-4 w-4 text-[#075489]" />
              <span className="font-mono text-sm font-semibold text-[#075489]">{done.batch}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal riwayat sterilisasi: detail proses + unit disterilkan */}
      <Modal
        open={detailOrder !== null}
        onClose={() => setDetailOrder(null)}
        title={detailOrder ? `Riwayat Sterilisasi — ${detailOrder.sterilization?.code ?? detailOrder.code}` : "Riwayat Sterilisasi"}
        size="lg"
        footer={
          <div className="flex w-full justify-end">
            <Button variant="outline" onClick={() => setDetailOrder(null)}>
              Tutup
            </Button>
          </div>
        }
      >
        {detailOrder && detailOrder.sterilization && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {detailOrder.sterilization.status === "selesai" ? (
                <Badge variant="success">Steril</Badge>
              ) : (
                <Badge variant="danger">Gagal Steril</Badge>
              )}
              {detailOrder.code_transaction && (
                <span className="text-xs text-gray-500">{detailOrder.code_transaction}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-3">
              <Info label="Mesin" value={detailOrder.sterilization.machine} />
              <Info label="Metode" value={detailOrder.sterilization.method} />
              <Info label="No. Siklus" value={detailOrder.sterilization.cycle_number} />
              <Info label="Suhu" value={detailOrder.sterilization.temperature ? `${Number(detailOrder.sterilization.temperature)}°C` : null} />
              <Info label="Durasi" value={detailOrder.sterilization.duration_minutes != null ? `${detailOrder.sterilization.duration_minutes} mnt` : null} />
              <Info label="Waktu Steril" value={formatDateTime(detailOrder.sterilization.sterilized_at)} />
              <Info label="Indikator Kimia" value={detailOrder.sterilization.chemical_indicator} />
              <Info label="Indikator Biologi Pembanding" value={detailOrder.sterilization.bio_indicator_control} />
              <Info label="Indikator Biologi Uji" value={detailOrder.sterilization.bio_indicator_test} />
              <Info label="Diproses oleh" value={detailOrder.sterilization.processed_by} />
              <Info label="Divalidasi oleh" value={detailOrder.sterilization.validated_by} />
              <Info label="Waktu Validasi" value={detailOrder.sterilization.validated_at ? formatDateTime(detailOrder.sterilization.validated_at) : null} />
              <div className="col-span-2 sm:col-span-3">
                <Info label="Catatan" value={detailOrder.sterilization.note} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Unit Disterilkan ({detailOrder.unit_count})</Label>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {groupUnits(detailOrder.units).map((g) => (
                  <div key={g.instrument} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {g.image ? (
                        <button
                          type="button"
                          onClick={() => setZoom({ url: g.image as string, name: g.instrument })}
                          className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded border border-gray-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.image} alt={g.instrument} className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <Layers className="h-4 w-4 shrink-0 text-[#075489]" />
                      )}
                      <span className="min-w-0 truncate text-sm font-medium text-gray-800">{g.instrument}</span>
                      <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-[#075489]/10 px-2 py-0.5 text-xs font-semibold text-[#075489]">
                        {g.units.length} unit
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {g.units.map((u) => (
                        <span key={u.id} className="rounded bg-[#075489]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#075489]">
                          {u.code ?? `#${u.id}`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Zoom foto */}
      {zoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <button type="button" onClick={() => setZoom(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" title="Tutup">
            <X className="h-5 w-5" />
          </button>
          <div className="flex max-h-full max-w-3xl flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.url} alt={zoom.name} className="max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl" />
            <p className="text-sm font-medium text-white">{zoom.name}</p>
          </div>
        </div>
      )}
    </>
  )
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {value ? <p className="text-sm text-gray-800">{value}</p> : <span className="text-xs text-gray-400">—</span>}
    </div>
  )
}

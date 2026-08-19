"use client"

import { useMemo, useState } from "react"
import { FlaskConical, CheckCircle2, Layers, X, ChevronRight, Check, Search, ZoomIn } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Textarea } from "@/components/atoms/Textarea"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { useToast } from "@/components/molecules/ToastProvider"
import { useLanguage, type Lang } from "@/lib/i18n"
import api from "@/lib/axios"
import type { ProdSterilizeOrder, ProdSterilizeUnit } from "@/lib/store/slices/productionSterilizeSlice"

// Nama bulan ikut bahasa aktif: locale "en-GB" untuk Inggris, "id-ID" untuk Indonesia.
const localeOf = (lang: Lang) => (lang === "id" ? "id-ID" : "en-GB")

function formatDateTime(value: string | null, lang: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(localeOf(lang), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// Tanggal saja (tanpa jam) — dipakai di samping kode batch pada kartu.
function formatDate(value: string | null, lang: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(localeOf(lang), { day: "2-digit", month: "short", year: "numeric" })
}

function nowLocalInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function errMsg(e: unknown, fallback: string): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? fallback
}

/** Teks cadangan untuk unit tanpa nama — ikut bahasa aktif. */
type GroupLabels = { pkg: string; noInstrument: string; instrument: string }

type UnitGroup = {
  key: string
  title: string // nama paket (source paket) / nama instrumen (source satuan)
  barcodeNo: string | null // nomor label fisik (packaging_item.barcode_no)
  image: string | null
  source: ProdSterilizeUnit["source"] | null
  units: ProdSterilizeUnit[]
}

// Kelompokkan unit per LABEL FISIK, yaitu `barcode_no` dari packaging_item — satu
// barcode = satu kemasan, jadi dua set bernama sama tetap jadi dua baris. Unit lama
// yang belum punya barcode_no jatuh ke pengelompokan lama (nama paket / instrumen).
function groupUnits(
  units: ProdSterilizeUnit[],
  tn: (t: string | null | undefined) => string,
  labels: GroupLabels,
): UnitGroup[] {
  const groups: UnitGroup[] = []
  const index = new Map<string, UnitGroup>()
  for (const u of units) {
    const isPaket = u.source === "paket"
    const title = isPaket
      ? tn(u.package_name) || labels.pkg
      : tn(u.instrument) || labels.noInstrument
    // Tanpa barcode_no, paket masih dipisah per NOMOR SET (package_no) supaya dua set
    // bernama sama tidak melebur jadi satu baris.
    const key = u.barcode_no
      ? `barcode::${u.barcode_no}`
      : `${u.source}::${title}::${u.package_no ?? ""}`
    let g = index.get(key)
    if (!g) {
      g = {
        key,
        title,
        barcodeNo: u.barcode_no ?? null,
        image: u.image_url ?? null,
        source: u.source,
        units: [],
      }
      index.set(key, g)
      groups.push(g)
    }
    if (!g.image && u.image_url) g.image = u.image_url
    g.units.push(u)
  }
  return groups
}

// Ringkas unit dalam satu grup jadi daftar "nama instrumen + jumlah unit".
function instrumentCounts(
  units: ProdSterilizeUnit[],
  tn: (t: string | null | undefined) => string,
  fallback: string,
): { name: string; qty: number }[] {
  const map = new Map<string, number>()
  for (const u of units) {
    const name = tn(u.instrument) || fallback
    map.set(name, (map.get(name) ?? 0) + 1)
  }
  return [...map.entries()].map(([name, qty]) => ({ name, qty }))
}

// Nilai `value` dikirim apa adanya ke backend; hanya labelnya yang diterjemahkan.
const METHOD_OPTIONS = [
  { value: "uap", labelKey: "prodSter.methodSteam" },
  { value: "eo", labelKey: "prodSter.methodEo" },
  { value: "plasma", labelKey: "prodSter.methodPlasma" },
  { value: "panas_kering", labelKey: "prodSter.methodDryHeat" },
]
const METHOD_DEFAULTS: Record<string, { temperature: string; duration_minutes: string }> = {
  uap: { temperature: "134", duration_minutes: "30" },
  eo: { temperature: "55", duration_minutes: "180" },
  plasma: { temperature: "50", duration_minutes: "47" },
  panas_kering: { temperature: "170", duration_minutes: "60" },
}
const emptyForm = { machine: "", method: "uap", cycle_number: "", temperature: "", duration_minutes: "", sterilized_at: "", note: "" }

/**
 * Tab Sterilisasi pipeline PRODUKSI. Beberapa item "Siap Disterilkan" (satuan/paket)
 * bisa dicentang lalu digabung menjadi SATU batch sterilisasi (disterilkan bersamaan),
 * lalu batch divalidasi Steril/Gagal.
 */
export function ProductionSterilizationTab({
  items,
  onChanged,
  scannedCodes = [],
  onScanRemove,
  onScanClear,
}: {
  items: ProdSterilizeOrder[]
  onChanged: () => void
  // Label (barcode_no) yang tercentang lewat mode scan di kolom pencarian halaman.
  // Digabung dengan centang manual di sini, jadi keduanya setara.
  scannedCodes?: string[]
  onScanRemove?: (code: string) => void
  onScanClear?: () => void
}) {
  const toast = useToast()
  const { t, tn, lang } = useLanguage()
  // Teks cadangan untuk pengelompokan unit — dipakai groupUnits/instrumentCounts.
  const groupLabels = useMemo<GroupLabels>(
    () => ({
      pkg: t("common.package"),
      noInstrument: t("prodSter.noInstrumentName"),
      instrument: t("common.instrument"),
    }),
    [t],
  )
  const ready = useMemo(() => items.filter((o) => o.kind === "ready"), [items])

  // PKG id yang dicentang untuk digabung ke batch.
  // Label kemasan (barcode_no) yang dicentang untuk digabung ke batch.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  // Daftar mesin sterilisator aktif (master) untuk dropdown pilihan mesin.
  const [machines, setMachines] = useState<{ id: number; code: string; name: string }[]>([])
  const [machinesLoading, setMachinesLoading] = useState(false)

  // Muat daftar mesin sterilisator aktif (master) untuk dropdown pilihan mesin.
  // Dipanggil saat modal batch dibuka (openBatch), bukan via effect.
  async function loadMachines() {
    if (machines.length > 0 || machinesLoading) return
    setMachinesLoading(true)
    try {
      const res = await api.get("/master/sterilizer-machines", { params: { status: "aktif" } })
      setMachines(res.data?.data?.data ?? [])
    } catch {
      setMachines([])
    } finally {
      setMachinesLoading(false)
    }
  }
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
  // Kata kunci pencarian daftar "Hasil per Unit" (cocokkan nama instrumen / kode).
  const [vSearch, setVSearch] = useState("")
  // Konfirmasi "Selesaikan Validasi" sebelum benar-benar menyimpan.
  const [confirmValidate, setConfirmValidate] = useState(false)
  // instrument_stock_id unit yang dicentang BERHASIL steril (sisanya = gagal → re-proses).
  const [passed, setPassed] = useState<Set<number>>(new Set())

  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // Batch riwayat yang detail sterilisasinya sedang ditampilkan di modal.
  const [detailOrder, setDetailOrder] = useState<ProdSterilizeOrder | null>(null)

  // Centang efektif = centang manual + label hasil scan. Digabung lewat turunan
  // (bukan efek) supaya hasil scan langsung terlihat tanpa sinkronisasi state.
  const selectedKeys = useMemo(
    () => new Set<string>([...selected, ...scannedCodes]),
    [selected, scannedCodes],
  )
  const selectedReady = useMemo(
    () => ready.filter((o) => selectedKeys.has(o.barcode_no ?? String(o.id))),
    [ready, selectedKeys],
  )
  const selectedUnitCount = selectedReady.reduce((s, o) => s + o.unit_count, 0)

  function toggleSelect(key: string) {
    // Label yang tercentang dari hasil scan dilepas lewat pemiliknya (halaman),
    // bukan disimpan ganda di sini.
    if (scannedCodes.includes(key)) {
      onScanRemove?.(key)

      return
    }
    setSelected((prev) => {
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
    setForm({
      ...emptyForm,
      sterilized_at: nowLocalInput(),
      temperature: preset?.temperature ?? "",
      duration_minutes: preset?.duration_minutes ?? "",
    })
    setBatchOpen(true)
    loadMachines()
  }

  function changeMethod(method: string) {
    const preset = METHOD_DEFAULTS[method]
    setForm((f) => ({ ...f, method, temperature: preset?.temperature ?? f.temperature, duration_minutes: preset?.duration_minutes ?? f.duration_minutes }))
  }

  async function createBatch() {
    if (saving || selectedReady.length === 0) return
    if (!form.machine.trim()) return setError(t("prodSter.errMachine"))
    if (!form.sterilized_at) return setError(t("prodSter.errTime"))
    setSaving(true)
    setError(null)
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v))
      const res = await api.post("/master/sterilization-pipeline/batch", {
        // Label kemasan vs unit re-proses lepas dipisah ke dua field.
        barcode_nos: selectedReady.filter((o) => !o.reprocess).map((o) => o.barcode_no),
        reproc_stock_ids: selectedReady.filter((o) => o.reprocess).map((o) => o.stock_id),
        machine: form.machine.trim(),
        method: form.method,
        cycle_number: form.cycle_number.trim() || null,
        temperature: num(form.temperature),
        duration_minutes: num(form.duration_minutes),
        sterilized_at: new Date(form.sterilized_at).toISOString(),
        note: form.note.trim() || null,
      })
      setDone({ batch: res.data?.data?.code ?? "—", count: selectedReady.length })
      setBatchOpen(false)
      setSelected(new Set())
      onScanClear?.()
      onChanged()
      toast.success(t("prodSter.batchCreated"))
    } catch (e) {
      const msg = errMsg(e, t("common.somethingWrong"))
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
    setVSearch("")
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

  // Paket divalidasi utuh (all-or-nothing): satu klik men-toggle SEMUA instrumen di
  // dalamnya. Sterilisasi paket tidak bisa dicicil — sebagian gagal = seluruh paket
  // masuk antre re-proses, jadi kalau dijadikan gagal beri notifikasi.
  function togglePaketPassed(g: UnitGroup) {
    const sids = g.units.map((u) => u.instrument_stock_id).filter((x): x is number => x != null)
    if (sids.length === 0) return
    const allPassed = sids.every((id) => passed.has(id))
    setPassed((prev) => {
      const next = new Set(prev)
      if (allPassed) sids.forEach((id) => next.delete(id))
      else sids.forEach((id) => next.add(id))
      return next
    })
  }

  // Klik "Simpan": validasi field wajib lalu minta konfirmasi selesai.
  function requestValidate() {
    if (!validating || vSaving) return
    if (!vForm.chemical_indicator.trim()) {
      setVError(t("prodSter.errChemical"))
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
      await api.post(`/master/sterilization-pipeline/${validating.id}/validate`, {
        failed_stock_ids,
        chemical_indicator: vForm.chemical_indicator.trim() || null,
        bio_indicator_control: vForm.bio_indicator_control || null,
        bio_indicator_test: vForm.bio_indicator_test || null,
        note: vForm.note.trim() || null,
      })
      setConfirmValidate(false)
      setValidating(null)
      onChanged()
      toast.success(t("prodSter.validationSaved"))
    } catch (e) {
      const msg = errMsg(e, t("common.somethingWrong"))
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
            {selectedKeys.size > 0
              ? t("prodSter.selectedSummary", { n: selectedKeys.size, units: selectedUnitCount })
              : t("prodSter.selectHint")}
          </span>
          <Button
            type="button"
            onClick={openBatch}
            disabled={selectedKeys.size === 0}
            className="w-full bg-[#075489] hover:bg-[#075489]/90 text-white sm:w-auto"
          >
            {t("prodSter.createBatch")}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {items.map((order) => {
          const inBatch = order.kind === "batch"
          // Baris siap-steril diidentifikasi nomor labelnya (satu label = satu
          // kemasan); entri re-proses lepas jatuh ke id sintetisnya.
          const selectKey = order.barcode_no ?? String(order.id)
          const key = inBatch ? `batch-${order.id}` : `ready-${selectKey}`
          const checked = selectedKeys.has(selectKey)
          // Batch riwayat (sudah divalidasi) → tampilkan detail proses sterilisasinya.
          const ster = order.sterilization
          const isHistory = inBatch && ster != null && ster.status !== "diproses"
          return (
            <div
              key={key}
              // Dipakai halaman untuk menggulir otomatis ke kartu hasil scan.
              id={order.barcode_no ? `ster-label-${order.barcode_no}` : undefined}
              onClick={
                isHistory
                  ? () => setDetailOrder(order)
                  : !inBatch
                    ? () => toggleSelect(selectKey)
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
                      title={t("prodSter.selectToCombine")}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {/* Baris 1: nomor label kemasan (siap-steril) / kode batch STR. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#075489]/10 px-2 py-0.5 font-mono text-sm font-semibold text-[#075489]">
                        {order.barcode_no ?? order.code}
                      </span>
                      {/* Item siap-steril: waktu pengemasan selesai. Kartu batch STR
                          memakai `processed_at` yang berisi waktu sterilisasinya. */}
                      <span className="text-xs text-gray-500">
                        {inBatch ? t("prodSter.sterilizedOn") : t("prodSter.packagedOn")}:{" "}
                        {formatDate(order.processed_at, lang)}
                      </span>
                      {inBatch &&
                        (order.sterilization?.status === "selesai" ? (
                          <Badge variant="success">{t("prodSter.badgeSterile")}</Badge>
                        ) : order.sterilization?.status === "gagal" ? (
                          <Badge variant="danger">{t("prodSter.badgeFailed")}</Badge>
                        ) : (
                          <Badge variant="warning">{t("prodSter.badgeAwaiting")}</Badge>
                        ))}
                    </div>

                    {/* Baris 2: nama label — nama paket bila set, nama instrumen bila
                        satuan (keduanya dari relasi production_item). Kartu batch STR
                        yang belum punya `name` jatuh ke nama produksinya. */}
                    <p className="mt-1 truncate text-sm font-medium text-gray-800">
                      {tn(order.name) || tn(order.borrowed_by) || t("prodSter.noInstrumentName")}
                    </p>
                  </div>
                </div>
                {inBatch && order.sterilization?.status === "diproses" && (
                  <button
                    type="button"
                    onClick={() => openValidate(order)}
                    className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90"
                  >
                    {t("prodSter.validateResult")}
                  </button>
                )}
                {isHistory && (
                  <span className="flex shrink-0 items-center gap-1 self-center text-xs font-medium text-[#075489]">
                    {t("common.detail")}
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
        title={t("prodSter.batchModalTitle")}
        size="lg"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <span className="text-xs text-gray-400">
                {t("prodSter.batchSummary", { n: selectedReady.length, units: selectedUnitCount })}
              </span>
            )}
            <div className="flex shrink-0 justify-end gap-2">
              <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button onClick={createBatch} disabled={saving} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
                {saving ? t("prodSter.creating") : t("prodSter.createBatch")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("prodSter.itemsInBatch", { n: selectedReady.length, units: selectedUnitCount })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedReady.map((o) => {
                // Beberapa label bisa berasal dari PKG yang sama, jadi `id` TIDAK
                // unik — identitas barisnya nomor label.
                const label = o.barcode_no ?? String(o.id)
                // Nama tampilan label: nama paket / instrumen (dari DB) lewat glosarium.
                const displayName = tn(o.name) || tn(o.borrowed_by) || o.code
                return (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-md bg-white py-0.5 pl-0.5 pr-1.5 text-xs text-gray-700 ring-1 ring-gray-200"
                  >
                    {o.image_url ? (
                      <button
                        type="button"
                        onClick={() => setZoom({ url: o.image_url as string, name: displayName })}
                        title={t("prodSter.clickToEnlarge")}
                        className="group relative h-6 w-6 shrink-0 cursor-zoom-in overflow-hidden rounded border border-gray-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={o.image_url}
                          alt={displayName}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                          <ZoomIn className="h-3 w-3" />
                        </span>
                      </button>
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400">
                        <FlaskConical className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="font-medium">{displayName}</span>
                    {o.barcode_no && <span className="font-mono text-gray-400">{o.barcode_no}</span>}
                    <span className="text-gray-400">
                      · {o.unit_count} {t("common.unit")}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("prodSter.machine")} *</Label>
              <SelectSearch
                options={machines.map((m) => ({ value: m.name, label: `${m.code} — ${m.name}` }))}
                value={form.machine}
                onChange={(v) => setForm((f) => ({ ...f, machine: v }))}
                loading={machinesLoading}
                placeholder={t("prodSter.machinePlaceholder")}
                searchPlaceholder={t("prodSter.machineSearch")}
                loadingText={t("common.loadingOptions")}
                emptyText={t("common.notFound")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pstr-method">{t("prodSter.method")}</Label>
              <Select id="pstr-method" value={form.method} onChange={(e) => changeMethod(e.target.value)}>
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.labelKey)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pstr-cycle">{t("prodSter.cycleNumber")}</Label>
              <Input id="pstr-cycle" value={form.cycle_number} onChange={(e) => setForm((f) => ({ ...f, cycle_number: e.target.value }))} placeholder={t("prodSter.cyclePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pstr-temp">{t("prodSter.temperature")}</Label>
                <Input id="pstr-temp" type="number" step="0.01" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))} placeholder={t("prodSter.tempPlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pstr-dur">{t("prodSter.duration")}</Label>
                <Input id="pstr-dur" type="number" min={0} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} placeholder={t("prodSter.durationPlaceholder")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pstr-at">{t("prodSter.sterilizedAt")} *</Label>
              <Input id="pstr-at" type="datetime-local" value={form.sterilized_at} onChange={(e) => setForm((f) => ({ ...f, sterilized_at: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pstr-note">{t("common.note")}</Label>
            <Textarea id="pstr-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={t("prodSter.notePlaceholder")} />
          </div>
        </div>
      </Modal>

      {/* Modal validasi hasil */}
      <Modal
        open={validating !== null}
        onClose={vSaving ? () => {} : () => setValidating(null)}
        title={
          validating
            ? `${t("prodSter.validationTitle")} — ${validating.sterilization?.code ?? validating.code}`
            : t("prodSter.validationTitle")
        }
        size="lg"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {vError ? (
              <p className="text-sm text-red-600">{vError}</p>
            ) : (
              <span className="text-xs text-gray-400">
                {t("prodSter.passedFailed", { passed: vPassedCount, failed: vFailedCount })}
                {vFailedCount > 0 ? t("prodSter.queuedReprocess") : ""}
              </span>
            )}
            <div className="flex shrink-0 justify-end gap-2">
              <Button variant="outline" onClick={() => setValidating(null)} disabled={vSaving}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => requestValidate()} disabled={vSaving || !vForm.chemical_indicator.trim()} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
                {vSaving ? t("production.processing") : t("common.save")}
              </Button>
            </div>
          </div>
        }
      >
        {validating && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm sm:grid-cols-3">
              <Info label={t("prodSter.infoMachine")} value={validating.sterilization?.machine} />
              <Info label={t("prodSter.infoMethod")} value={tn(validating.sterilization?.method)} />
              <Info label={t("prodSter.infoCycle")} value={validating.sterilization?.cycle_number} />
              <Info label={t("prodSter.infoTemperature")} value={validating.sterilization?.temperature ? `${Number(validating.sterilization.temperature)}°C` : null} />
              <Info label={t("prodSter.infoDuration")} value={validating.sterilization?.duration_minutes != null ? `${validating.sterilization.duration_minutes} ${t("prodSter.minSuffix")}` : null} />
              <Info label={t("prodSter.infoTime")} value={formatDateTime(validating.sterilization?.sterilized_at ?? null, lang)} />
              <Info label={t("prodSter.infoProcessedBy")} value={validating.sterilization?.processed_by} />
            </div>


            {/* Checklist hasil per unit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("prodSter.resultPerUnit", { n: vUnitIds.length })}</Label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPassed(new Set(unitStockIds(validating)))}
                    className="font-medium text-green-600 hover:underline"
                  >
                    {t("prodSter.allPassed")}
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setPassed(new Set())}
                    className="font-medium text-red-600 hover:underline"
                  >
                    {t("prodSter.allFailed")}
                  </button>
                </div>
              </div>
              {/* Cari unit berdasarkan nama instrumen / kode. */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#075489]" />
                <Input
                  value={vSearch}
                  onChange={(e) => setVSearch(e.target.value)}
                  placeholder={t("prodSter.searchUnit")}
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {(() => {
                  const q = vSearch.trim().toLowerCase()
                  // Nama dicocokkan dalam bahasa aslinya MAUPUN terjemahannya, supaya
                  // pencarian tetap jalan di kedua bahasa.
                  const matchU = (u: ProdSterilizeUnit) =>
                    !q ||
                    (u.instrument ?? "").toLowerCase().includes(q) ||
                    tn(u.instrument).toLowerCase().includes(q) ||
                    (u.code ?? "").toLowerCase().includes(q) ||
                    (u.package_name ?? "").toLowerCase().includes(q) ||
                    tn(u.package_name).toLowerCase().includes(q)
                  // Kelompokkan (satuan per instrumen, paket per nama paket), lalu saring per grup.
                  const visibleGroups = groupUnits(validating.units, tn, groupLabels)
                    .map((g) => ({ g, shownUnits: g.units.filter(matchU) }))
                    .filter((x) => x.shownUnits.length > 0)
                  if (visibleGroups.length === 0) {
                    return (
                      <p className="px-3 py-4 text-center text-xs text-gray-400">
                        {t("prodSter.noUnitMatch", { q: vSearch.trim() })}
                      </p>
                    )
                  }
                  return visibleGroups.map(({ g, shownUnits }) => {
                    // PAKET → divalidasi utuh: satu toggle untuk seluruh instrumen.
                    if (g.source === "paket") {
                      const sids = g.units
                        .map((u) => u.instrument_stock_id)
                        .filter((x): x is number => x != null)
                      const allPassed = sids.length > 0 && sids.every((id) => passed.has(id))
                      return (
                        <div key={g.key} className="px-3 py-2">
                          <button
                            type="button"
                            disabled={sids.length === 0}
                            onClick={() => togglePaketPassed(g)}
                            className="flex w-full items-center gap-3 text-left disabled:opacity-50"
                          >
                            <span
                              className={
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded border " +
                                (allPassed ? "border-green-600 bg-green-600 text-white" : "border-gray-300 bg-white")
                              }
                            >
                              {allPassed && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-medium text-gray-800">{g.title}</span>
                                <Badge variant="info">{t("common.package")}</Badge>
                                <span className="shrink-0 text-[11px] text-gray-400">
                                  {g.units.length} {t("common.unit")}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-[11px] text-gray-500">
                                {instrumentCounts(g.units, tn, groupLabels.instrument)
                                  .map((c) => `${c.name} (${c.qty})`)
                                  .join(", ")}
                              </span>
                            </span>
                            {allPassed && <span className="shrink-0 text-xs font-semibold text-green-600">{t("prodSter.passed")}</span>}
                          </button>
                        </div>
                      )
                    }
                    // SATUAN → centang per unit.
                    return shownUnits.map((u) => {
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
                            <span className="block truncate text-sm font-medium text-gray-800">
                              {tn(u.instrument) || groupLabels.instrument}
                            </span>
                            <span className="block font-mono text-[11px] text-gray-500">{u.code ?? `#${u.id}`}</span>
                          </span>
                          {ok && <span className="shrink-0 text-xs font-semibold text-green-600">{t("prodSter.passed")}</span>}
                        </button>
                      )
                    })
                  })
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pv-chem">
                  {t("prodSter.infoChemical")} <span className="text-red-500">*</span>
                </Label>
                <Select id="pv-chem" value={vForm.chemical_indicator} onChange={(e) => setVForm((f) => ({ ...f, chemical_indicator: e.target.value }))}>
                  <option value="">{t("prodSter.selectPlaceholder")}</option>
                  <option value="Berhasil">{t("prodSter.optPassed")}</option>
                  <option value="Tidak Berhasil">{t("prodSter.optFailed")}</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-bio-control">{t("prodSter.infoBioControl")}</Label>
                <Select id="pv-bio-control" value={vForm.bio_indicator_control} onChange={(e) => setVForm((f) => ({ ...f, bio_indicator_control: e.target.value }))}>
                  <option value="">{t("prodSter.selectPlaceholder")}</option>
                  <option value="Negatif">{t("prodSter.optNegative")}</option>
                  <option value="Positif">{t("prodSter.optPositive")}</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-bio-test">{t("prodSter.infoBioTest")}</Label>
                <Select id="pv-bio-test" value={vForm.bio_indicator_test} onChange={(e) => setVForm((f) => ({ ...f, bio_indicator_test: e.target.value }))}>
                  <option value="">{t("prodSter.selectPlaceholder")}</option>
                  <option value="Negatif">{t("prodSter.optNegative")}</option>
                  <option value="Positif">{t("prodSter.optPositive")}</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-note">{t("common.note")}</Label>
                <Input id="pv-note" value={vForm.note} onChange={(e) => setVForm((f) => ({ ...f, note: e.target.value }))} placeholder={t("prodSter.notePlaceholder")} />
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
        title={t("prodSter.confirmTitle")}
        confirmLabel={t("prodSter.confirmComplete")}
        loadingLabel={t("production.processing")}
        cancelLabel={t("common.cancel")}
        size="fit"
        description={
          validating ? (
            <span className="block space-y-3">
              <span className="block">
                {t("prodSter.confirmDescPre")}
                <span className="font-semibold text-gray-900">
                  {validating.sterilization?.code ?? validating.code}
                </span>
                {t("prodSter.confirmDescPost")}
              </span>
              {vPassedUnits.length > 0 && (
                <span className="block space-y-1 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-green-600">
                    {t("prodSter.passedInstruments")}
                  </span>
                  {groupUnits(vPassedUnits, tn, groupLabels).map((g) => (
                    <span key={g.key} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm text-gray-700">{g.title}</span>
                          {g.source === "paket" && <Badge variant="info">{t("common.package")}</Badge>}
                          {g.units.length > 1 && (
                            <span className="shrink-0 text-[11px] text-gray-400">×{g.units.length}</span>
                          )}
                        </span>
                        {g.source === "paket" && (
                          <span className="mt-0.5 block text-[11px] text-gray-500">
                            {instrumentCounts(g.units, tn, groupLabels.instrument)
                              .map((c) => `${c.name} (${c.qty})`)
                              .join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right font-mono text-[11px] text-gray-500">
                        {g.barcodeNo ?? g.units.map((u) => u.code ?? `#${u.id}`).join(", ")}
                      </span>
                    </span>
                  ))}
                </span>
              )}
              {vFailedUnits.length > 0 && (
                <span className="block space-y-1 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-red-500">
                    {t("prodSter.failedQueue")}
                  </span>
                  {groupUnits(vFailedUnits, tn, groupLabels).map((g) => (
                    <span key={g.key} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm text-gray-700">{g.title}</span>
                          {g.source === "paket" && <Badge variant="info">{t("common.package")}</Badge>}
                          {g.units.length > 1 && (
                            <span className="shrink-0 text-[11px] text-gray-400">×{g.units.length}</span>
                          )}
                        </span>
                        {g.source === "paket" && (
                          <span className="mt-0.5 block text-[11px] text-gray-500">
                            {instrumentCounts(g.units, tn, groupLabels.instrument)
                              .map((c) => `${c.name} (${c.qty})`)
                              .join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right font-mono text-[11px] text-gray-500">
                        {g.barcodeNo ?? g.units.map((u) => u.code ?? `#${u.id}`).join(", ")}
                      </span>
                    </span>
                  ))}
                </span>
              )}
              <span className="block text-xs text-gray-400">{t("prodSter.cannotUndo")}</span>
            </span>
          ) : undefined
        }
      />

      {/* Modal hasil batch dibuat */}
      <Modal
        open={done !== null}
        onClose={() => setDone(null)}
        title={t("prodSter.doneTitle")}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button onClick={() => setDone(null)} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {t("common.close")}
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
              {t("prodSter.doneMsgPre", { n: done.count })}
              <b>{t("prodSter.validateResult")}</b>
              {t("prodSter.doneMsgPost")}
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
        title={
          detailOrder
            ? `${t("prodSter.historyTitle")} — ${detailOrder.sterilization?.code ?? detailOrder.code}`
            : t("prodSter.historyTitle")
        }
        size="lg"
        footer={
          <div className="flex w-full justify-end">
            <Button variant="outline" onClick={() => setDetailOrder(null)}>
              {t("common.close")}
            </Button>
          </div>
        }
      >
        {detailOrder && detailOrder.sterilization && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {detailOrder.sterilization.status === "selesai" ? (
                <Badge variant="success">{t("prodSter.badgeSterile")}</Badge>
              ) : (
                <Badge variant="danger">{t("prodSter.badgeFailed")}</Badge>
              )}
              {detailOrder.code_transaction && (
                <span className="text-xs text-gray-500">{detailOrder.code_transaction}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-3">
              <Info label={t("prodSter.infoMachine")} value={detailOrder.sterilization.machine} />
              <Info label={t("prodSter.infoMethod")} value={tn(detailOrder.sterilization.method)} />
              <Info label={t("prodSter.infoCycle")} value={detailOrder.sterilization.cycle_number} />
              <Info label={t("prodSter.infoTemperature")} value={detailOrder.sterilization.temperature ? `${Number(detailOrder.sterilization.temperature)}°C` : null} />
              <Info label={t("prodSter.infoDuration")} value={detailOrder.sterilization.duration_minutes != null ? `${detailOrder.sterilization.duration_minutes} ${t("prodSter.minSuffix")}` : null} />
              <Info label={t("prodSter.infoSterilizedAt")} value={formatDateTime(detailOrder.sterilization.sterilized_at, lang)} />
              <Info label={t("prodSter.infoChemical")} value={tn(detailOrder.sterilization.chemical_indicator)} />
              <Info label={t("prodSter.infoBioControl")} value={tn(detailOrder.sterilization.bio_indicator_control)} />
              <Info label={t("prodSter.infoBioTest")} value={tn(detailOrder.sterilization.bio_indicator_test)} />
              <Info label={t("prodSter.infoProcessedBy")} value={detailOrder.sterilization.processed_by} />
              <Info label={t("prodSter.infoValidatedBy")} value={detailOrder.sterilization.validated_by} />
              <Info label={t("prodSter.infoValidatedAt")} value={detailOrder.sterilization.validated_at ? formatDateTime(detailOrder.sterilization.validated_at, lang) : null} />
              <div className="col-span-2 sm:col-span-3">
                <Info label={t("common.note")} value={detailOrder.sterilization.note} />
              </div>
            </div>

            <div className="space-y-2.5">
              <Label>{t("prodSter.sterilizedUnits", { n: detailOrder.unit_count })}</Label>
              {/* Dipisah dulu per jenis: Paket & Satuan. Untuk paket, detail isinya
                  muncul di bawah dan tetap dikelompokkan per barcode_no (label fisik). */}
              {[
                { kind: "paket" as const, label: t("prodSter.sectionPackage"), units: detailOrder.units.filter((u) => u.source === "paket") },
                { kind: "satuan" as const, label: t("prodSter.sectionSingle"), units: detailOrder.units.filter((u) => u.source !== "paket") },
              ]
                .filter((sec) => sec.units.length > 0)
                .map((sec) => (
                  <div key={sec.kind} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{sec.label}</span>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                        {groupUnits(sec.units, tn, groupLabels).length}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                      {groupUnits(sec.units, tn, groupLabels).map((g) => (
                        <div key={g.key} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {g.source === "paket" ? (
                              <Layers className="h-4 w-4 shrink-0 text-[#4ba69d]" />
                            ) : g.image ? (
                              <button
                                type="button"
                                onClick={() => setZoom({ url: g.image as string, name: g.title })}
                                className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded border border-gray-200"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={g.image} alt={g.title} className="h-full w-full object-cover" />
                              </button>
                            ) : (
                              <Layers className="h-4 w-4 shrink-0 text-[#075489]" />
                            )}
                            <span className="min-w-0 truncate text-sm font-medium text-gray-800">{g.title}</span>
                            {g.barcodeNo && (
                              <span className="shrink-0 font-mono text-[11px] text-gray-500">{g.barcodeNo}</span>
                            )}
                            <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-[#075489]/10 px-2 py-0.5 text-xs font-semibold text-[#075489]">
                              {g.units.length} {t("common.unit")}
                            </span>
                          </div>
                          {/* Detail isi paket (rincian instrumen per barcode). */}
                          {g.source === "paket" && (
                            <div className="mt-1 flex flex-wrap gap-1.5 pl-6">
                              {instrumentCounts(g.units, tn, groupLabels.instrument).map((c) => (
                                <span key={c.name} className="rounded bg-[#075489]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#075489]">
                                  {c.name} ({c.qty})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Zoom foto */}
      {zoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <button type="button" onClick={() => setZoom(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" title={t("common.close")}>
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

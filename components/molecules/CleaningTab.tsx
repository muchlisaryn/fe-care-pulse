"use client"

import { useEffect, useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  Package,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ListChecks,
  ZoomIn,
  X,
} from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"
import { useAppSelector } from "@/lib/store/hooks"
import type { CleaningOrder, CleaningUnit } from "@/lib/store/slices/cleaningSlice"

function formatDateTime(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ISO → "YYYY-MM-DDTHH:mm" untuk <input type="datetime-local"> (waktu lokal).
function toLocalInput(value: string | null): string {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Status pencucian sebuah order (turunan dari washing/order status).
export function isWashed(order: CleaningOrder): boolean {
  return order.washing?.status === "selesai" || order.status === "pengemasan"
}

// "Sudah diproses" = parameter pencucian sudah diisi & disimpan operator.
// Catatan: backend membuat record washing kosong saat order diterima, jadi
// keberadaan record saja belum berarti diproses — cek salah satu field terisi.
export function isWashingFilled(order: CleaningOrder): boolean {
  const w = order.washing
  return !!(
    w &&
    (w.machine_no ||
      w.operator ||
      w.temperature ||
      w.washed_at ||
      w.detergent_type ||
      w.duration_minutes ||
      w.washer_machine_id)
  )
}

// Hasil scan barcode mesin washer (master washer_machines).
type ScannedMachine = {
  id: number
  code: string
  name: string
  min_temperature: string | null
  max_temperature: string | null
  min_duration_minutes: number | null
  max_duration_minutes: number | null
}

function rangeText(
  min: string | number | null,
  max: string | number | null,
  suffix: string
): string | null {
  if (min === null && max === null) return null
  const lo = min === null ? "?" : Number(min)
  const hi = max === null ? "?" : Number(max)
  return `${lo}–${hi}${suffix}`
}

// Titik tengah ambang min–max (untuk auto-isi parameter saat scan mesin).
// "" bila kedua ambang kosong; bila salah satu kosong, pakai yang ada.
function midpoint(min: string | number | null, max: string | number | null): string {
  const lo = min === null ? null : Number(min)
  const hi = max === null ? null : Number(max)
  if (lo !== null && hi !== null) return String(Math.round((lo + hi) / 2))
  if (lo !== null) return String(lo)
  if (hi !== null) return String(hi)
  return ""
}

/**
 * Konten tab "Cleaning & Pengemasan" pada halaman monitoring: daftar order tahap
 * cleaning + modal catatan pencucian. `items` sudah difilter & dipaginasi oleh
 * pemanggil; `onChanged` dipanggil setelah catatan pencucian disimpan.
 */
export function CleaningTab({
  items,
  onChanged,
  stage = "cleaning",
}: {
  items: CleaningOrder[]
  onChanged: () => void
  // Tahap aktif — menentukan warna garis kiri kartu (kuning=cleaning, ungu=packaging).
  stage?: "cleaning" | "packaging"
}) {
  // Operator default = user yang sedang login (untuk auto-isi ID Operator).
  const currentUser = useAppSelector((s) => s.auth.name ?? s.auth.username ?? "")

  const [active, setActive] = useState<CleaningOrder | null>(null)
  const [machineNo, setMachineNo] = useState("")
  const [operator, setOperator] = useState("")
  const [temperature, setTemperature] = useState("")
  const [washedAt, setWashedAt] = useState("")
  const [detergent, setDetergent] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mesin washer terpilih (beserta ambang) + daftar mesin dari master CSSD.
  const [washerMachineId, setWasherMachineId] = useState<number | null>(null)
  const [machineInfo, setMachineInfo] = useState<ScannedMachine | null>(null)
  const [machines, setMachines] = useState<ScannedMachine[]>([])
  const [duration, setDuration] = useState("")
  // Notifikasi kegagalan suhu/waktu dari backend (parameter di luar ambang mesin).
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  // Mode "Tandai Gagal" (pencucian wajib diulang) + alasan.
  const [failMode, setFailMode] = useState(false)
  const [failReason, setFailReason] = useState("")
  const [failing, setFailing] = useState(false)
  // Order yang sedang ditandai "Selesai" (pindah ke packaging) dari tombol kartu.
  const [completingId, setCompletingId] = useState<number | null>(null)
  // Konfirmasi penyelesaian cleaning: order target + waktu selesai (datetime-local).
  const [confirmTarget, setConfirmTarget] = useState<CleaningOrder | null>(null)
  const [completedAt, setCompletedAt] = useState("")
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // Muat daftar mesin washer aktif (master CSSD) untuk dropdown pilihan.
  useEffect(() => {
    let active = true
    ;(async () => {
      const collected: ScannedMachine[] = []
      let cur = 1
      let last = 1
      try {
        do {
          const res = await api.get("/master/washer-machines", { params: { page: cur, status: "aktif" } })
          const p = res.data.data
          collected.push(...p.data)
          last = p.last_page
          cur += 1
        } while (cur <= last && active)
        if (active) setMachines(collected)
      } catch {
        // Abaikan — dropdown tetap kosong bila gagal memuat.
      }
    })()
    return () => {
      active = false
    }
  }, [])

  function openWashing(order: CleaningOrder) {
    setActive(order)
    setError(null)
    setFailMode(false)
    setFailReason("")
    const w = order.washing
    setMachineNo(w?.machine_no ?? "")
    // Auto-isi dengan operator tersimpan; bila kosong pakai user yang login.
    setOperator(w?.operator || currentUser)
    setTemperature(w?.temperature ?? "")
    // Waktu mulai cuci: pakai yang tersimpan, atau otomatis jam sekarang saat dibuka.
    setWashedAt(toLocalInput(w?.washed_at ?? new Date().toISOString()))
    setDetergent(w?.detergent_type ?? "")
    setDuration(w?.duration_minutes != null ? String(w.duration_minutes) : "")
    setWasherMachineId(w?.washer_machine_id ?? null)
    // Mesin tersimpan ditampilkan tanpa ambang (ambang lengkap hanya saat dipilih).
    setMachineInfo(
      w?.washer_machine
        ? {
            ...w.washer_machine,
            min_temperature: null,
            max_temperature: null,
            min_duration_minutes: null,
            max_duration_minutes: null,
          }
        : null
    )
    setAlertMsg(w?.alert ? w.alert_message : null)
  }

  // Terapkan mesin terpilih → auto-isi nomor mesin, suhu & durasi (titik tengah
  // ambang). Di-set tanpa syarat agar saat ganti mesin data di bawah ikut terupdate.
  function applyMachine(m: ScannedMachine) {
    setMachineInfo(m)
    setWasherMachineId(m.id)
    setMachineNo(m.code)
    setTemperature(midpoint(m.min_temperature, m.max_temperature))
    setDuration(midpoint(m.min_duration_minutes, m.max_duration_minutes))
  }

  // Pilih mesin washer dari dropdown.
  function selectMachine(idStr: string) {
    const m = machines.find((x) => String(x.id) === idStr)
    if (!m) {
      setWasherMachineId(null)
      setMachineInfo(null)
      return
    }
    applyMachine(m)
  }

  // Payload parameter pencucian bersama (dipakai Simpan & Tandai Gagal).
  function washingPayload() {
    return {
      washer_machine_id: washerMachineId,
      machine_no: machineNo.trim() || null,
      operator: operator.trim() || null,
      temperature: temperature.trim() || null,
      washed_at: washedAt ? new Date(washedAt).toISOString() : null,
      duration_minutes: duration.trim() ? Number(duration) : null,
      detergent_type: detergent.trim() || null,
    }
  }

  // Simpan catatan pencucian (tanpa menyelesaikan). Bila parameter di luar ambang
  // mesin, backend menandai alert → modal tetap terbuka & notifikasi ditampilkan.
  async function saveWashing() {
    if (!active || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.put(`/master/cleaning/${active.id}/washing`, washingPayload())
      const w = res.data?.data?.washing as { alert?: boolean; alert_message?: string | null } | undefined
      onChanged()
      if (w?.alert) {
        setAlertMsg(w.alert_message ?? "Parameter pencucian di luar ambang mesin.")
      } else {
        setActive(null)
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? "Gagal menyimpan catatan pencucian.")
    } finally {
      setSaving(false)
    }
  }

  // Tandai pencucian "Gagal" (wajib diulang) — order tetap di tahap pencucian.
  async function failWashing() {
    if (!active || failing) return
    if (!failReason.trim()) {
      setError("Isi alasan kegagalan terlebih dahulu.")
      return
    }
    setFailing(true)
    setError(null)
    try {
      await api.put(`/master/cleaning/${active.id}/washing`, {
        ...washingPayload(),
        fail: true,
        failure_reason: failReason.trim(),
      })
      setActive(null)
      setFailMode(false)
      setFailReason("")
      onChanged()
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? "Gagal menandai pencucian gagal.")
    } finally {
      setFailing(false)
    }
  }

  // Buka modal konfirmasi penyelesaian cleaning (default waktu selesai = sekarang).
  function openComplete(order: CleaningOrder) {
    setConfirmTarget(order)
    setCompletedAt(toLocalInput(new Date().toISOString()))
    setConfirmError(null)
  }

  // Tandai "Selesai" → catat waktu selesai & order lanjut ke tahap packaging.
  // Field catatan yang sudah tersimpan dipertahankan (tidak dikirim ulang).
  async function completeWashing() {
    if (!confirmTarget || completingId) return
    if (!completedAt) {
      setConfirmError("Tentukan tanggal & jam selesai cleaning.")
      return
    }
    setCompletingId(confirmTarget.id)
    setConfirmError(null)
    try {
      await api.put(`/master/cleaning/${confirmTarget.id}/washing`, {
        complete: true,
        completed_at: new Date(completedAt).toISOString(),
      })
      setConfirmTarget(null)
      onChanged()
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setConfirmError(e.response?.data?.message ?? "Gagal menyelesaikan cleaning.")
    } finally {
      setCompletingId(null)
    }
  }

  const washedActive = active ? isWashed(active) : false

  return (
    <>
      <div className="space-y-2">
        {items.map((order) => (
          <CleaningOrderCard
            key={order.id}
            order={order}
            stage={stage}
            onOpen={() => openWashing(order)}
            onComplete={() => openComplete(order)}
            completing={completingId === order.id}
          />
        ))}
      </div>

      {/* Catatan pencucian */}
      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active ? `Catatan Pencucian — ${active.code}` : "Catatan Pencucian"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : washedActive ? (
              <span className="text-xs text-gray-400">Pencucian selesai.</span>
            ) : (
              <span className="text-xs text-gray-400">
                Isi data pencucian, lalu Simpan. Tandai Selesai dari kartu untuk lanjut ke packaging.
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setActive(null)}>
                Tutup
              </Button>
              {!washedActive && (
                <Button
                  onClick={saveWashing}
                  disabled={saving}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {active && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-2">
              <Detail label="Peminjam / Unit" value={active.borrowed_by} />
              <Detail label="Diproses" value={formatDateTime(active.processed_at)} />
            </div>

            <InstrumentList order={active} collapsible defaultOpen={false} />

            {alertMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-amber-700">
                    Notifikasi kegagalan suhu/waktu
                  </p>
                  <p className="text-xs text-amber-700/90">{alertMsg}</p>
                  <p className="mt-1 text-xs text-amber-600">
                    Pencucian belum bisa diselesaikan. Perbaiki parameter lalu Simpan ulang, atau
                    Tandai Gagal.
                  </p>
                </div>
              </div>
            )}

            {!washedActive && (
              <div className="space-y-1.5">
                <Label>Mesin Washer</Label>
                <SelectSearch
                  options={machines.map((m) => ({ value: String(m.id), label: `${m.code} — ${m.name}` }))}
                  value={washerMachineId ? String(washerMachineId) : ""}
                  onChange={selectMachine}
                  placeholder="Pilih mesin washer..."
                  searchPlaceholder="Cari kode / nama mesin..."
                />
                {machineInfo && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#075489]/30 bg-[#075489]/5 px-3 py-2 text-xs">
                    <Badge variant="info">{machineInfo.code}</Badge>
                    <span className="font-medium text-gray-800">{machineInfo.name}</span>
                    {rangeText(machineInfo.min_temperature, machineInfo.max_temperature, "°C") && (
                      <span className="text-gray-500">
                        Suhu{" "}
                        {rangeText(machineInfo.min_temperature, machineInfo.max_temperature, "°C")}
                      </span>
                    )}
                    {rangeText(
                      machineInfo.min_duration_minutes,
                      machineInfo.max_duration_minutes,
                      " mnt"
                    ) && (
                      <span className="text-gray-500">
                        Durasi{" "}
                        {rangeText(
                          machineInfo.min_duration_minutes,
                          machineInfo.max_duration_minutes,
                          " mnt"
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wash-machine">Nomor Mesin</Label>
                <Input
                  id="wash-machine"
                  value={machineNo}
                  onChange={(e) => setMachineNo(e.target.value)}
                  placeholder="mis. WD-01 / WSH-001"
                  disabled={washedActive}
                />
              </div>
              {/* ID Operator disembunyikan — terisi otomatis dari user yang login. */}
              <div className="space-y-1.5">
                <Label htmlFor="wash-temp">Suhu (°C)</Label>
                <Input
                  id="wash-temp"
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="mis. 60"
                  disabled={washedActive}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wash-time">Waktu Mulai Cuci</Label>
                <Input
                  id="wash-time"
                  type="datetime-local"
                  value={washedAt}
                  onChange={(e) => setWashedAt(e.target.value)}
                  disabled={washedActive}
                />
                <p className="text-xs text-gray-400">Terisi otomatis jam saat ini — bisa diubah.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wash-duration">Durasi (menit)</Label>
                <Input
                  id="wash-duration"
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="mis. 20"
                  disabled={washedActive}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wash-detergent">Jenis Deterjen / Enzimatis</Label>
                <Input
                  id="wash-detergent"
                  value={detergent}
                  onChange={(e) => setDetergent(e.target.value)}
                  placeholder="mis. Enzimatik, Deterjen Netral"
                  disabled={washedActive}
                />
              </div>
            </div>

            {!washedActive &&
              (failMode ? (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <Label htmlFor="fail-reason" className="text-red-700">
                    Alasan Kegagalan Pencucian
                  </Label>
                  <Textarea
                    id="fail-reason"
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    placeholder="mis. Suhu tidak tercapai, indikator kotor masih tersisa"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFailMode(false)
                        setFailReason("")
                      }}
                      disabled={failing}
                    >
                      Batal
                    </Button>
                    <Button
                      onClick={failWashing}
                      disabled={failing || !failReason.trim()}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {failing ? "Memproses..." : "Konfirmasi Gagal"}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setFailMode(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700"
                >
                  <XCircle className="h-4 w-4" />
                  Tandai pencucian gagal (wajib diulang)
                </button>
              ))}

            {washedActive && (
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
                <Package className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Tahap Pengemasan</p>
                  <p className="text-xs text-gray-500">
                    Pencucian selesai. Tahap pengemasan akan tersedia berikutnya.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Konfirmasi selesai cleaning & disinfection + catat waktu selesai */}
      <Modal
        open={confirmTarget !== null}
        onClose={completingId ? () => {} : () => setConfirmTarget(null)}
        title="Selesaikan Cleaning & Disinfection"
        size="sm"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {confirmError ? (
              <p className="text-sm text-red-600">{confirmError}</p>
            ) : (
              <span className="text-xs text-gray-400">Order akan lanjut ke Inspection &amp; Packaging.</span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmTarget(null)}
                disabled={completingId !== null}
              >
                Batal
              </Button>
              <Button
                onClick={completeWashing}
                disabled={completingId !== null}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {completingId !== null ? "Menyelesaikan..." : "Selesaikan"}
              </Button>
            </div>
          </div>
        }
      >
        {confirmTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#075489]/10">
                <CheckCircle2 className="h-5 w-5 text-[#075489]" />
              </div>
              <p className="pt-1.5 text-sm leading-relaxed text-gray-600">
                Pastikan proses cleaning &amp; disinfection untuk{" "}
                <span className="font-semibold text-gray-900">
                  {confirmTarget.code_transaction ?? confirmTarget.code}
                </span>{" "}
                sudah selesai.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="complete-time">Waktu Selesai Cleaning</Label>
              <Input
                id="complete-time"
                type="datetime-local"
                value={completedAt}
                readOnly
                disabled
                className="cursor-not-allowed bg-gray-50"
              />
              <p className="text-xs text-gray-400">
                Tercatat otomatis sesuai waktu saat ini &mdash; tidak dapat diubah.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// Rincian isi sebuah paket dalam order: instrumen penyusun + jumlah unitnya.
function paketBreakdown(order: CleaningOrder, packageName: string) {
  const map = new Map<string, { name: string; qty: number }>()
  for (const u of order.units ?? []) {
    if (u.source !== "paket" || u.package_name !== packageName) continue
    const name = u.instrument?.name ?? "Instrumen"
    const cur = map.get(name) ?? { name, qty: 0 }
    cur.qty += 1
    map.set(name, cur)
  }
  return [...map.values()]
}

// Satu kartu order pada tahap cleaning, dengan badge status pencucian.
function CleaningOrderCard({
  order,
  stage,
  onOpen,
  onComplete,
  completing,
}: {
  order: CleaningOrder
  stage: "cleaning" | "packaging"
  onOpen: () => void
  onComplete: () => void
  completing: boolean
}) {
  const washed = isWashed(order)
  // Sudah diproses = parameter pencucian sudah diisi tapi belum ditandai selesai.
  const inProcess = !washed && isWashingFilled(order)
  // Paket yang isinya sedang ditampilkan (klik chip paket).
  const [openPaket, setOpenPaket] = useState<string | null>(null)
  // Gambar per instrumen/paket (dari unit) untuk thumbnail di chip.
  const imageByName: Record<string, string> = {}
  for (const u of order.units ?? []) {
    const img = u.instrument?.image_url
    if (!img) continue
    if (u.instrument?.name && !imageByName[u.instrument.name]) imageByName[u.instrument.name] = img
    if (u.package_name && !imageByName[u.package_name]) imageByName[u.package_name] = img
  }
  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex items-start gap-1 px-1">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start justify-between gap-2 px-2 py-2.5 text-left"
        >
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              {/* Baris atas: kode batch + status pencucian. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                  {order.code_transaction ?? order.code}
                </span>
                {washed && <Badge variant="success">Selesai Cuci</Badge>}
                {!washed && order.washing?.status === "gagal" && (
                  <Badge variant="danger">Gagal Cuci</Badge>
                )}
                {!washed && order.washing?.alert && (
                  <Badge variant="warning">Cek Parameter</Badge>
                )}
              </div>

              {/* Nama paket / instrumen sebagai chip — paket bisa diklik utk lihat isi. */}
              {order.items?.length ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {order.items.slice(0, 4).map((it, i) => {
                    const isPaket = it.type === "paket"
                    const open = openPaket === it.name
                    return (
                      <span
                        key={`${it.name}-${i}`}
                        onClick={
                          isPaket
                            ? (e) => {
                                e.stopPropagation()
                                setOpenPaket(open ? null : it.name)
                              }
                            : undefined
                        }
                        title={isPaket ? "Lihat isi set" : `${it.name} ×${it.quantity}`}
                        className={
                          "inline-flex max-w-[200px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 " +
                          (isPaket
                            ? "cursor-pointer " +
                              (open
                                ? "bg-[#075489]/10 text-[#075489] ring-[#075489]/30"
                                : "bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100")
                            : "bg-gray-50 text-gray-700 ring-gray-200")
                        }
                      >
                        {imageByName[it.name] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageByName[it.name]} alt={it.name} className="h-5 w-5 shrink-0 rounded object-cover" />
                        )}
                        <span className="truncate font-medium">{it.name}</span>
                        {isPaket ? (
                          <ChevronDown className={"h-3 w-3 shrink-0 transition-transform " + (open ? "rotate-180" : "")} />
                        ) : (
                          <span className="shrink-0 text-gray-400">×{it.quantity}</span>
                        )}
                      </span>
                    )
                  })}
                  {order.items.length > 4 && (
                    <span className="rounded-md bg-[#075489]/8 px-1.5 py-0.5 text-xs font-medium text-[#075489]">
                      +{order.items.length - 4} lainnya
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {order.borrowed_by ?? "—"}
                </p>
              )}

              {/* Rincian isi paket yang dipilih. */}
              {openPaket && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1.5 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
                >
                  <p className="mb-1 text-[11px] font-semibold text-gray-500">Isi {openPaket}:</p>
                  <div className="flex flex-wrap gap-1">
                    {paketBreakdown(order, openPaket).map((p) => (
                      <span
                        key={p.name}
                        className="inline-flex items-center gap-1 rounded bg-white py-0.5 pl-0.5 pr-1.5 text-[11px] text-gray-600 ring-1 ring-gray-200"
                      >
                        {imageByName[p.name] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageByName[p.name]} alt={p.name} className="h-4 w-4 shrink-0 rounded object-cover" />
                        ) : null}
                        {p.name} ×{p.qty}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {order.washing?.machine_no && (
                <div className="mt-1.5 text-xs text-gray-500">
                  Mesin: {order.washing.machine_no}
                </div>
              )}
            </div>
          </div>
        </button>
        <div className="mt-1.5 mr-1 flex shrink-0 items-center gap-1.5 self-center">
          {washed ? (
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-1 rounded-md border border-[#075489] px-2 py-1 text-xs font-medium text-[#075489] hover:bg-[#075489]/10"
            >
              Detail
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            inProcess ? (
              <button
                type="button"
                onClick={onComplete}
                disabled={completing}
                className="rounded-md border border-[#075489] bg-[#075489] px-2 py-1 text-xs font-medium text-white hover:bg-[#075489]/90 disabled:opacity-60"
              >
                {completing ? "Memproses..." : "Selesai"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpen}
                className="rounded-md border border-[#075489] px-2 py-1 text-xs font-medium text-[#075489] hover:bg-[#075489]/10"
              >
                Proses
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// Daftar instrumen yang akan dicuci pada batch ini.
// - Bila ada unit fisik (`units`, mis. batch Produksi CSSD): tampilkan tiap unit
//   beserta kode stock & kondisi.
// - Bila belum ada unit fisik (order peminjaman, unit di-generate saat Packaging):
//   fallback ke ringkasan baris permintaan (`items`: jenis + jumlah).
function InstrumentList({
  order,
  collapsible = false,
  defaultOpen = true,
}: {
  order: CleaningOrder
  // Bila true, judul "Daftar Instrumen" jadi tombol untuk tampil/sembunyikan isi.
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  const hasUnits = (order.units?.length ?? 0) > 0

  // Kelompokkan unit fisik per instrumen agar ringkas (nama + gambar + daftar kode).
  const grouped = hasUnits
    ? Object.values(
        order.units.reduce<Record<string, { name: string; image: string | null; units: CleaningUnit[] }>>((acc, u) => {
          const name = u.instrument?.name ?? u.package_name ?? "Instrumen"
          const key = String(u.instrument?.id ?? name)
          ;(acc[key] ??= { name, image: u.instrument?.image_url ?? null, units: [] }).units.push(u)
          return acc
        }, {})
      )
    : []

  return (
    <div className="space-y-2">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
        >
          <span className="flex items-center gap-1.5">
            <ListChecks className="h-4 w-4" />
            Daftar Instrumen
          </span>
          <ChevronDown
            className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")}
          />
        </button>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <ListChecks className="h-4 w-4" />
          Daftar Instrumen
        </p>
      )}

      {collapsible && !open ? null : hasUnits ? (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {grouped.map((g) => (
            <li key={g.name} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {g.image ? (
                    <button
                      type="button"
                      onClick={() => setZoom({ url: g.image as string, name: g.name })}
                      title="Klik untuk perbesar"
                      className="group relative h-8 w-8 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.image} alt={g.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                        <ZoomIn className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ) : (
                    <Package className="h-4 w-4 shrink-0 text-[#075489]" />
                  )}
                  <span className="truncate text-sm font-medium text-gray-800">{g.name}</span>
                </span>
                <span className="shrink-0 text-xs text-gray-400">{g.units.length} unit</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {g.units.map((u) => (
                  <span
                    key={u.id}
                    className="font-mono text-[11px] font-medium text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded"
                    title={u.condition_out?.name ? `Kondisi: ${u.condition_out.name}` : undefined}
                  >
                    {u.code ?? `#${u.instrument_stock_id ?? u.id}`}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : order.items?.length ? (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {order.items.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-gray-800">
                {it.name}
                {it.type === "paket" && <Badge variant="info">Paket</Badge>}
              </span>
              <span className="text-xs text-gray-400">{it.quantity} unit</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400">
          Belum ada rincian instrumen.
        </p>
      )}

      {/* Zoom foto instrumen — overlay layar penuh */}
      {zoom && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            title="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex max-h-full max-w-3xl flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.url} alt={zoom.name} className="max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl" />
            <p className="text-sm font-medium text-white">{zoom.name}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {value ? (
        <p className="text-sm text-gray-800">{value}</p>
      ) : (
        <span className="text-gray-400 text-xs">—</span>
      )}
    </div>
  )
}

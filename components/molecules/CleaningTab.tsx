"use client"

import { useRef, useState } from "react"
import {
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
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { useToast } from "@/components/molecules/ToastProvider"
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

// Tanggal saja (tanpa jam) — dipakai untuk tanggal produksi di samping kode batch.
function formatDate(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

// Batch dibatalkan (riwayat) — read-only, tidak bisa diproses lagi.
export function isCanceled(order: CleaningOrder): boolean {
  return order.washing?.status === "batal"
}

// "Sudah diproses" = parameter pencucian sudah diisi & disimpan operator.
// Catatan: backend membuat record washing kosong saat order diterima, jadi
// keberadaan record saja belum berarti diproses — cek salah satu field terisi.
export function isWashingFilled(order: CleaningOrder): boolean {
  const w = order.washing
  return !!(
    w &&
    (w.operator ||
      w.temperature ||
      w.washed_at ||
      w.detergent_type ||
      w.duration_minutes ||
      w.washer_machine_id)
  )
}

// Mesin washer terpilih (master washer_machines) — dirujuk lewat id, tidak ada
// kode/barcode. Suhu & durasi standar = batas minimum deteksi kegagalan pencucian.
type ScannedMachine = {
  id: number
  name: string
  temperature: string | null
  duration_minutes: number | null
}

// Teks nilai standar mesin, mis. "60°C" / "20 mnt". null bila belum diisi.
function stdText(value: string | number | null, suffix: string): string | null {
  if (value === null) return null
  return `${Number(value)}${suffix}`
}

// Nilai auto-isi dari standar mesin ("" bila standar kosong).
function toInput(value: string | number | null): string {
  return value === null ? "" : String(Number(value))
}

// True bila `valStr` numerik & di BAWAH nilai standar mesin (standar null
// diabaikan). Standar diperlakukan sebagai batas minimum.
function belowStandard(valStr: string, standard: string | number | null): boolean {
  if (standard === null || valStr.trim() === "") return false
  const v = Number(valStr)
  if (Number.isNaN(v)) return false
  return v < Number(standard)
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
  compact = false,
}: {
  items: CleaningOrder[]
  onChanged: () => void
  // Tahap aktif — menentukan warna garis kiri kartu (kuning=cleaning, ungu=packaging).
  stage?: "cleaning" | "packaging"
  // Kartu ringkas: rincian (isi instrumen, mesin, catatan) disembunyikan dari daftar
  // dan hanya muncul saat kartu dibuka. Dipakai pada sub-tampilan History.
  compact?: boolean
}) {
  // Operator default = user yang sedang login (untuk auto-isi ID Operator).
  const currentUser = useAppSelector((s) => s.auth.name ?? s.auth.username ?? "")
  const toast = useToast()

  const [active, setActive] = useState<CleaningOrder | null>(null)
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
  // Status muat daftar mesin washer (animasi loading dropdown) + penanda sudah dimuat.
  const [machinesLoading, setMachinesLoading] = useState(false)
  const machinesLoadedRef = useRef(false)
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
  // Batalkan batch yang belum diproses → stok kembali ke semula.
  const [cancelTarget, setCancelTarget] = useState<CleaningOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Muat daftar mesin washer aktif (master CSSD) untuk dropdown — dipanggil lazy saat
  // tombol Proses ditekan (bukan saat mount). Hanya di-fetch sekali (cache via ref).
  async function loadMachines() {
    if (machinesLoadedRef.current || machinesLoading) return
    setMachinesLoading(true)
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
      } while (cur <= last)
      setMachines(collected)
      machinesLoadedRef.current = true
    } catch {
      // Abaikan — dropdown tetap kosong bila gagal memuat.
    } finally {
      setMachinesLoading(false)
    }
  }

  function openWashing(order: CleaningOrder) {
    // Muat daftar mesin washer saat modal Proses dibuka pertama kali.
    loadMachines()
    setActive(order)
    setError(null)
    setFailMode(false)
    setFailReason("")
    const w = order.washing
    // Auto-isi dengan operator tersimpan; bila kosong pakai user yang login.
    setOperator(w?.operator || currentUser)
    setTemperature(w?.temperature ?? "")
    // Waktu mulai cuci: pakai yang tersimpan, atau otomatis jam sekarang saat dibuka.
    setWashedAt(toLocalInput(w?.washed_at ?? new Date().toISOString()))
    setDetergent(w?.detergent_type ?? "")
    setDuration(w?.duration_minutes != null ? String(w.duration_minutes) : "")
    setWasherMachineId(w?.washer_machine_id ?? null)
    // Mesin tersimpan ditampilkan tanpa standar (standar lengkap hanya saat dipilih;
    // begitu daftar mesin termuat, `activeMachine` mengambil standar dari master).
    setMachineInfo(
      w?.washer_machine
        ? {
            ...w.washer_machine,
            temperature: null,
            duration_minutes: null,
          }
        : null
    )
    setAlertMsg(w?.alert ? w.alert_message : null)
  }

  // Terapkan mesin terpilih → auto-isi suhu & durasi dari nilai standar mesin.
  // Di-set tanpa syarat agar saat ganti mesin data di bawah ikut terupdate.
  function applyMachine(m: ScannedMachine) {
    setMachineInfo(m)
    setWasherMachineId(m.id)
    setTemperature(toInput(m.temperature))
    setDuration(toInput(m.duration_minutes))
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
    if (!washReady) {
      setError("Lengkapi Mesin Washer, Suhu, Waktu Mulai Cuci, Durasi, dan Jenis Deterjen.")
      return
    }
    if (tempBelowStd || durationBelowStd) {
      setError("Suhu / durasi di bawah standar mesin washer terpilih. Sesuaikan dulu.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.put(`/master/cleaning/${active.id}/washing`, washingPayload())
      const w = res.data?.data?.washing as { alert?: boolean; alert_message?: string | null } | undefined
      onChanged()
      if (w?.alert) {
        setAlertMsg(w.alert_message ?? "Parameter pencucian di luar ambang mesin.")
        toast.error(w.alert_message ?? "Parameter pencucian di luar ambang mesin.")
      } else {
        toast.success(res.data?.message ?? "Catatan pencucian berhasil disimpan.")
        setActive(null)
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      const msg = e.response?.data?.message ?? "Gagal menyimpan catatan pencucian."
      setError(msg)
      toast.error(msg)
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
      // Tandai Gagal hanya sebagai penanda — tidak mengirim/memproses parameter
      // pencucian, cukup status + alasan.
      const res = await api.put(`/master/cleaning/${active.id}/washing`, {
        fail: true,
        failure_reason: failReason.trim(),
      })
      setActive(null)
      setFailMode(false)
      setFailReason("")
      onChanged()
      toast.success(res.data?.message ?? "Pencucian ditandai gagal.")
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      const msg = e.response?.data?.message ?? "Gagal menandai pencucian gagal."
      setError(msg)
      toast.error(msg)
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
      const res = await api.put(`/master/cleaning/${confirmTarget.id}/washing`, {
        complete: true,
        completed_at: new Date(completedAt).toISOString(),
      })
      setConfirmTarget(null)
      onChanged()
      toast.success(res.data?.message ?? "Cleaning & disinfection selesai.")
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      const msg = e.response?.data?.message ?? "Gagal menyelesaikan cleaning."
      setConfirmError(msg)
      toast.error(msg)
    } finally {
      setCompletingId(null)
    }
  }

  // Batalkan batch cleaning yang belum diproses → stok dikembalikan ke semula.
  async function cancelWashing() {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    try {
      const res = await api.delete(`/master/cleaning/${cancelTarget.id}/cancel`)
      setCancelTarget(null)
      onChanged()
      toast.success(res.data?.message ?? "Pencucian dibatalkan & stok dikembalikan.")
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e.response?.data?.message ?? "Gagal membatalkan pencucian.")
    } finally {
      setCancelling(false)
    }
  }

  const washedActive = active ? isWashed(active) : false

  // Batch dibatalkan → modal read-only (form disembunyikan, hanya riwayat).
  const canceledActive = active ? isCanceled(active) : false

  // Mesin terpilih dengan standar lengkap: utamakan entri dari daftar master (punya
  // suhu/durasi standar), fallback ke info mesin tersimpan. Dipakai untuk deteksi
  // suhu/durasi di bawah standar.
  const activeMachine =
    washerMachineId != null
      ? machines.find((m) => m.id === washerMachineId) ?? machineInfo
      : null
  const tempBelowStd = activeMachine ? belowStandard(temperature, activeMachine.temperature) : false
  const durationBelowStd = activeMachine
    ? belowStandard(duration, activeMachine.duration_minutes)
    : false

  // Field parameter pencucian yang wajib diisi sebelum Simpan.
  const washReady =
    washerMachineId !== null &&
    temperature.trim() !== "" &&
    washedAt !== "" &&
    duration.trim() !== "" &&
    detergent.trim() !== ""

  return (
    <>
      <div className="space-y-2">
        {items.map((order) => (
          <CleaningOrderCard
            key={order.id}
            order={order}
            stage={stage}
            compact={compact}
            onOpen={() => openWashing(order)}
            onComplete={() => openComplete(order)}
            onCancel={() => setCancelTarget(order)}
            completing={completingId === order.id}
          />
        ))}
      </div>

      {/* Catatan pencucian */}
      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title="Catatan Pencucian"
        size="lg"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : canceledActive ? (
              <span className="text-xs text-gray-400">Batch dibatalkan.</span>
            ) : washedActive ? (
              <span className="text-xs text-gray-400">Pencucian selesai.</span>
            ) : null}
            <div className="flex shrink-0 justify-end gap-2 sm:ml-auto">
              <Button variant="outline" onClick={() => setActive(null)}>
                Tutup
              </Button>
              {!washedActive && !canceledActive && (
                <Button
                  onClick={saveWashing}
                  disabled={saving || !washReady || tempBelowStd || durationBelowStd}
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
            {canceledActive && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Batch dibatalkan</p>
                  <p className="text-xs text-red-600/90">
                    Seluruh unit sudah dikembalikan ke stok semula. Batch ini tersimpan sebagai riwayat.
                  </p>
                </div>
              </div>
            )}

            <InstrumentList order={active} collapsible />

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

            {!washedActive && !canceledActive && (
              <div className="space-y-1.5">
                <Label>
                  Mesin Washer <span className="text-red-500">*</span>
                </Label>
                <SelectSearch
                  options={machines.map((m) => ({ value: String(m.id), label: m.name }))}
                  value={washerMachineId ? String(washerMachineId) : ""}
                  onChange={selectMachine}
                  loading={machinesLoading}
                  placeholder="Pilih mesin washer..."
                  searchPlaceholder="Cari nama mesin..."
                />
                {activeMachine && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#075489]/30 bg-[#075489]/5 px-3 py-2 text-xs">
                    <span className="font-medium text-gray-800">{activeMachine.name}</span>
                    {stdText(activeMachine.temperature, "°C") && (
                      <span className="text-gray-500">
                        Suhu standar {stdText(activeMachine.temperature, "°C")}
                      </span>
                    )}
                    {stdText(activeMachine.duration_minutes, " mnt") && (
                      <span className="text-gray-500">
                        Durasi standar {stdText(activeMachine.duration_minutes, " mnt")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Dua kolom rata: Suhu | Durasi (keduanya dibandingkan ke standar mesin),
                lalu Waktu Mulai Cuci | Jenis Deterjen. Nomor Mesin dihapus — mesin
                dirujuk lewat pilihan Mesin Washer di atas (washer_machine_id); ID
                Operator juga disembunyikan, terisi otomatis dari user yang login. */}
            {!canceledActive && (
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wash-temp">
                  Suhu (°C) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="wash-temp"
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="mis. 60"
                  disabled={washedActive}
                  min={activeMachine?.temperature ?? undefined}
                  error={tempBelowStd}
                  aria-invalid={tempBelowStd}
                />
                {activeMachine && stdText(activeMachine.temperature, "°C") && tempBelowStd && (
                  <p className="text-xs text-red-600">
                    Di bawah standar mesin ({stdText(activeMachine.temperature, "°C")}).
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wash-duration">
                  Durasi (menit) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="wash-duration"
                  type="number"
                  min={activeMachine?.duration_minutes ?? 0}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="mis. 20"
                  disabled={washedActive}
                  error={durationBelowStd}
                  aria-invalid={durationBelowStd}
                />
                {activeMachine && stdText(activeMachine.duration_minutes, " mnt") && durationBelowStd && (
                  <p className="text-xs text-red-600">
                    Di bawah standar mesin ({stdText(activeMachine.duration_minutes, " mnt")}).
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wash-time">
                  Waktu Mulai Cuci <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="wash-time"
                  type="datetime-local"
                  value={washedAt}
                  onChange={(e) => setWashedAt(e.target.value)}
                  disabled={washedActive}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wash-detergent">
                  Jenis Deterjen / Enzimatis <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="wash-detergent"
                  value={detergent}
                  onChange={(e) => setDetergent(e.target.value)}
                  placeholder="mis. Enzimatik, Deterjen Netral"
                  disabled={washedActive}
                />
              </div>
            </div>
            )}

            {/* "Tandai Pencucian Gagal" hanya tersedia bila batch sudah diproses
                (parameter pencucian sudah diisi & disimpan). */}
            {!washedActive && !canceledActive && isWashingFilled(active) &&
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                >
                  <XCircle className="h-4 w-4" />
                  Tandai Pencucian Gagal
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
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {confirmError ? (
              <p className="text-sm text-red-600">{confirmError}</p>
            ) : (
              <span className="text-xs text-gray-400">Order akan lanjut ke Inspection &amp; Packaging.</span>
            )}
            <div className="flex shrink-0 justify-end gap-2">
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

      {/* Konfirmasi batal batch cleaning yang belum diproses (stok dikembalikan) */}
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelWashing}
        loading={cancelling}
        title="Batalkan Pencucian"
        confirmLabel="Batalkan"
        loadingLabel="Membatalkan..."
        description={
          cancelTarget
            ? `Batalkan batch ${cancelTarget.code_transaction ?? cancelTarget.code}? Seluruh unit akan dikembalikan ke stok semula (tersedia).`
            : undefined
        }
      />
    </>
  )
}

// Label ringkas yang menyembunyikan kode unit sampai di-hover / difokus keyboard.
// Dipakai baris paket (per instrumen penyusun) & baris satuan (pada jumlah unit).
function CodesOnHover({
  label,
  codes,
  align = "left",
  className = "",
}: {
  label: string
  codes: string[]
  align?: "left" | "right"
  className?: string
}) {
  return (
    <span
      tabIndex={0}
      className={
        "group relative cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-[#075489] " +
        className
      }
    >
      {label}
      {codes.length > 0 && (
        <span
          className={
            "pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max max-w-[220px] rounded-md bg-gray-900 px-2 py-1.5 text-left shadow-lg group-hover:block group-focus:block " +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          <span className="flex flex-wrap gap-1">
            {codes.map((c) => (
              <span key={c} className="font-mono text-[10px] font-medium text-white">
                {c}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}

// Satu baris "Daftar Instrumen": satu instrumen satuan, atau satu paket beserta
// rincian instrumen penyusunnya.
type UnitGroup = {
  kind: "satuan" | "paket"
  name: string // nama instrumen (satuan) / nama paket (paket)
  // Nomor set yang tergabung di baris ini — jumlahnya = kuantitas paket.
  packageNos: Set<string>
  image: string | null
  units: CleaningUnit[]
  // Hanya untuk paket: instrumen penyusun + jumlah unit + kode-kodenya.
  breakdown: { name: string; codes: string[] }[]
}

// Satu baris per NAMA: unit `satuan` dikelompokkan per nama instrumen, unit `paket`
// per nama paket — 2 set "SET PARTUS" melebur jadi satu baris, kuantitasnya dihitung
// dari jumlah `package_no` berbeda (batch lama tanpa package_no dianggap satu set).
// Semua nilai dari snapshot production_item (u.name / u.code / u.image_url).
function groupUnits(units: CleaningUnit[]): UnitGroup[] {
  const groups: UnitGroup[] = []
  const index = new Map<string, UnitGroup>()

  for (const u of units) {
    const isPaket = u.source === "paket"
    const name = (isPaket ? u.package_name : u.name) ?? "Instrumen"
    const key = `${isPaket ? "paket" : "satuan"}|${name}`

    // Satu kolom foto: sudah berisi foto paket / foto instrumen sesuai jenis baris.
    const image = u.image_url ?? null

    let g = index.get(key)
    if (!g) {
      g = {
        kind: isPaket ? "paket" : "satuan",
        name,
        packageNos: new Set(),
        image,
        units: [],
        breakdown: [],
      }
      index.set(key, g)
      groups.push(g)
    }
    g.units.push(u)
    g.image ??= image
    if (isPaket) g.packageNos.add(String(u.package_no ?? ""))

    if (isPaket) {
      const itemName = u.name ?? "Instrumen"
      let b = g.breakdown.find((x) => x.name === itemName)
      if (!b) {
        b = { name: itemName, codes: [] }
        g.breakdown.push(b)
      }
      if (u.code) b.codes.push(u.code)
    }
  }

  return groups
}

// Rincian isi sebuah paket dalam order: instrumen penyusun + jumlah unitnya.
function paketBreakdown(order: CleaningOrder, packageName: string) {
  const map = new Map<string, { name: string; qty: number }>()
  for (const u of order.units ?? []) {
    if (u.source !== "paket" || u.package_name !== packageName) continue
    const name = u.name ?? "Instrumen"
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
  onCancel,
  completing,
  compact = false,
}: {
  order: CleaningOrder
  stage: "cleaning" | "packaging"
  onOpen: () => void
  onComplete: () => void
  onCancel: () => void
  completing: boolean
  // Sembunyikan rincian dari kartu (dipakai di History) — tetap bisa dilihat
  // dengan membuka kartunya.
  compact?: boolean
}) {
  const washed = isWashed(order)
  const canceled = isCanceled(order)
  // Sudah diproses = parameter pencucian sudah diisi tapi belum ditandai selesai.
  const inProcess = !washed && !canceled && isWashingFilled(order)
  // Paket yang isinya sedang ditampilkan (klik chip paket).
  const [openPaket, setOpenPaket] = useState<string | null>(null)
  // Foto instrumen yang sedang di-zoom (klik thumbnail isi set) — null = tidak ada.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // Gambar per instrumen/paket (dari unit) untuk thumbnail di chip.
  const imageByName: Record<string, string> = {}
  for (const u of order.units ?? []) {
    if (!u.image_url) continue
    // Foto baris paket = foto paket; foto baris satuan = foto instrumen.
    const key = u.source === "paket" ? u.package_name : u.name
    if (key && !imageByName[key]) imageByName[key] = u.image_url
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
              {/* Baris 1: status | kode produksi | tanggal produksi. */}
              <div className="flex flex-wrap items-center gap-2">
                {washed ? (
                  <Badge variant="success">Selesai Cuci</Badge>
                ) : canceled ? (
                  <Badge variant="default">Dibatalkan</Badge>
                ) : order.washing?.status === "gagal" ? (
                  <Badge variant="danger">Gagal Cuci</Badge>
                ) : inProcess ? (
                  <Badge variant="info">Diproses</Badge>
                ) : (
                  <Badge variant="warning">Belum Diproses</Badge>
                )}
                {!washed && !canceled && order.washing?.alert && (
                  <Badge variant="warning">Cek Parameter</Badge>
                )}
                <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                  {order.code_transaction ?? order.code}
                </span>
                {order.processed_at && (
                  <span className="text-xs text-gray-500">{formatDate(order.processed_at)}</span>
                )}
              </div>

              {/* Nama paket / instrumen sebagai chip — paket bisa diklik utk lihat isi.
                  Pada kartu ringkas (History) chip tetap tampil, tapi tidak bisa diklik
                  karena rincian isinya disembunyikan. */}
              {order.items?.length ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  {order.items.slice(0, 4).map((it, i) => {
                    const isPaket = it.type === "paket" && !compact
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
                <p className="mt-2.5 truncate text-sm font-semibold text-gray-900">
                  {order.borrowed_by ?? "—"}
                </p>
              )}

              {/* Mesin cuci: nama mesin + tanggal & jam mulai cuci (di bawah nama instrumen). */}
              {!compact && order.washing?.washer_machine?.name && (
                <p className="mt-2.5 text-xs text-gray-500">
                  Diproses mesin:{" "}
                  <span className="font-medium text-gray-700">
                    {order.washing.washer_machine.name}
                  </span>
                  {order.washing.washed_at && `, ${formatDateTime(order.washing.washed_at)}`}
                </p>
              )}

              {/* Rincian isi paket yang dipilih. */}
              {!compact && openPaket && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1.5 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
                >
                  <p className="mb-1 text-[11px] font-semibold text-gray-500">Isi {openPaket}:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {paketBreakdown(order, openPaket).map((p) => (
                      <span
                        key={p.name}
                        className="inline-flex items-center gap-1.5 rounded-md bg-white py-1 pl-1 pr-2 text-[11px] text-gray-600 ring-1 ring-gray-200"
                      >
                        {imageByName[p.name] ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setZoom({ url: imageByName[p.name], name: p.name })
                            }}
                            title="Klik untuk perbesar"
                            className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageByName[p.name]}
                              alt={p.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                              <ZoomIn className="h-3 w-3" />
                            </span>
                          </button>
                        ) : (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#075489]/8">
                            <Package className="h-3.5 w-3.5 text-[#075489]" />
                          </span>
                        )}
                        <span className="font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-400">×{p.qty}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Catatan (opsional) dari tahap Mulai Produksi. */}
              {!compact && order.note && (
                <p className="mt-1.5 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">Catatan:</span> {order.note}
                </p>
              )}

              {/* Tanggal produksi tampil di samping kode & waktu cuci di baris mesin;
                  di sini cukup tampilkan waktu selesai cuci saat batch sudah selesai. */}
              {!canceled && washed && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  <span>Selesai cuci: {formatDateTime(order.washing?.completed_at ?? null)}</span>
                </div>
              )}
            </div>
          </div>
        </button>
        <div className="mt-1.5 mr-1 flex shrink-0 items-center gap-1.5 self-center">
          {washed || canceled ? null : (
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
              <>
                {/* Belum diproses → boleh dibatalkan (stok kembali ke semula). */}
                {stage === "cleaning" && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Batal
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpen}
                  className="rounded-md border border-[#075489] px-2 py-1 text-xs font-medium text-[#075489] hover:bg-[#075489]/10"
                >
                  Proses
                </button>
              </>
            )
          )}
        </div>
      </div>

      {/* Zoom foto instrumen isi set — overlay layar penuh */}
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

  // Kelompokkan unit fisik jadi baris daftar. Unit `satuan` dikelompokkan per nama
  // instrumen; unit `paket` per NAMA PAKET, dengan rincian instrumen penyusunnya.
  // Semua nama/kode/foto dibaca dari snapshot production_item (u.name, u.code,
  // u.image_url), bukan relasi ke master, agar daftar batch lama tidak ikut berubah
  // saat master diubah.
  const grouped = hasUnits ? groupUnits(order.units) : []

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
            <li key={`${g.kind}-${g.name}`} className="px-3 py-2">
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
                  {g.kind === "paket" && <Badge variant="info">Paket</Badge>}
                </span>
                {/* Kuantitas: satuan = jumlah unit, paket = jumlah SET (bukan jumlah
                    instrumen di dalamnya). Pada satuan, kode unit muncul saat di-hover. */}
                {g.kind === "satuan" ? (
                  <CodesOnHover
                    label={`×${g.units.length}`}
                    codes={g.units.map((u) => u.code ?? `#${u.instrument_stock_id ?? u.id}`)}
                    align="right"
                    className="shrink-0 text-xs text-gray-400 underline decoration-dotted underline-offset-4"
                  />
                ) : (
                  <span className="shrink-0 text-xs text-gray-400">×{g.packageNos.size}</span>
                )}
              </div>

              {/* Isi paket: "Gunting (2)" — kode unitnya muncul saat di-hover. */}
              {g.kind === "paket" && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.breakdown.map((b) => (
                    <CodesOnHover
                      key={b.name}
                      label={`${b.name} (${b.codes.length})`}
                      codes={b.codes}
                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700"
                    />
                  ))}
                </div>
              )}
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

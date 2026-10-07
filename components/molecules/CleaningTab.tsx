"use client"

import { useRef, useState } from "react"
import {
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ListChecks,
  ZoomIn,
  X,
  Calendar,
  Clock,
  Droplet,
  FlaskConical,
  Stethoscope,
  Thermometer,
  Trash2,
} from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { RowActionsMenu, type RowActionItem } from "@/components/molecules/RowActionsMenu"
import { useToast } from "@/components/molecules/ToastProvider"
import api from "@/lib/axios"
import { useLanguage, type Lang } from "@/lib/i18n"
import { useAppSelector } from "@/lib/store/hooks"
import type { CleaningOrder, CleaningUnit } from "@/lib/store/slices/cleaningSlice"

// Nama bulan ikut bahasa aktif.
const localeOf = (lang: Lang) => (lang === "id" ? "id-ID" : "en-GB")

function formatDateTime(value: string | null, lang: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Tanggal saja (tanpa jam) — dipakai untuk tanggal produksi di samping kode batch.
function formatDate(value: string | null, lang: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// Tanggal + jam serba angka ("05/10/2026 14.02") — dipakai statistik di kartu batch,
// tempat nama bulan yang dieja membuat kolomnya tidak sama lebar antar kartu.
function formatStamp(value: string | null, lang: Lang) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const tanggal = d.toLocaleDateString(localeOf(lang), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
  const jam = d.toLocaleTimeString(localeOf(lang), { hour: "2-digit", minute: "2-digit" })
  return `${tanggal} ${jam}`
}

// Lama pencucian dari mulai sampai selesai: "45 menit", "2 jam", "1 jam 20 menit".
// null bila salah satu waktunya kosong atau selesainya mendahului mulainya.
function lamaCuci(
  mulai: string | null,
  selesai: string | null,
  t: (kunci: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!mulai || !selesai) return null
  const selisih = new Date(selesai).getTime() - new Date(mulai).getTime()
  if (Number.isNaN(selisih) || selisih < 0) return null
  const menit = Math.round(selisih / 60000)
  const jam = Math.floor(menit / 60)
  const sisa = menit % 60
  if (jam === 0) return t("prodClean.elapsedM", { m: sisa })
  if (sisa === 0) return t("prodClean.elapsedH", { h: jam })
  return t("prodClean.elapsedHM", { h: jam, m: sisa })
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
  const { t, tn, lang } = useLanguage()

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
      setError(t("prodClean.errRequired"))
      return
    }
    if (tempBelowStd || durationBelowStd) {
      setError(t("prodClean.errBelowStd"))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.put(`/master/cleaning/${active.id}/washing`, washingPayload())
      const w = res.data?.data?.washing as { alert?: boolean; alert_message?: string | null } | undefined
      onChanged()
      if (w?.alert) {
        setAlertMsg(w.alert_message ?? t("prodClean.alertOutside"))
        toast.error(w.alert_message ?? t("prodClean.alertOutside"))
      } else {
        toast.success(t("prodClean.savedRecord"))
        setActive(null)
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      const msg = e.response?.data?.message ?? t("prodClean.failSaveRecord")
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
      setError(t("prodClean.errFailReason"))
      return
    }
    setFailing(true)
    setError(null)
    try {
      // Tandai Gagal hanya sebagai penanda — tidak mengirim/memproses parameter
      // pencucian, cukup status + alasan.
      await api.put(`/master/cleaning/${active.id}/washing`, {
        fail: true,
        failure_reason: failReason.trim(),
      })
      setActive(null)
      setFailMode(false)
      setFailReason("")
      onChanged()
      toast.success(t("prodClean.markedFailed"))
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      const msg = e.response?.data?.message ?? t("prodClean.failMarkFailed")
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
      setConfirmError(t("prodClean.errCompletionTime"))
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
      toast.success(t("prodClean.cleaningCompleted"))
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      const msg = e.response?.data?.message ?? t("prodClean.failCompleteCleaning")
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
      await api.delete(`/master/cleaning/${cancelTarget.id}/cancel`)
      setCancelTarget(null)
      onChanged()
      toast.success(t("prodClean.washCanceled"))
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e.response?.data?.message ?? t("prodClean.failCancelWashing"))
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
      <div className="space-y-3">
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
        title={t("prodClean.modalTitle")}
        size="lg"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : canceledActive ? (
              <span className="text-xs text-gray-400">{t("prodClean.batchCanceledShort")}</span>
            ) : null}
            <div className="flex shrink-0 justify-end gap-2 sm:ml-auto">
              <Button variant="outline" onClick={() => setActive(null)}>
                {t("common.close")}
              </Button>
              {!washedActive && !canceledActive && (
                <Button
                  onClick={saveWashing}
                  disabled={saving || !washReady || tempBelowStd || durationBelowStd}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  {saving ? t("common.saving") : t("common.save")}
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
                  <p className="text-sm font-semibold text-red-700">{t("prodClean.canceledTitle")}</p>
                  <p className="text-xs text-red-600/90">{t("prodClean.canceledDesc")}</p>
                </div>
              </div>
            )}

            <InstrumentList order={active} collapsible />

            {alertMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-amber-700">{t("prodClean.alertTitle")}</p>
                  <p className="text-xs text-amber-700/90">{alertMsg}</p>
                  <p className="mt-1 text-xs text-amber-600">{t("prodClean.alertHint")}</p>
                </div>
              </div>
            )}

            {!washedActive && !canceledActive && (
              <div className="space-y-1.5">
                <Label>
                  {t("prodClean.washerMachine")} <span className="text-red-500">*</span>
                </Label>
                <SelectSearch
                  options={machines.map((m) => ({ value: String(m.id), label: m.name }))}
                  value={washerMachineId ? String(washerMachineId) : ""}
                  onChange={selectMachine}
                  loading={machinesLoading}
                  placeholder={t("prodClean.machinePlaceholder")}
                  searchPlaceholder={t("prodClean.machineSearch")}
                  loadingText={t("common.loadingOptions")}
                  emptyText={t("common.notFound")}
                />
                {activeMachine && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#075489]/30 bg-[#075489]/5 px-3 py-2 text-xs">
                    <span className="font-medium text-gray-800">{activeMachine.name}</span>
                    {stdText(activeMachine.temperature, "°C") && (
                      <span className="text-gray-500">
                        {t("prodClean.stdTemp")} {stdText(activeMachine.temperature, "°C")}
                      </span>
                    )}
                    {stdText(activeMachine.duration_minutes, ` ${t("prodSter.minSuffix")}`) && (
                      <span className="text-gray-500">
                        {t("prodClean.stdDuration")}{" "}
                        {stdText(activeMachine.duration_minutes, ` ${t("prodSter.minSuffix")}`)}
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
            {/* Hanya untuk batch yang masih diproses. Pada riwayat nilainya pindah ke
                kotak ringkasan di bawah — isian terkunci hanya mengulang hal yang sama. */}
            {!canceledActive && !washedActive && (
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wash-temp">
                  {t("prodClean.temperature")} {!washedActive && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="wash-temp"
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder={t("prodClean.tempPlaceholder")}
                  disabled={washedActive}
                  min={activeMachine?.temperature ?? undefined}
                  error={tempBelowStd}
                  aria-invalid={tempBelowStd}
                />
                {activeMachine && stdText(activeMachine.temperature, "°C") && tempBelowStd && (
                  <p className="text-xs text-red-600">
                    {t("prodClean.belowStd", {
                      value: stdText(activeMachine.temperature, "°C") ?? "",
                    })}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wash-duration">
                  {t("prodClean.duration")} {!washedActive && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="wash-duration"
                  type="number"
                  min={activeMachine?.duration_minutes ?? 0}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder={t("prodClean.durationPlaceholder")}
                  disabled={washedActive}
                  error={durationBelowStd}
                  aria-invalid={durationBelowStd}
                />
                {activeMachine &&
                  stdText(activeMachine.duration_minutes, ` ${t("prodSter.minSuffix")}`) &&
                  durationBelowStd && (
                    <p className="text-xs text-red-600">
                      {t("prodClean.belowStd", {
                        value:
                          stdText(activeMachine.duration_minutes, ` ${t("prodSter.minSuffix")}`) ?? "",
                      })}
                    </p>
                  )}
              </div>
              {/* Pada riwayat, waktu mulai cuci sudah ada di ringkasan di bawah —
                  isian ini hanya untuk batch yang masih diproses. */}
              {!washedActive && (
                <div className="space-y-1.5">
                  <Label htmlFor="wash-time">
                    {t("prodClean.washStart")} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="wash-time"
                    type="datetime-local"
                    value={washedAt}
                    onChange={(e) => setWashedAt(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="wash-detergent">
                  {t("prodClean.detergent")} {!washedActive && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="wash-detergent"
                  value={detergent}
                  onChange={(e) => setDetergent(e.target.value)}
                  placeholder={t("prodClean.detergentPlaceholder")}
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
                    {t("prodClean.failReasonLabel")}
                  </Label>
                  <Textarea
                    id="fail-reason"
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    placeholder={t("prodClean.failReasonPlaceholder")}
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
                      {t("common.cancel")}
                    </Button>
                    <Button
                      onClick={failWashing}
                      disabled={failing || !failReason.trim()}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {failing ? t("production.processing") : t("prodClean.confirmFailure")}
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
                  {t("prodClean.markFailed")}
                </button>
              ))}

            {/* Riwayat: kapan dicuci, kapan selesai, berapa lama, dan oleh siapa. */}
            {washedActive && (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-2">
                {(
                  [
                    [t("prodClean.productionCode"), active.code_transaction ?? active.code],
                    [t("prodClean.washStart"), formatDateTime(active.washing?.washed_at ?? null, lang)],
                    [t("prodClean.completionTime"), formatDateTime(active.washing?.completed_at ?? null, lang)],
                    [
                      t("prodClean.elapsed"),
                      lamaCuci(active.washing?.washed_at ?? null, active.washing?.completed_at ?? null, t),
                    ],
                    [
                      t("prodClean.officer"),
                      active.washing?.completed_by || active.washing?.operator || active.washing?.started_by || null,
                    ],
                    [t("prodClean.temperature"), active.washing?.temperature || null],
                    [
                      t("prodClean.duration"),
                      active.washing?.duration_minutes != null ? String(active.washing.duration_minutes) : null,
                    ],
                    [t("prodClean.detergent"), active.washing?.detergent_type || null],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {value && value !== "—" ? value : <span className="text-xs text-gray-400">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </Modal>

      {/* Konfirmasi selesai cleaning & disinfection + catat waktu selesai */}
      <Modal
        open={confirmTarget !== null}
        onClose={completingId ? () => {} : () => setConfirmTarget(null)}
        title={t("prodClean.completeTitle")}
        size="sm"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {confirmError ? (
              <p className="text-sm text-red-600">{confirmError}</p>
            ) : (
              <span className="text-xs text-gray-400">{t("prodClean.completeHint")}</span>
            )}
            <div className="flex shrink-0 justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmTarget(null)}
                disabled={completingId !== null}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={completeWashing}
                disabled={completingId !== null}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {completingId !== null ? t("prodClean.completing") : t("prodClean.complete")}
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
                {t("prodClean.completeDescPre")}
                {/* Nama instrumennya, bukan kode batch: itu yang dikenali petugas
                    di depan mesin. Kodenya hanya cadangan bila batch tanpa rincian. */}
                <span className="font-semibold text-gray-900">
                  {confirmTarget.items?.length
                    ? confirmTarget.items.map((it) => tn(it.name)).join(", ")
                    : confirmTarget.code_transaction ?? confirmTarget.code}
                </span>
                {t("prodClean.completeDescPost")}
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
        title={t("prodClean.cancelTitle")}
        confirmLabel={t("prodClean.cancelConfirm")}
        loadingLabel={t("prodClean.canceling")}
        cancelLabel={t("common.back")}
        description={
          cancelTarget
            ? t("prodClean.cancelDesc", {
                code: cancelTarget.code_transaction ?? cancelTarget.code,
              })
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
function groupUnits(
  units: CleaningUnit[],
  tn: (t: string | null | undefined) => string,
  fallback: string,
): UnitGroup[] {
  const groups: UnitGroup[] = []
  const index = new Map<string, UnitGroup>()

  for (const u of units) {
    const isPaket = u.source === "paket"
    const name = tn(isPaket ? u.package_name : u.name) || fallback
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
      const itemName = tn(u.name) || fallback
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
// `name` sengaja dibiarkan APA ADANYA (bahasa database) karena dipakai sebagai kunci
// pencarian foto; terjemahannya dilakukan saat render.
function paketBreakdown(order: CleaningOrder, packageName: string, fallback: string) {
  const map = new Map<string, { name: string; qty: number }>()
  for (const u of order.units ?? []) {
    if (u.source !== "paket" || u.package_name !== packageName) continue
    const name = u.name ?? fallback
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
  const { t, tn, lang } = useLanguage()
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

  const failed = order.washing?.status === "gagal"
  // Lencana status: ikon + warna mengikuti keadaan batch.
  const status = washed
    ? { Ikon: CheckCircle2, label: t("prodClean.badgeWashComplete"), cls: "bg-emerald-50 text-emerald-700" }
    : canceled
      ? { Ikon: XCircle, label: t("prodClean.badgeCanceled"), cls: "bg-gray-100 text-gray-600" }
      : failed
        ? { Ikon: XCircle, label: t("prodClean.badgeWashFailed"), cls: "bg-red-50 text-red-600" }
        : inProcess
          ? { Ikon: Droplet, label: t("prodClean.badgeInProcess"), cls: "bg-[#4ba69d]/15 text-[#2f7f77]" }
          : { Ikon: Clock, label: t("prodClean.badgeNotProcessed"), cls: "bg-amber-50 text-amber-700" }

  // Empat parameter pencucian di sisi kanan kartu. Baru muncul setelah parameternya
  // diisi — batch yang belum diproses tidak punya apa pun untuk ditampilkan di sana.
  const w = order.washing
  const stats = isWashingFilled(order)
    ? [
        {
          Ikon: Thermometer,
          cls: "bg-red-50 text-red-500",
          label: t("prodClean.statTemp"),
          value: w?.temperature ? `${w.temperature}°C` : null,
        },
        {
          Ikon: Clock,
          cls: "bg-blue-50 text-blue-600",
          label: t("prodClean.statDuration"),
          value: w?.duration_minutes != null ? `${w.duration_minutes} ${t("prodSter.minSuffix")}` : null,
        },
        // Batch selesai: lama pencucian (mulai → selesai). Selagi masih dicuci belum
        // ada waktu selesainya, jadi yang ditampilkan waktu mulainya.
        washed
          ? {
              Ikon: Droplet,
              cls: "bg-sky-50 text-sky-500",
              label: t("prodClean.elapsed"),
              value: lamaCuci(w?.washed_at ?? null, w?.completed_at ?? null, t),
            }
          : {
              Ikon: Droplet,
              cls: "bg-sky-50 text-sky-500",
              label: t("prodClean.statWashStart"),
              value: formatStamp(w?.washed_at ?? null, lang),
            },
        {
          Ikon: FlaskConical,
          cls: "bg-violet-50 text-violet-600",
          label: t("prodClean.statDetergent"),
          value: w?.detergent_type || null,
        },
      ]
    : []

  // Menu titik-tiga hanya berisi Hapus, dan hanya untuk batch yang belum diproses:
  // menghapusnya membatalkan batch itu dan mengembalikan stoknya ke semula. Batch
  // lain tidak punya isi menu, jadi titik-tiganya tidak dirender sama sekali.
  const bisaHapus = !washed && !canceled && !inProcess && stage === "cleaning"
  const menu: RowActionItem[] = bisaHapus
    ? [
        {
          label: t("common.delete"),
          icon: <Trash2 className="h-3.5 w-3.5" />,
          tone: "danger",
          onClick: onCancel,
        },
      ]
    : []

  // Aksi utama. Proses (belum diproses) sejajar dengan instrumennya; Selesaikan
  // (sedang diproses) turun ke baris mesin di kaki kartu.
  const bisaProses = !washed && !canceled && !inProcess

  const adaRincian =
    !compact && (!!order.washing?.washer_machine?.name || !!openPaket || !!order.note)
  const adaKaki = adaRincian || (!canceled && washed) || inProcess

  return (
    <div
      onClick={onOpen}
      className={
        "cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md" +
        // Batch yang belum diproses ditandai garis merah tebal di kiri supaya
        // langsung terlihat di antara yang sedang berjalan.
        (!washed && !canceled && !inProcess ? " border-l-4 border-l-red-600" : "")
      }
    >
      {/* Baris 1: status | kode produksi | tanggal produksi — titik-tiga di kanan. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${status.cls}`}
          >
            <status.Ikon className="h-4 w-4 shrink-0" />
            {status.label}
          </span>
          {!washed && !canceled && order.washing?.alert && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("prodClean.badgeCheckParams")}
            </span>
          )}
          <span className="hidden h-5 w-px bg-gray-200 sm:block" aria-hidden />
          <span className="rounded-lg bg-[#075489]/10 px-2.5 py-1 text-xs font-semibold text-[#075489]">
            {order.code_transaction ?? order.code}
          </span>
          {order.processed_at && (
            <>
              <span className="hidden h-5 w-px bg-gray-200 sm:block" aria-hidden />
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                {formatDate(order.processed_at, lang)}
              </span>
            </>
          )}
        </div>

        {/* Klik di menu tidak boleh ikut membuka kartunya. Menunya dirender lewat
            portal, tapi kliknya tetap merambat lewat pohon React sampai ke sini. */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu items={menu} />
        </div>
      </div>

      {/* Baris 2: foto + nama + jumlah di kiri; parameter pencucian & tombol
          aksi utama di kanan, sejajar dengan instrumennya. */}
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Paket bisa diklik utk lihat isi. Pada kartu ringkas (History) tidak bisa,
            karena rincian isinya disembunyikan. */}
        {order.items?.length ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
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
                  title={isPaket ? t("prodClean.viewSetContents") : `${tn(it.name)} ×${it.quantity}`}
                  className={
                    "inline-flex min-w-0 items-center gap-3 rounded-lg " +
                    (isPaket ? "cursor-pointer pr-1.5 hover:bg-gray-50" : "")
                  }
                >
                  {imageByName[it.name] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageByName[it.name]}
                      alt={tn(it.name)}
                      className="h-11 w-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#075489]/8">
                      <Stethoscope className="h-5 w-5 text-[#075489]" />
                    </span>
                  )}
                  <span className="max-w-[220px] truncate text-sm font-bold text-gray-900">
                    {tn(it.name)}
                  </span>
                  <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    ×{it.quantity}
                  </span>
                  {isPaket && (
                    <ChevronDown
                      className={
                        "h-4 w-4 shrink-0 text-gray-400 transition-transform " + (open ? "rotate-180" : "")
                      }
                    />
                  )}
                </span>
              )
            })}
            {order.items.length > 4 && (
              <span className="rounded-md bg-[#075489]/8 px-2 py-0.5 text-xs font-medium text-[#075489]">
                {t("common.andMore", { n: order.items.length - 4 })}
              </span>
            )}
          </div>
        ) : (
          <p className="truncate text-sm font-bold text-gray-900">{tn(order.borrowed_by) || "—"}</p>
        )}

        {(stats.length > 0 || bisaProses) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:shrink-0 lg:justify-end">
          {stats.length > 0 && (
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:shrink-0 lg:justify-end lg:divide-x lg:divide-gray-200">
              {stats.map((st) => (
                <div key={st.label} className="flex items-center gap-2.5 lg:pl-5 lg:first:pl-0">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${st.cls}`}>
                    <st.Ikon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs text-gray-500">{st.label}</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {st.value ?? <span className="text-xs text-gray-400">—</span>}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

            {bisaProses && (
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onOpen}
                  className="border-[#075489] text-[#075489] hover:bg-[#075489]/10"
                >
                  {t("prodClean.process")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {adaKaki && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2.5">
          {/* Mesin cuci yang dipakai — waktu mulainya sudah ada di statistik di atas.
              Tombol Selesaikan sejajar di ujung kanan baris ini. */}
          {((!compact && order.washing?.washer_machine?.name) || inProcess) && (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-xs text-gray-500">
                {!compact && order.washing?.washer_machine?.name && (
                  <>
                    {t("prodClean.processedByMachine")}{" "}
                    <span className="font-medium text-gray-700">{order.washing.washer_machine.name}</span>
                  </>
                )}
              </p>
              {inProcess && (
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onComplete}
                    disabled={completing}
                    className="bg-[#075489] text-white hover:bg-[#075489]/90"
                  >
                    {completing ? t("production.processing") : t("prodClean.complete")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Rincian isi paket yang dipilih. */}
          {!compact && openPaket && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="cursor-default rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
            >
              <p className="mb-1 text-[11px] font-semibold text-gray-500">
                {t("prodClean.paketContents", { name: tn(openPaket) })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {paketBreakdown(order, openPaket, t("common.instrument")).map((p) => (
                  <span
                    key={p.name}
                    className="inline-flex items-center gap-1.5 rounded-md bg-white py-1 pl-1 pr-2 text-[11px] text-gray-600 ring-1 ring-gray-200"
                  >
                    {imageByName[p.name] ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setZoom({ url: imageByName[p.name], name: tn(p.name) })
                        }}
                        title={t("prodSter.clickToEnlarge")}
                        className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageByName[p.name]}
                          alt={tn(p.name)}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                          <ZoomIn className="h-3 w-3" />
                        </span>
                      </button>
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#075489]/8">
                        <Stethoscope className="h-3.5 w-3.5 text-[#075489]" />
                      </span>
                    )}
                    <span className="font-medium text-gray-800">{tn(p.name)}</span>
                    <span className="text-gray-400">×{p.qty}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Catatan (opsional) dari tahap Mulai Produksi. */}
          {!compact && order.note && (
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">{t("prodClean.noteLabel")}</span> {order.note}
            </p>
          )}

          {!canceled && washed && (
            <p className="text-xs text-gray-500">
              {t("prodClean.washCompletedAt")} {formatDateTime(order.washing?.completed_at ?? null, lang)}
              {order.washing?.completed_by && (
                <>
                  {" "}
                  {t("prodClean.washCompletedBy")}{" "}
                  <span className="font-medium text-gray-700">{order.washing.completed_by}</span>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* Zoom foto instrumen isi set — overlay layar penuh */}
      {zoom && (
        <div
          className="fixed inset-0 z-[60] flex cursor-default items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            e.stopPropagation()
            setZoom(null)
          }}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setZoom(null)
            }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            title={t("common.close")}
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
  const { t, tn } = useLanguage()
  const [open, setOpen] = useState(defaultOpen)
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  const hasUnits = (order.units?.length ?? 0) > 0

  // Kelompokkan unit fisik jadi baris daftar. Unit `satuan` dikelompokkan per nama
  // instrumen; unit `paket` per NAMA PAKET, dengan rincian instrumen penyusunnya.
  // Semua nama/kode/foto dibaca dari snapshot production_item (u.name, u.code,
  // u.image_url), bukan relasi ke master, agar daftar batch lama tidak ikut berubah
  // saat master diubah.
  const grouped = hasUnits ? groupUnits(order.units, tn, t("common.instrument")) : []

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
            {t("prodClean.instrumentList")}
          </span>
          <ChevronDown
            className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")}
          />
        </button>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <ListChecks className="h-4 w-4" />
          {t("prodClean.instrumentList")}
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
                      title={t("prodSter.clickToEnlarge")}
                      className="group relative h-8 w-8 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.image} alt={g.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                        <ZoomIn className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ) : (
                    <Stethoscope className="h-4 w-4 shrink-0 text-[#075489]" />
                  )}
                  <span className="truncate text-sm font-medium text-gray-800">{g.name}</span>
                  {g.kind === "paket" && <Badge variant="info">{t("common.package")}</Badge>}
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
                {tn(it.name)}
                {it.type === "paket" && <Badge variant="info">{t("common.package")}</Badge>}
              </span>
              <span className="text-xs text-gray-400">
                {it.quantity} {t("common.unit")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400">
          {t("prodClean.noInstrumentDetails")}
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
            title={t("common.close")}
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

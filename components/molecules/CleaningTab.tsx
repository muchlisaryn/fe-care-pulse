"use client"

import { useState } from "react"
import { Droplets, ChevronRight, Package, CheckCircle2 } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Label } from "@/components/atoms/Label"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"
import { useAppSelector } from "@/lib/store/hooks"
import type { CleaningOrder } from "@/lib/store/slices/cleaningSlice"

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
    (w.machine_no || w.operator || w.temperature || w.washed_at || w.detergent_type)
  )
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
  // Order yang sedang ditandai "Selesai" (pindah ke packaging) dari tombol kartu.
  const [completingId, setCompletingId] = useState<number | null>(null)
  // Konfirmasi penyelesaian cleaning: order target + waktu selesai (datetime-local).
  const [confirmTarget, setConfirmTarget] = useState<CleaningOrder | null>(null)
  const [completedAt, setCompletedAt] = useState("")
  const [confirmError, setConfirmError] = useState<string | null>(null)

  function openWashing(order: CleaningOrder) {
    setActive(order)
    setError(null)
    const w = order.washing
    setMachineNo(w?.machine_no ?? "")
    // Auto-isi dengan operator tersimpan; bila kosong pakai user yang login.
    setOperator(w?.operator || currentUser)
    setTemperature(w?.temperature ?? "")
    setWashedAt(toLocalInput(w?.washed_at ?? null))
    setDetergent(w?.detergent_type ?? "")
  }

  // Simpan catatan pencucian (tanpa menyelesaikan).
  async function saveWashing() {
    if (!active || saving) return
    setSaving(true)
    setError(null)
    try {
      await api.put(`/master/cleaning/${active.id}/washing`, {
        machine_no: machineNo.trim() || null,
        operator: operator.trim() || null,
        temperature: temperature.trim() || null,
        washed_at: washedAt ? new Date(washedAt).toISOString() : null,
        detergent_type: detergent.trim() || null,
      })
      setActive(null)
      onChanged()
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? "Gagal menyimpan catatan pencucian.")
    } finally {
      setSaving(false)
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
                  className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
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
              <Detail label="Ruangan" value={active.room?.name} />
              <Detail label="Diproses" value={formatDateTime(active.processed_at)} />
              <Detail
                label="Jumlah"
                value={`${active.requested_qty} unit · ${active.request_lines} jenis`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wash-machine">Nomor Mesin</Label>
                <Input
                  id="wash-machine"
                  value={machineNo}
                  onChange={(e) => setMachineNo(e.target.value)}
                  placeholder="mis. WD-01"
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
                <Label htmlFor="wash-time">Waktu</Label>
                <Input
                  id="wash-time"
                  type="datetime-local"
                  value={washedAt}
                  onChange={(e) => setWashedAt(e.target.value)}
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
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4ba69d]/10">
                <CheckCircle2 className="h-5 w-5 text-[#4ba69d]" />
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

// Warna garis kiri kartu per tahap (konsisten dengan tracking status order):
// - Cleaning  = kuning; muda saat belum terproses, tua saat sudah terproses.
// - Packaging = ungu.
function stageBorder(stage: "cleaning" | "packaging", processed: boolean): string {
  if (stage === "packaging") {
    return processed ? "border-l-violet-500" : "border-l-violet-300"
  }
  return processed ? "border-l-yellow-500" : "border-l-yellow-300"
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
  // "Terproses" untuk warna garis: cleaning → catatan terisi; packaging → sudah selesai cuci.
  const processed = stage === "packaging" ? washed : inProcess
  return (
    <div
      className={
        "rounded-lg border border-gray-200 border-l-4 " + stageBorder(stage, processed)
      }
    >
      <div className="flex items-start gap-1 px-1">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start justify-between gap-2 px-2 py-2.5 text-left"
        >
          <div className="flex min-w-0 items-start gap-2">
            <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-[#4ba69d]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {order.borrowed_by ?? "—"}
                </span>
                <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                  {order.code_transaction ?? order.code}
                </span>
                {washed && <Badge variant="success">Selesai Cuci</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                <span>Ruangan: {order.room?.name ?? "—"}</span>
                <span>Diproses: {formatDateTime(order.processed_at)}</span>
                {order.washing?.machine_no && <span>Mesin: {order.washing.machine_no}</span>}
              </div>
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
                className="rounded-md border border-[#4ba69d] bg-[#4ba69d] px-2 py-1 text-xs font-medium text-white hover:bg-[#4ba69d]/90 disabled:opacity-60"
              >
                {completing ? "Memproses..." : "Selesai"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpen}
                className="rounded-md border border-[#4ba69d] px-2 py-1 text-xs font-medium text-[#4ba69d] hover:bg-[#4ba69d]/10"
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

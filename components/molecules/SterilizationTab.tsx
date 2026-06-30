"use client"

import { useState } from "react"
import { ShieldCheck, FlaskConical, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"
import type { SterilizeOrder } from "@/lib/store/slices/sterilizePipelineSlice"

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
function nowLocalInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function errMsg(e: unknown): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? "Terjadi kesalahan."
}

// Masa simpan steril default (hari) — selaras dengan backend (Sterilization::STERILE_SHELF_LIFE_DAYS).
const STERILE_SHELF_LIFE_DAYS = 7

// "YYYY-MM-DD" dari tgl sterilisasi + masa simpan default, untuk pra-isi kedaluwarsa.
function defaultExpiry(sterilizedAt: string | null | undefined): string {
  const base = sterilizedAt ? new Date(sterilizedAt) : new Date()
  if (Number.isNaN(base.getTime())) return ""
  base.setDate(base.getDate() + STERILE_SHELF_LIFE_DAYS)
  base.setMinutes(base.getMinutes() - base.getTimezoneOffset())
  return base.toISOString().slice(0, 10)
}

const METHOD_OPTIONS = [
  { value: "uap", label: "Uap (Steam / Autoclave)" },
  { value: "eo", label: "Ethylene Oxide (EO)" },
  { value: "plasma", label: "Plasma H2O2" },
  { value: "panas_kering", label: "Panas Kering" },
]

// Preset suhu (°C) & durasi (menit) standar per metode sterilisasi — terisi
// otomatis saat metode dipilih. Operator tetap bisa mengubah manual.
const METHOD_DEFAULTS: Record<string, { temperature: string; duration_minutes: string }> = {
  uap: { temperature: "134", duration_minutes: "30" },
  eo: { temperature: "55", duration_minutes: "180" },
  plasma: { temperature: "50", duration_minutes: "47" },
  panas_kering: { temperature: "170", duration_minutes: "60" },
}

const emptyForm = {
  machine: "",
  method: "uap",
  cycle_number: "",
  temperature: "",
  duration_minutes: "",
  sterilized_at: "",
  expiry_date: "",
  note: "",
}

/**
 * Tab "Sterilization": order yang sudah selesai packaging (siap disterilkan).
 * Tiap order bisa langsung dibuatkan batch sterilisasi dari sini — seluruh unit
 * fisik order masuk batch, order berpindah ke status "sterilisasi".
 */
export function SterilizationTab({
  items,
  onChanged,
}: {
  items: SterilizeOrder[]
  onChanged: () => void
}) {
  const [active, setActive] = useState<SterilizeOrder | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ batch: string; order: string } | null>(null)
  // Validasi hasil sterilisasi (untuk order status "sterilisasi").
  const [validating, setValidating] = useState<SterilizeOrder | null>(null)
  const [vForm, setVForm] = useState({
    chemical_indicator: "",
    biological_indicator: "",
    expiry_date: "",
    note: "",
  })
  const [vSaving, setVSaving] = useState<"selesai" | "gagal" | null>(null)
  const [vError, setVError] = useState<string | null>(null)

  function openBatch(order: SterilizeOrder) {
    setActive(order)
    setError(null)
    // Pra-isi suhu & durasi sesuai preset metode default (emptyForm.method).
    const preset = METHOD_DEFAULTS[emptyForm.method]
    setForm({
      ...emptyForm,
      sterilized_at: nowLocalInput(),
      temperature: preset?.temperature ?? "",
      duration_minutes: preset?.duration_minutes ?? "",
    })
  }

  // Ganti metode → muat preset suhu & durasi standar metode tersebut.
  function changeMethod(method: string) {
    const preset = METHOD_DEFAULTS[method]
    setForm((f) => ({
      ...f,
      method,
      temperature: preset?.temperature ?? f.temperature,
      duration_minutes: preset?.duration_minutes ?? f.duration_minutes,
    }))
  }

  async function createBatch() {
    if (!active || saving) return
    if (!form.machine.trim()) {
      setError("Nama / nomor mesin sterilisator wajib diisi.")
      return
    }
    if (!form.sterilized_at) {
      setError("Waktu sterilisasi wajib diisi.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v))
      const res = await api.post(`/master/orders/${active.id}/sterilize`, {
        machine: form.machine.trim(),
        method: form.method,
        cycle_number: form.cycle_number.trim() || null,
        temperature: num(form.temperature),
        duration_minutes: num(form.duration_minutes),
        sterilized_at: new Date(form.sterilized_at).toISOString(),
        expiry_date: form.expiry_date || null,
        note: form.note.trim() || null,
      })
      const batch = res.data?.data?.sterilization?.code ?? "—"
      setDone({ batch, order: active.code_transaction ?? active.code })
      setActive(null)
      onChanged()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  function openValidate(order: SterilizeOrder) {
    setValidating(order)
    setVError(null)
    const b = order.sterilization
    setVForm({
      chemical_indicator: b?.chemical_indicator ?? "",
      biological_indicator: b?.biological_indicator ?? "",
      // Pra-isi kedaluwarsa = tgl sterilisasi + masa simpan default (bisa diubah).
      expiry_date: b?.expiry_date ?? defaultExpiry(b?.sterilized_at),
      note: "",
    })
  }

  // Validasi: result=selesai (Steril) atau gagal (Gagal Steril / Wajib Re-proses).
  async function submitValidate(result: "selesai" | "gagal") {
    if (!validating || vSaving) return
    setVSaving(result)
    setVError(null)
    try {
      await api.post(`/master/orders/${validating.id}/sterilize/validate`, {
        result,
        chemical_indicator: vForm.chemical_indicator.trim() || null,
        biological_indicator: vForm.biological_indicator.trim() || null,
        expiry_date: vForm.expiry_date || null,
        note: vForm.note.trim() || null,
      })
      setValidating(null)
      onChanged()
    } catch (e) {
      setVError(errMsg(e))
    } finally {
      setVSaving(null)
    }
  }

  return (
    <>
      <div className="space-y-2">
        {items.map((order) => {
          const inBatch = order.status === "sterilisasi"
          return (
              <div
                key={order.id}
                className={
                  "rounded-lg border border-gray-200 border-l-4 " +
                  (inBatch ? "border-l-amber-400" : "border-l-sky-400")
                }
              >
                <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <ShieldCheck
                      className={"mt-0.5 h-4 w-4 shrink-0 " + (inBatch ? "text-amber-500" : "text-sky-500")}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {order.borrowed_by ?? "—"}
                        </span>
                        <span className="font-mono text-xs font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                          {order.code_transaction ?? order.code}
                        </span>
                        {inBatch ? (
                          <Badge variant="warning">Menunggu Validasi</Badge>
                        ) : (
                          <Badge variant="info">Siap Disterilkan</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                        <span>Ruangan: {order.room?.name ?? "—"}</span>
                        <span>Selesai packaging: {formatDateTime(order.processed_at)}</span>
                        <span>{order.unit_count} unit</span>
                        {inBatch && order.sterilization && (
                          <span>
                            Batch:{" "}
                            <span className="font-mono font-semibold text-amber-700">
                              {order.sterilization.code}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {inBatch ? (
                    <button
                      type="button"
                      onClick={() => openValidate(order)}
                      className="shrink-0 self-center rounded-md border border-amber-500 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                    >
                      Validasi Hasil
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openBatch(order)}
                      className="shrink-0 self-center rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
                    >
                      Buat Batch Sterilisasi
                    </button>
                  )}
                </div>
              </div>
          )
        })}
      </div>

      {/* Modal buat batch sterilisasi dari order */}
      <Modal
        open={active !== null}
        onClose={saving ? () => {} : () => setActive(null)}
        title={active ? `Sterilisasi — ${active.code_transaction ?? active.code}` : "Sterilisasi"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <span className="text-xs text-gray-400">
                Seluruh unit order masuk batch & order berpindah ke tahap Sterilisasi.
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setActive(null)} disabled={saving}>
                Batal
              </Button>
              <Button
                onClick={createBatch}
                disabled={saving}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {saving ? "Membuat..." : "Buat Batch"}
              </Button>
            </div>
          </div>
        }
      >
        {active && (
          <div className="space-y-5">
            {/* Unit yang akan disterilkan */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Unit Disterilkan ({active.unit_count})
              </p>
              {active.units.length === 0 ? (
                <p className="text-sm text-gray-400">Tidak ada unit.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {active.units.map((u) => (
                    <span
                      key={u.id}
                      className="font-mono text-[11px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded"
                      title={u.instrument ?? undefined}
                    >
                      {u.code ?? `#${u.id}`}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="str-machine">Mesin Sterilisator *</Label>
                <Input
                  id="str-machine"
                  value={form.machine}
                  onChange={(e) => setForm((f) => ({ ...f, machine: e.target.value }))}
                  placeholder="mis. Autoclave-01"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="str-method">Metode</Label>
                <Select
                  id="str-method"
                  value={form.method}
                  onChange={(e) => changeMethod(e.target.value)}
                >
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="str-cycle">Nomor Siklus</Label>
                <Input
                  id="str-cycle"
                  value={form.cycle_number}
                  onChange={(e) => setForm((f) => ({ ...f, cycle_number: e.target.value }))}
                  placeholder="mis. C-12"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="str-temp">Suhu (°C)</Label>
                  <Input
                    id="str-temp"
                    type="number"
                    step="0.01"
                    value={form.temperature}
                    onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))}
                    placeholder="mis. 134"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="str-dur">Durasi (mnt)</Label>
                  <Input
                    id="str-dur"
                    type="number"
                    min={0}
                    value={form.duration_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                    placeholder="mis. 30"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="str-at">Waktu Sterilisasi *</Label>
                <Input
                  id="str-at"
                  type="datetime-local"
                  value={form.sterilized_at}
                  onChange={(e) => setForm((f) => ({ ...f, sterilized_at: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="str-exp">Tanggal Kedaluwarsa Steril</Label>
                <Input
                  id="str-exp"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="str-note">Catatan</Label>
              <Textarea
                id="str-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Opsional"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal validasi hasil sterilisasi (karantina → Steril / Gagal) */}
      <Modal
        open={validating !== null}
        onClose={vSaving ? () => {} : () => setValidating(null)}
        title={
          validating
            ? `Validasi Sterilisasi — ${validating.sterilization?.code ?? validating.code}`
            : "Validasi Sterilisasi"
        }
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {vError ? (
              <p className="text-sm text-red-600">{vError}</p>
            ) : (
              <span className="text-xs text-gray-400">
                Steril → alat siap rilis. Gagal → order kembali ke antrean siap-steril.
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={() => setValidating(null)}
                disabled={vSaving !== null}
              >
                Batal
              </Button>
              <Button
                onClick={() => submitValidate("gagal")}
                disabled={vSaving !== null}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {vSaving === "gagal" ? "Memproses..." : "Tandai Gagal"}
              </Button>
              <Button
                onClick={() => submitValidate("selesai")}
                disabled={vSaving !== null}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {vSaving === "selesai" ? "Memproses..." : "Tandai Steril"}
              </Button>
            </div>
          </div>
        }
      >
        {validating && (
          <div className="space-y-5">
            {/* Ringkasan batch */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm sm:grid-cols-3">
              <Info label="Mesin" value={validating.sterilization?.machine} />
              <Info label="Metode" value={validating.sterilization?.method} />
              <Info label="No. Siklus" value={validating.sterilization?.cycle_number} />
              <Info
                label="Suhu"
                value={
                  validating.sterilization?.temperature
                    ? `${Number(validating.sterilization.temperature)}°C`
                    : null
                }
              />
              <Info
                label="Durasi"
                value={
                  validating.sterilization?.duration_minutes != null
                    ? `${validating.sterilization.duration_minutes} mnt`
                    : null
                }
              />
              <Info label="Waktu" value={formatDateTime(validating.sterilization?.sterilized_at ?? null)} />
            </div>

            {/* Karantina: input/koreksi indikator + kedaluwarsa */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700">
                Kontrol kualitas (karantina): isi hasil indikator sebelum memvalidasi.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="v-chem">Indikator Kimia</Label>
                <Select
                  id="v-chem"
                  value={vForm.chemical_indicator}
                  onChange={(e) => setVForm((f) => ({ ...f, chemical_indicator: e.target.value }))}
                >
                  <option value="">— Pilih —</option>
                  <option value="Berhasil">Berhasil</option>
                  <option value="Tidak Berhasil">Tidak Berhasil</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-bio">Indikator Biologis</Label>
                <Select
                  id="v-bio"
                  value={vForm.biological_indicator}
                  onChange={(e) => setVForm((f) => ({ ...f, biological_indicator: e.target.value }))}
                >
                  <option value="">— Pilih —</option>
                  <option value="Negatif">Negatif</option>
                  <option value="Positif">Positif</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-exp">Tanggal Kedaluwarsa Steril</Label>
                <Input
                  id="v-exp"
                  type="date"
                  value={vForm.expiry_date}
                  onChange={(e) => setVForm((f) => ({ ...f, expiry_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-note">Catatan</Label>
                <Input
                  id="v-note"
                  value={vForm.note}
                  onChange={(e) => setVForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Opsional"
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal hasil — batch dibuat */}
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
            <div>
              <p className="text-base font-semibold text-gray-900">Batch sterilisasi dibuat</p>
              <p className="mt-1 text-sm text-gray-500">
                Order <span className="font-mono font-semibold">{done.order}</span> sedang
                disterilkan. Setelah selesai, klik <b>Validasi Hasil</b> pada kartunya untuk menandai
                Steril / Gagal.
              </p>
            </div>
            <div className="mt-1 inline-flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-1.5">
              <FlaskConical className="h-4 w-4 text-sky-500" />
              <span className="font-mono text-sm font-semibold text-sky-700">{done.batch}</span>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {value ? (
        <p className="text-sm text-gray-800">{value}</p>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      )}
    </div>
  )
}

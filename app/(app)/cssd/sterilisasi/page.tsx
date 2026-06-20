"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Package, Plus, Trash2, Send, X } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchSterilizations,
  invalidateSterilizations,
  setSterilizationSearch,
  STERILIZATION_METHODS,
  type Sterilization,
  type SterilizationMethod,
  type SterilizationStatus,
} from "@/lib/store/slices/sterilizationSlice"
import api from "@/lib/axios"

// Unit instrumen yang tersedia untuk masuk batch sterilisasi (status `tersedia`).
type AvailableStock = {
  id: number
  code: string
  instrument?: { id: number; code: string; name: string } | null
}

type FormItem = {
  instrument_stock_id: number
  code: string
  instrumentName: string
}

const methodLabel: Record<SterilizationMethod, string> = {
  uap: "Uap (Steam/Autoclave)",
  eo: "Ethylene Oxide (EO)",
  plasma: "Plasma H₂O₂",
  panas_kering: "Panas Kering",
}

const statusLabel: Record<SterilizationStatus, string> = {
  diproses: "Diproses",
  selesai: "Selesai",
  gagal: "Gagal",
}

const statusVariant: Record<SterilizationStatus, "info" | "success" | "danger"> = {
  diproses: "info",
  selesai: "success",
  gagal: "danger",
}

// Aksi status berikutnya: diproses → selesai / gagal.
const nextActions: Record<SterilizationStatus, { label: string; to: SterilizationStatus; variant: "primary" | "danger" }[]> = {
  diproses: [
    { label: "Tandai Selesai", to: "selesai", variant: "primary" },
    { label: "Tandai Gagal", to: "gagal", variant: "danger" },
  ],
  selesai: [],
  gagal: [{ label: "Proses Ulang", to: "diproses", variant: "primary" }],
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function nowLocalInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function SterilisasiPage() {
  const dispatch = useAppDispatch()
  const { items: sterilizations, search, loading, loaded, dirty } = useAppSelector((s) => s.sterilizations)

  // Referensi unit tersedia untuk form.
  const [stocks, setStocks] = useState<AvailableStock[]>([])

  // Form header
  const [machine, setMachine] = useState("")
  const [method, setMethod] = useState<SterilizationMethod>("uap")
  const [sterilizedAt, setSterilizedAt] = useState(nowLocalInput())
  const [expiryDate, setExpiryDate] = useState("")
  const [cycleNumber, setCycleNumber] = useState("")
  const [temperature, setTemperature] = useState("")
  const [durationMinutes, setDurationMinutes] = useState("")
  const [operator, setOperator] = useState("")
  const [chemicalIndicator, setChemicalIndicator] = useState("")
  const [biologicalIndicator, setBiologicalIndicator] = useState("")
  const [note, setNote] = useState("")
  const [formItems, setFormItems] = useState<FormItem[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Penambahan unit
  const [newStockId, setNewStockId] = useState("")

  // List + detail
  const [searchInput, setSearchInput] = useState(search)
  const [detail, setDetail] = useState<Sterilization | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  async function loadStocks() {
    const res = await api.get("/master/instrument-stocks", { params: { status: "tersedia" } })
    setStocks(res.data.data.data)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const res = await api.get("/master/instrument-stocks", { params: { status: "tersedia" } })
      if (active) setStocks(res.data.data.data)
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchSterilizations())
  }, [loaded, dirty, dispatch])

  const methodOptions = STERILIZATION_METHODS.map((m) => ({ value: m, label: methodLabel[m] }))
  // Unit yang belum dipilih.
  const stockOptions = stocks
    .filter((s) => !formItems.some((it) => it.instrument_stock_id === s.id))
    .map((s) => ({
      value: String(s.id),
      label: s.instrument?.name ? `${s.code} — ${s.instrument.name}` : s.code,
    }))

  function handleAddStock() {
    if (!newStockId) return
    const stock = stocks.find((s) => String(s.id) === newStockId)
    if (!stock) return
    setFormItems((prev) => [
      ...prev,
      {
        instrument_stock_id: stock.id,
        code: stock.code,
        instrumentName: stock.instrument?.name ?? "—",
      },
    ])
    setNewStockId("")
  }

  function handleRemove(index: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== index))
  }

  function resetForm() {
    setMachine("")
    setMethod("uap")
    setSterilizedAt(nowLocalInput())
    setExpiryDate("")
    setCycleNumber("")
    setTemperature("")
    setDurationMinutes("")
    setOperator("")
    setChemicalIndicator("")
    setBiologicalIndicator("")
    setNote("")
    setFormItems([])
    setFormError(null)
  }

  const canSubmit = machine.trim() && sterilizedAt && formItems.length > 0 && !saving

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    setFormError(null)
    try {
      await api.post("/master/sterilizations", {
        machine: machine.trim(),
        method,
        sterilized_at: sterilizedAt,
        expiry_date: expiryDate || null,
        cycle_number: cycleNumber.trim() || null,
        temperature: temperature !== "" ? Number(temperature) : null,
        duration_minutes: durationMinutes !== "" ? Number(durationMinutes) : null,
        operator: operator.trim() || null,
        chemical_indicator: chemicalIndicator.trim() || null,
        biological_indicator: biologicalIndicator.trim() || null,
        note: note.trim() || null,
        items: formItems.map((it) => ({ instrument_stock_id: it.instrument_stock_id })),
      })
      resetForm()
      dispatch(invalidateSterilizations())
      await loadStocks() // unit yang masuk batch tak lagi "tersedia"
    } catch (e) {
      const res = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
      const firstError = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined
      setFormError(firstError ?? res?.data?.message ?? "Gagal menyimpan batch sterilisasi.")
    } finally {
      setSaving(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setSterilizationSearch(searchInput))
  }

  async function openDetail(d: Sterilization) {
    setDetail(d)
    setDetailLoading(true)
    try {
      const res = await api.get(`/master/sterilizations/${d.id}`)
      setDetail(res.data.data)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleChangeStatus(to: SterilizationStatus) {
    if (!detail || statusBusy) return
    setStatusBusy(true)
    try {
      const res = await api.put(`/master/sterilizations/${detail.id}`, { status: to })
      setDetail(res.data.data)
      dispatch(invalidateSterilizations())
      if (to === "selesai") await loadStocks() // unit kembali tersedia
    } finally {
      setStatusBusy(false)
    }
  }

  const visible = useMemo(() => sterilizations, [sterilizations])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sterilisasi Instrumen"
        subtitle="Kelola batch sterilisasi instrumen CSSD beserta indikator & masa kedaluwarsa steril"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* Kiri: Daftar batch */}
        <Card className="p-0">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="mb-2 text-sm font-semibold text-gray-700">Daftar Batch Sterilisasi</p>
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari kode / mesin..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </form>
          </div>
          <div className="max-h-[640px] divide-y divide-gray-100 overflow-y-auto">
            {loading ? (
              <p className="py-10 text-center text-sm text-gray-400">Memuat data...</p>
            ) : visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">Belum ada batch sterilisasi.</p>
            ) : (
              visible.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDetail(d)}
                  className="block w-full px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-[#075489]">{d.code}</span>
                    <Badge variant={statusVariant[d.status]}>{statusLabel[d.status]}</Badge>
                  </div>
                  <dl className="space-y-0.5 text-xs text-gray-600">
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Mesin</dt>
                      <dd>: {d.machine}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Metode</dt>
                      <dd>: {methodLabel[d.method]}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Steril</dt>
                      <dd>: {formatDateTime(d.sterilized_at)}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Unit</dt>
                      <dd>: {d.items_count ?? d.items?.length ?? 0} unit</dd>
                    </div>
                  </dl>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Kanan: Form batch baru */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Batch Sterilisasi Baru</h2>

          <div className="space-y-5">
            {/* Parameter batch */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  Mesin <span className="text-red-500">*</span>
                </Label>
                <Input value={machine} onChange={(e) => setMachine(e.target.value)} placeholder="mis. Autoclave Getinge 1" />
              </div>
              <div className="space-y-1.5">
                <Label>Metode</Label>
                <SelectSearch options={methodOptions} value={method} onChange={(v) => setMethod(v as SterilizationMethod)} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Waktu Sterilisasi <span className="text-red-500">*</span>
                </Label>
                <Input type="datetime-local" value={sterilizedAt} onChange={(e) => setSterilizedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Kedaluwarsa Steril</Label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>No. Siklus</Label>
                <Input value={cycleNumber} onChange={(e) => setCycleNumber(e.target.value)} placeholder="opsional" />
              </div>
              <div className="space-y-1.5">
                <Label>Operator</Label>
                <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="opsional" />
              </div>
              <div className="space-y-1.5">
                <Label>Suhu (°C)</Label>
                <Input type="number" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="opsional" />
              </div>
              <div className="space-y-1.5">
                <Label>Durasi (menit)</Label>
                <Input type="number" min={0} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="opsional" />
              </div>
              <div className="space-y-1.5">
                <Label>Indikator Kimia</Label>
                <Input value={chemicalIndicator} onChange={(e) => setChemicalIndicator(e.target.value)} placeholder="mis. Pass" />
              </div>
              <div className="space-y-1.5">
                <Label>Indikator Biologi</Label>
                <Input value={biologicalIndicator} onChange={(e) => setBiologicalIndicator(e.target.value)} placeholder="mis. Pass" />
              </div>
            </div>

            {/* Pemilihan unit */}
            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <p className="text-sm font-semibold text-gray-700">Unit Instrumen yang Disterilkan</p>
              </div>
              <div className="space-y-3 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <SelectSearch
                      options={stockOptions}
                      value={newStockId}
                      onChange={setNewStockId}
                      placeholder="-- Pilih unit instrumen (tersedia) --"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddStock}
                    disabled={!newStockId}
                    className="shrink-0 bg-[#4ba69d] text-white hover:bg-[#4ba69d]/90"
                  >
                    <Plus className="h-4 w-4" /> Tambah
                  </Button>
                </div>

                {formItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-6 text-gray-400">
                    <Package className="h-6 w-6" />
                    <p className="text-sm">Belum ada unit dipilih.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                          <th className="px-3 py-2 w-32">Kode Unit</th>
                          <th className="px-3 py-2">Instrumen</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {formItems.map((it, idx) => (
                          <tr key={it.instrument_stock_id}>
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
                                {it.code}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-700">{it.instrumentName}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => handleRemove(idx)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keterangan" />
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{formError}</div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Reset
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-[#075489] text-white hover:bg-[#075489]/90"
              >
                <Send className="h-4 w-4" /> {saving ? "Menyimpan..." : "Proses Sterilisasi"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Detail batch */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Sterilisasi — ${detail.code}` : "Sterilisasi"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex gap-2">
              {detail &&
                nextActions[detail.status].map((a) => (
                  <Button
                    key={a.to}
                    onClick={() => handleChangeStatus(a.to)}
                    disabled={statusBusy || detailLoading}
                    variant={a.variant === "danger" ? "destructive" : undefined}
                    className={a.variant === "primary" ? "bg-[#075489] hover:bg-[#075489]/90 text-white" : undefined}
                  >
                    {statusBusy ? "Memproses..." : a.label}
                  </Button>
                ))}
            </div>
            <Button variant="outline" onClick={() => setDetail(null)}>
              <X className="h-4 w-4" /> Tutup
            </Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat data...</div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Info label="Mesin" value={detail.machine} />
              <Info label="Metode" value={methodLabel[detail.method]} />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p>
                <Badge variant={statusVariant[detail.status]}>{statusLabel[detail.status]}</Badge>
              </div>
              <Info label="Waktu Steril" value={formatDateTime(detail.sterilized_at)} />
              <Info label="Kedaluwarsa" value={formatDate(detail.expiry_date)} />
              <Info label="No. Siklus" value={detail.cycle_number} />
              <Info label="Suhu" value={detail.temperature ? `${detail.temperature} °C` : null} />
              <Info label="Durasi" value={detail.duration_minutes ? `${detail.duration_minutes} menit` : null} />
              <Info label="Operator" value={detail.operator} />
              <Info label="Indikator Kimia" value={detail.chemical_indicator} />
              <Info label="Indikator Biologi" value={detail.biological_indicator} />
              <Info label="Keterangan" value={detail.note} />
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2 w-32">Kode Unit</th>
                    <th className="px-3 py-2">Instrumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {detail.items?.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
                          {it.instrument_stock?.code ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {it.instrument_stock?.instrument?.name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-800">{value ? value : <span className="text-gray-400">—</span>}</p>
    </div>
  )
}

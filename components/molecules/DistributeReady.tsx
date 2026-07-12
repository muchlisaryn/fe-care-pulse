"use client"

import { useCallback, useEffect, useState } from "react"
import { Truck, ClipboardList, UserCheck } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { MultiSelectSearch } from "@/components/atoms/MultiSelectSearch"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"
import type { DistributeOrder } from "@/lib/store/slices/distributeSlice"

/**
 * Satu pilihan barang di gudang: untuk baris `satuan` = satu unit, untuk baris
 * `paket` = satu set paket utuh dari satu batch produksi (`stock_ids` = isi paket).
 */
type DistributeOption = {
  value: string
  production_code: string | null
  name: string | null
  rack_code: string | null
  stock_ids: number[]
  set_index: number | null
}

/** Satu baris permintaan order: butuh N unit (satuan) atau N paket. */
type DistributeRequirement = {
  key: string
  kind: "satuan" | "paket"
  name: string | null
  needed_qty: number
  unit_label: string
  options: DistributeOption[]
  selected: string[]
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

function errMsg(e: unknown): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? "Terjadi kesalahan."
}

/** Label opsi di dropdown: NAMA RAK - NAMA PAKET / INSTRUMEN (KODE PRODUKSI). */
function optionLabel(opt: DistributeOption) {
  const rack = opt.rack_code ?? "Tanpa rak"
  const set = opt.set_index ? ` Set ${opt.set_index}` : ""
  const code = opt.production_code ?? "Tanpa kode produksi"
  return `${rack} - ${opt.name ?? "—"}${set} (${code})`
}

/**
 * Modal dibuka tanpa pilihan apa pun — petugas memilih sendiri barang yang diambil
 * dari rak (alokasi otomatis saat order diterima sengaja tidak dipakai sebagai default
 * agar tidak ada yang terdistribusi tanpa dicek).
 */
function initialPick(): string[] {
  return []
}

/**
 * Grup "Siap Distribusi" pada tab Distribution & Tracking: order yang sudah di
 * gudang steril (digudang) → didistribusikan ke unit pelayanan dengan double
 * verification (scan penerima) + tautan No. RM pasien.
 */
export function DistributeReady({
  items,
  onChanged,
}: {
  items: DistributeOrder[]
  onChanged: () => void
}) {
  const [active, setActive] = useState<DistributeOrder | null>(null)
  const [recipient, setRecipient] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [requirements, setRequirements] = useState<DistributeRequirement[]>([])
  // Pilihan per baris permintaan: key requirement → daftar value opsi yang dipilih.
  const [picked, setPicked] = useState<Record<string, string[]>>({})

  const activeId = active?.id ?? null

  const loadOptions = useCallback(async (orderId: number) => {
    setModalLoading(true)
    setError(null)
    try {
      const res = await api.get(`/master/orders/${orderId}/distribution-options`)
      const reqs: DistributeRequirement[] = res.data.data.requirements
      setRequirements(reqs)
      setPicked(Object.fromEntries(reqs.map((r) => [r.key, initialPick()])))
    } catch (e) {
      setRequirements([])
      setPicked({})
      setError(errMsg(e))
    } finally {
      setModalLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeId === null) return
    loadOptions(activeId)
  }, [activeId, loadOptions])

  if (items.length === 0) return null

  function openDistribute(order: DistributeOrder) {
    setActive(order)
    setError(null)
    setRequirements([])
    setPicked({})
    // Default nama penerima = peminjam order ("Dipinjam Oleh"); tetap bisa diubah.
    setRecipient(order.borrowed_by ?? "")
  }

  function choose(req: DistributeRequirement, values: string[]) {
    setPicked((prev) => ({ ...prev, [req.key]: values.slice(0, req.needed_qty) }))
  }

  const incomplete = requirements.filter(
    (r) => (picked[r.key] ?? []).length !== r.needed_qty,
  )

  // Unit yang benar-benar dikeluarkan = gabungan isi tiap opsi terpilih.
  const selectedStockIds = requirements.flatMap((req) =>
    (picked[req.key] ?? []).flatMap(
      (value) => req.options.find((o) => o.value === value)?.stock_ids ?? [],
    ),
  )

  /**
   * Cek ulang ke gudang tepat sebelum distribusi: barang yang dipilih bisa saja sudah
   * diambil order lain sejak modal dibuka. Bila ada yang hilang, pilihan disegarkan
   * dari data terbaru dan distribusi dibatalkan agar petugas memilih ulang.
   */
  async function stillAvailable(orderId: number): Promise<boolean> {
    const res = await api.get(`/master/orders/${orderId}/distribution-options`)
    const fresh: DistributeRequirement[] = res.data.data.requirements

    const gone = requirements.some((req) => {
      const freshReq = fresh.find((f) => f.key === req.key)
      return (picked[req.key] ?? []).some(
        (value) => !freshReq?.options.some((o) => o.value === value),
      )
    })

    if (gone) {
      setRequirements(fresh)
      setPicked(Object.fromEntries(fresh.map((r) => [r.key, initialPick()])))
      setError("Sebagian barang yang dipilih sudah tidak ada di gudang. Pilihan direset — silakan pilih ulang.")
      return false
    }

    return true
  }

  async function submit() {
    if (!active || saving || modalLoading) return
    if (incomplete.length > 0) {
      setError("Lengkapi pilihan barang sesuai jumlah yang diminta.")
      return
    }
    if (!recipient.trim()) {
      setError("Scan / isi ruangan atau petugas penerima (verifikasi).")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (!(await stillAvailable(active.id))) return

      await api.post(`/master/orders/${active.id}/distribute`, {
        recipient: recipient.trim(),
        stock_ids: selectedStockIds,
      })
      setActive(null)
      onChanged()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Siap Distribusi ({items.length})
      </div>

      {items.map((order) => (
        <div
          key={order.id}
          className="rounded-lg border border-gray-200"
        >
          <div className="flex items-start justify-between gap-2 px-3 py-2.5">
            <div className="flex min-w-0 items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#075489]" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {order.borrowed_by ?? "—"}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/10 px-2 py-0.5 rounded">
                    {order.code_transaction ?? order.code}
                  </span>
                  <Badge variant="info">Di Gudang Steril</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  <span>Ruangan: {order.room?.name ?? "—"}</span>
                  <span>{order.unit_count} unit</span>
                  <span>Kedaluwarsa: {formatDate(order.expiry_date)}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openDistribute(order)}
              className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90"
            >
              Distribusikan
            </button>
          </div>
        </div>
      ))}

      <Modal
        open={active !== null}
        onClose={saving ? () => {} : () => setActive(null)}
        title="Distribusikan"
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? <p className="text-sm text-red-600">{error}</p> : <span />}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setActive(null)} disabled={saving}>
                Batal
              </Button>
              <Button
                onClick={submit}
                disabled={saving || modalLoading || incomplete.length > 0}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {saving ? "Memproses..." : "Distribusikan"}
              </Button>
            </div>
          </div>
        }
      >
        {active && (
          modalLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">Memuat data...</div>
          ) : (
            <div className="space-y-6">
              {/* Identitas order yang sedang didistribusikan. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    No. Invoice
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-[#075489]">
                    {active.code_transaction ?? active.code}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Nama Ruangan
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900">
                    {active.room?.name ?? <span className="text-xs text-gray-400">—</span>}
                  </p>
                </div>
              </div>

              {/* Blok 1 — Pilih barang yang dikeluarkan dari gudang. Baris satuan dipilih
                  per unit, baris paket dipilih per paket utuh, keduanya lewat kode
                  produksinya (label bungkus steril di rak). */}
              <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Pilih Barang dari Gudang
                </p>

                <div className="space-y-3">
                  {requirements.map((req) => {
                    const chosen = picked[req.key] ?? []
                    const complete = chosen.length === req.needed_qty

                    return (
                      <div key={req.key} className="rounded-lg border border-gray-200 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
                          <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            {req.name ?? <span className="text-xs text-gray-400">—</span>}
                            <Badge variant={req.kind === "paket" ? "info" : "default"}>
                              {req.kind === "paket" ? "Paket" : "Satuan"}
                            </Badge>
                          </span>
                          <Badge variant={complete ? "success" : "warning"}>
                            {chosen.length} / {req.needed_qty} {req.unit_label} dipilih
                          </Badge>
                        </div>

                        {req.options.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-gray-400">
                            Tidak ada {req.unit_label} steril di gudang untuk permintaan ini.
                          </p>
                        ) : (
                          <div className="px-4 py-3">
                            {/* Satu kontrol untuk seluruh kebutuhan baris ini: pilih
                                sebanyak `needed_qty` barang sekaligus. */}
                            <MultiSelectSearch
                              value={chosen}
                              onChange={(next) => choose(req, next)}
                              max={req.needed_qty}
                              placeholder={`Pilih ${req.needed_qty} ${req.unit_label}...`}
                              searchPlaceholder="Cari rak / nama / kode produksi..."
                              options={req.options.map((o) => ({
                                value: o.value,
                                label: optionLabel(o),
                              }))}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Blok 2 — Double verification penerima (dipisah tegas dari daftar barang). */}
              <section className="rounded-xl border border-[#075489]/25 bg-[#075489]/[0.04] p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#075489]">
                  <UserCheck className="h-3.5 w-3.5" />
                  Verifikasi Penerima
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="dist-recipient">Nama Penerima (Ruangan/Petugas) *</Label>
                  <Input
                    id="dist-recipient"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Scan / ketik ruangan atau petugas penerima"
                  />
                </div>
              </section>
            </div>
          )
        )}
      </Modal>
    </div>
  )
}

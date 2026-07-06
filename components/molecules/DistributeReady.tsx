"use client"

import { useState } from "react"
import { Truck, MapPin, ClipboardList } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"
import type { DistributeOrder } from "@/lib/store/slices/distributeSlice"

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

  if (items.length === 0) return null

  function openDistribute(order: DistributeOrder) {
    setActive(order)
    setError(null)
    // Default nama penerima = peminjam order ("Dipinjam Oleh"); tetap bisa diubah.
    setRecipient(order.borrowed_by ?? "")
  }

  async function submit() {
    if (!active || saving) return
    if (!recipient.trim()) {
      setError("Scan / isi ruangan atau petugas penerima (verifikasi).")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(`/master/orders/${active.id}/distribute`, {
        recipient: recipient.trim(),
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
        title={active ? `Distribusikan — ${active.code_transaction ?? active.code}` : "Distribusikan"}
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
                disabled={saving}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {saving ? "Memproses..." : "Distribusikan"}
              </Button>
            </div>
          </div>
        }
      >
        {active && (
          <div className="space-y-5">
            {/* Unit + lokasi rak (untuk diambil dari gudang) */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <ClipboardList className="h-3.5 w-3.5" />
                Ambil dari Gudang ({active.unit_count} unit)
              </p>
              <div className="space-y-1">
                {active.units.map((u, idx) => (
                  <div key={`${u.id}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded">
                        {u.code ?? `#${u.id}`}
                      </span>
                      <span className="ml-2 text-gray-700">{u.instrument ?? "—"}</span>
                    </span>
                    {u.rack_code && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3 w-3" />
                        {u.rack_code}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Double verification: penerima */}
            <div className="space-y-1.5">
              <Label htmlFor="dist-recipient">Nama Penerima (Ruangan/Petugas) *</Label>
              <Input
                id="dist-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { Package, Boxes, Loader2, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"
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

function errMsg(e: unknown): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? "Terjadi kesalahan."
}

// Kebutuhan unit per instrumen pada tahap packaging.
type PackagingReq = {
  key: string
  instrument: { id: number; code: string | null; name: string }
  source: "satuan" | "paket"
  package_name: string | null
  needed_qty: number
  generated_qty: number
  generated_units: { id: number; code: string | null }[]
  available_count: number
}
type PackagingData = {
  order: {
    id: number
    code: string
    code_transaction: string | null
    status: string
    borrowed_by: string | null
    room: { id: number; name: string } | null
  }
  requirements: PackagingReq[]
}

/**
 * Konten tab "Inspection & Packaging": daftar order tahap pengemasan. Tiap order
 * bisa diproses → generate unit fisik otomatis dari stok tersedia (parsial bila
 * kurang), bangkitkan nomor batch (code_transaction), lalu lanjut → siap steril.
 */
export function PackagingTab({
  items,
  onChanged,
}: {
  items: CleaningOrder[]
  onChanged: () => void
}) {
  const [active, setActive] = useState<CleaningOrder | null>(null)
  const [data, setData] = useState<PackagingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Fase alur: idle → (Generate) staged → (Simpan) saved → (Lanjut). "staged" =
  // hasil pratinjau yang BELUM disimpan.
  const [phase, setPhase] = useState<"idle" | "staged" | "saved">("idle")
  // Modal hasil akhir "Siap Disterilkan" (setelah Lanjut).
  const [ready, setReady] = useState<{ code: string; batch: string | null } | null>(null)

  async function openPackaging(order: CleaningOrder) {
    setActive(order)
    setData(null)
    setError(null)
    setPhase("idle")
    setLoading(true)
    try {
      const res = await api.get(`/master/orders/${order.id}/packaging`)
      setData(res.data.data)
      // Sudah pernah disimpan bila nomor batch sudah ada.
      setPhase(res.data.data.order.code_transaction ? "saved" : "idle")
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  // Generate = PRATINJAU alokasi unit (belum disimpan). Tidak membuat nomor batch.
  async function handleGenerate() {
    if (!active || generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await api.post(`/master/orders/${active.id}/pack`, { preview: true })
      setData(res.data.data)
      setPhase("staged")
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setGenerating(false)
    }
  }

  // Simpan = commit alokasi + bangkitkan nomor batch.
  async function handleSave() {
    if (!active || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.post(`/master/orders/${active.id}/pack`)
      setData(res.data.data)
      setPhase("saved")
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  // Lanjut: order → selesai (siap disterilkan), tampilkan modal konfirmasi.
  async function handleLanjut() {
    if (!active || completing) return
    setCompleting(true)
    setError(null)
    try {
      await api.post(`/master/orders/${active.id}/packaging-complete`)
      setReady({
        code: active.code,
        batch: data?.order.code_transaction ?? active.code_transaction ?? null,
      })
      setActive(null)
      setData(null)
      onChanged()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setCompleting(false)
    }
  }

  const reqs = data?.requirements ?? []
  const totalNeeded = reqs.reduce((s, r) => s + r.needed_qty, 0)
  const totalGenerated = reqs.reduce((s, r) => s + r.generated_qty, 0)
  const shortage = Math.max(0, totalNeeded - totalGenerated)
  const busy = loading || generating || saving || completing
  // Generate/Generate Ulang: pratinjau alokasi (belum simpan). Nonaktif bila sudah
  // tersimpan & tak ada kekurangan.
  const canGenerate = !busy && (phase !== "saved" || shortage > 0)

  return (
    <>
      <div className="space-y-2">
        {items.map((order) => {
          const packed = !!order.code_transaction
          return (
            <div
              key={order.id}
              className={
                "rounded-lg border border-gray-200 border-l-4 " +
                (packed ? "border-l-violet-500" : "border-l-violet-300")
              }
            >
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="flex min-w-0 items-start gap-2">
                  <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {order.borrowed_by ?? "—"}
                      </span>
                      {order.code_transaction ? (
                        <span className="font-mono text-xs font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
                          {order.code_transaction}
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                          {order.code}
                        </span>
                      )}
                      <Badge variant={packed ? "info" : "warning"}>
                        {packed ? "Sudah Di-generate" : "Belum Di-generate"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      <span>Ruangan: {order.room?.name ?? "—"}</span>
                      <span>Diproses: {formatDateTime(order.processed_at)}</span>
                      <span>
                        {order.requested_qty} unit · {order.request_lines} jenis
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openPackaging(order)}
                  className="shrink-0 self-center rounded-md border border-violet-500 bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600"
                >
                  Proses Packaging
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal proses packaging: generate unit dari stok + nomor batch */}
      <Modal
        open={active !== null}
        onClose={completing ? () => {} : () => setActive(null)}
        title={active ? `Packaging — ${active.code}` : "Packaging"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : phase === "staged" ? (
              <span className="text-xs text-amber-600">
                Pratinjau — klik <b>Simpan</b> untuk menyimpan alokasi.
              </span>
            ) : phase === "saved" ? (
              <span className="text-xs text-gray-400">
                Tersimpan. Klik Lanjut bila siap disterilkan.
              </span>
            ) : (
              <span className="text-xs text-gray-400">
                Klik Generate untuk mengalokasikan unit dari stok.
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setActive(null)} disabled={busy}>
                Batal
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
              >
                {generating ? "Generate..." : phase === "idle" ? "Generate" : "Generate Ulang"}
              </Button>
              {phase === "staged" && (
                <Button
                  onClick={handleSave}
                  disabled={busy}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </Button>
              )}
              <Button
                onClick={handleLanjut}
                disabled={phase !== "saved" || busy}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {completing ? "Memproses..." : "Lanjut"}
              </Button>
            </div>
          </div>
        }
      >
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat data packaging...</div>
        ) : data ? (
          <div className="space-y-4">
            {/* Nomor batch (code_transaction) — dibuat saat Simpan */}
            {data.order.code_transaction ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
                    No. Batch / Kode Transaksi
                  </p>
                  <p className="font-mono text-lg font-bold text-violet-700">
                    {data.order.code_transaction}
                  </p>
                </div>
                {phase === "staged" ? (
                  <Badge variant="warning">Pratinjau</Badge>
                ) : (
                  <Package className="h-8 w-8 text-violet-300" />
                )}
              </div>
            ) : phase === "staged" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Pratinjau alokasi — nomor batch akan dibuat saat klik <b>Simpan</b>.
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                Belum di-generate. Klik Generate untuk pratinjau alokasi unit.
              </div>
            )}

            {/* Ringkasan + peringatan stok kurang */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-600">
                Ter-generate{" "}
                <span className="font-semibold text-gray-900">
                  {totalGenerated}/{totalNeeded}
                </span>{" "}
                unit
              </span>
              {shortage > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Stok kurang {shortage} unit — tetap bisa lanjut
                </span>
              )}
            </div>

            {/* Rincian kebutuhan per instrumen */}
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="py-2.5 px-3 text-left">Instrumen</th>
                    <th className="py-2.5 px-3 text-center w-24">Dibutuhkan</th>
                    <th className="py-2.5 px-3 text-center w-28">Ter-generate</th>
                    <th className="py-2.5 px-3 text-center w-24">Tersedia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reqs.map((r) => {
                    const kurang = r.generated_qty < r.needed_qty
                    return (
                      <tr key={r.key}>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={r.source === "paket" ? "info" : "default"}>
                              {r.source === "paket" ? "Paket" : "Satuan"}
                            </Badge>
                            <span className="font-medium text-gray-800">{r.instrument.name}</span>
                            {r.source === "paket" && r.package_name && (
                              <span className="text-xs text-gray-400">· {r.package_name}</span>
                            )}
                          </div>
                          {/* Kode unit (stock) yang ter-generate */}
                          {(r.generated_units?.length ?? 0) > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.generated_units.map((u) => (
                                <span
                                  key={u.id}
                                  className="font-mono text-[11px] font-semibold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded"
                                >
                                  {u.code ?? `#${u.id}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-700">{r.needed_qty}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={
                              "font-semibold " + (kurang ? "text-amber-600" : "text-green-600")
                            }
                          >
                            {r.generated_qty}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-500">{r.available_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal "Siap Disterilkan" — hasil akhir setelah Lanjut */}
      <Modal
        open={ready !== null}
        onClose={() => setReady(null)}
        title="Siap Disterilkan"
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => setReady(null)}>
              Tutup
            </Button>
            <Link href="/cssd/sterilisasi">
              <Button className="bg-[#075489] hover:bg-[#075489]/90 text-white">
                Ke Sterilisasi
              </Button>
            </Link>
          </div>
        }
      >
        {ready && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">Order siap disterilkan</p>
              <p className="mt-1 text-sm text-gray-500">
                Packaging selesai. Unit dapat dimasukkan ke batch sterilisasi di menu Sterilisasi.
              </p>
            </div>
            {ready.batch && (
              <div className="mt-1 inline-flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-1.5">
                <ShieldCheck className="h-4 w-4 text-violet-500" />
                <span className="font-mono text-sm font-semibold text-violet-700">{ready.batch}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

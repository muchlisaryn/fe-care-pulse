"use client"

import { useState } from "react"
import {
  Package,
  Boxes,
  AlertTriangle,
  CheckCircle2,
  ScanLine,
  Check,
  Circle,
  Printer,
  X,
  ZoomIn,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Barcode } from "@/components/atoms/Barcode"
import { Modal } from "@/components/molecules/Modal"
import { useAppSelector } from "@/lib/store/hooks"
import api from "@/lib/axios"
import type { CleaningOrder } from "@/lib/store/slices/cleaningSlice"

// Satu label sterilisasi per alat instrumen yang dikemas.
type SterilLabelItem = {
  instrumentName: string
  unitCode: string | null
  source: "satuan" | "paket"
  packageName: string | null
}
// Kumpulan label sterilisasi yang dicetak saat packaging selesai — satu label per alat.
type SterilLabel = {
  code: string
  batch: string | null
  packer: string
  items: SterilLabelItem[]
}

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

type PackagingReq = {
  key: string
  instrument: { id: number; code: string | null; name: string; image_url: string | null }
  source: "satuan" | "paket"
  package_name: string | null
  needed_qty: number
  generated_qty: number
  generated_units: { id: number; code: string | null }[]
  available_count: number
  available_units: { id: number; code: string | null }[]
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
 * Tab "Inspection & Packaging": checklist digital komponen set. Petugas memindai
 * barcode tiap unit instrumen untuk mencentangnya satu per satu (verifikasi
 * komponen ada). Setelah lengkap →
 * Selesaikan (bangkitkan nomor batch, order → siap disterilkan).
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
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanCode, setScanCode] = useState("")
  const [scanning, setScanning] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  // instrument_stock_id unit yang sedang dibatalkan centangnya.
  const [unchecking, setUnchecking] = useState<number | null>(null)
  const [scanMsg, setScanMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [ready, setReady] = useState<SterilLabel | null>(null)
  // Foto instrumen yang sedang di-zoom (klik thumbnail) — null = tidak ada.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // ID petugas pengemas = user yang login.
  const packer = useAppSelector((s) => s.auth.name ?? s.auth.username ?? "—")

  async function openPackaging(order: CleaningOrder) {
    setActive(order)
    setData(null)
    setError(null)
    setScanCode("")
    setScanMsg(null)
    setLoading(true)
    try {
      const res = await api.get(`/master/orders/${order.id}/packaging`)
      setData(res.data.data)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }

  // Scan barcode unit → centang komponen set.
  async function handleScan() {
    if (!active || scanning || !scanCode.trim()) return
    setScanning(true)
    setScanMsg(null)
    try {
      const res = await api.post(`/master/orders/${active.id}/pack/scan`, { code: scanCode.trim() })
      setData(res.data.data)
      setScanMsg({ type: "ok", text: res.data.message ?? "Unit tercentang." })
      setScanCode("")
    } catch (e) {
      setScanMsg({ type: "err", text: errMsg(e) })
    } finally {
      setScanning(false)
    }
  }

  // Centang satu unit tersedia berdasarkan KODE-nya (klik kode unit langsung).
  async function handleCheckCode(code: string) {
    if (!active || checking) return
    setChecking(code)
    setScanMsg(null)
    try {
      const res = await api.post(`/master/orders/${active.id}/pack/scan`, { code })
      setData(res.data.data)
      setScanMsg({ type: "ok", text: res.data.message ?? "Unit tercentang." })
    } catch (e) {
      setScanMsg({ type: "err", text: errMsg(e) })
    } finally {
      setChecking(null)
    }
  }

  // Batalkan centang satu unit yang sudah tersimpan (edit/ganti alokasi).
  async function handleUncheck(stockId: number) {
    if (!active || unchecking !== null) return
    setUnchecking(stockId)
    setScanMsg(null)
    try {
      const res = await api.post(`/master/orders/${active.id}/pack/uncheck`, {
        instrument_stock_id: stockId,
      })
      setData(res.data.data)
      setScanMsg({ type: "ok", text: res.data.message ?? "Centang dibatalkan." })
    } catch (e) {
      setScanMsg({ type: "err", text: errMsg(e) })
    } finally {
      setUnchecking(null)
    }
  }

  // Selesaikan packaging → bangkitkan nomor batch & order siap disterilkan.
  async function handleFinish() {
    if (!active || finishing) return
    setFinishing(true)
    setError(null)
    try {
      const res = await api.post(`/master/orders/${active.id}/packaging-complete`)
      const batch = res.data?.data?.code_transaction ?? data?.order.code_transaction ?? active.code_transaction ?? null
      // Satu label per alat instrumen yang dikemas (per unit yang sudah dicentang).
      const labelItems: SterilLabelItem[] = (data?.requirements ?? []).flatMap((r) =>
        r.generated_units.map((u) => ({
          instrumentName: r.instrument.name,
          unitCode: u.code,
          source: r.source,
          packageName: r.package_name,
        })),
      )
      setReady({
        code: active.code,
        batch,
        packer,
        items: labelItems,
      })
      setActive(null)
      setData(null)
      // Catatan: refetch (onChanged) DITUNDA sampai modal label ditutup. Bila
      // refetch di sini & ini order packaging terakhir, tab jadi kosong →
      // PackagingTab unmount → modal "Cetak Label" ikut hilang.
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setFinishing(false)
    }
  }

  // Tutup modal label → baru segarkan daftar (order yang selesai keluar dari tab).
  function closeReady() {
    setReady(null)
    onChanged()
  }

  // Cetak Label Barcode Sterilisasi — SATU label per alat instrumen.
  // Setiap label memuat nama alat, kode unit (barcode Code128), batch & ID pengemas.
  function printLabel() {
    if (!ready || ready.items.length === 0) return
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

    const labels = ready.items
      .map((it, i) => {
        const svg = document.getElementById(`steril-label-barcode-${i}`)
        const barcodeSvg = svg ? new XMLSerializer().serializeToString(svg) : ""
        const unit = it.unitCode ?? "—"
        const pkg = it.source === "paket" && it.packageName ? ` · ${escapeHtml(it.packageName)}` : ""
        return `
          <div class="label">
            <div class="head">LABEL STERILISASI CSSD</div>
            <div class="set">${escapeHtml(it.instrumentName)}</div>
            <div class="sub">${it.source === "paket" ? "Paket" : "Satuan"}${pkg}</div>
            <div class="bc">${barcodeSvg}</div>
            <div class="batch">${escapeHtml(unit)}</div>
            <table>
              <tr><td class="k">Kode Alat</td><td class="v">${escapeHtml(unit)}</td></tr>
              <tr><td class="k">No. Batch</td><td class="v">${escapeHtml(ready.batch ?? "—")}</td></tr>
              <tr><td class="k">ID Petugas Pengemas</td><td class="v">${escapeHtml(ready.packer)}</td></tr>
              <tr><td class="k">Tgl Sterilisasi</td><td class="v">__________</td></tr>
              <tr><td class="k">Tgl Kedaluwarsa</td><td class="v">__________</td></tr>
            </table>
          </div>`
      })
      .join("")

    const w = window.open("", "_blank", "width=460,height=600")
    if (!w) return
    w.document.write(`
      <html>
        <head>
          <title>Label Sterilisasi ${escapeHtml(ready.batch ?? ready.code)}</title>
          <style>
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
            .label { width: 360px; margin: 12px auto; border: 1px solid #000; padding: 12px; page-break-inside: avoid; }
            .head { text-align: center; font-weight: 700; font-size: 13px; letter-spacing: 1px; border-bottom: 1px dashed #999; padding-bottom: 6px; }
            .set { text-align: center; font-size: 16px; font-weight: 700; margin: 8px 0 2px; }
            .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 6px; }
            .bc { text-align: center; margin: 6px 0; }
            .batch { text-align: center; font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: 2px; font-size: 14px; }
            table { width: 100%; font-size: 11px; margin-top: 8px; border-collapse: collapse; }
            td { padding: 2px 0; }
            td.k { color: #555; width: 42%; }
            td.v { font-weight: 600; }
            @media print { @page { margin: 6mm; } .label { margin: 0 auto 8mm; } }
          </style>
        </head>
        <body>
          ${labels}
        </body>
      </html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  const reqs = data?.requirements ?? []
  const totalNeeded = reqs.reduce((s, r) => s + r.needed_qty, 0)
  const totalChecked = reqs.reduce((s, r) => s + r.generated_qty, 0)
  const shortage = Math.max(0, totalNeeded - totalChecked)
  const busy =
    loading || finishing || scanning || checking !== null || unchecking !== null

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
                      <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                        {order.code_transaction ?? order.code}
                      </span>
                      <Badge variant="warning">Perlu Inspeksi</Badge>
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
                  Inspeksi & Kemas
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal checklist inspeksi & packaging */}
      <Modal
        open={active !== null}
        onClose={finishing ? () => {} : () => setActive(null)}
        title={active ? `Inspeksi & Packaging — ${active.code}` : "Inspeksi & Packaging"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <span className="text-xs text-gray-400">
                Centang {totalChecked}/{totalNeeded} komponen
                {shortage > 0 ? ` · kurang ${shortage}` : ""}
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setActive(null)} disabled={busy}>
                Batal
              </Button>
              <Button
                onClick={handleFinish}
                disabled={busy || totalChecked === 0}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {finishing ? "Memproses..." : "Selesaikan"}
              </Button>
            </div>
          </div>
        }
      >
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat checklist...</div>
        ) : data ? (
          <div className="space-y-4">
            {/* Scan barcode unit */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleScan()
                      }
                    }}
                    placeholder="Scan barcode unit instrumen (mis. GNE-002)..."
                    className="pl-9 font-mono"
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleScan}
                  disabled={scanning || !scanCode.trim()}
                  className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
                >
                  {scanning ? "..." : "Centang"}
                </Button>
              </div>
              {scanMsg && (
                <p className={"text-xs " + (scanMsg.type === "ok" ? "text-green-600" : "text-red-600")}>
                  {scanMsg.text}
                </p>
              )}
            </div>

            {/* Progress + nomor batch */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-600">
                Tercentang{" "}
                <span className="font-semibold text-gray-900">
                  {totalChecked}/{totalNeeded}
                </span>{" "}
                komponen
              </span>
              {shortage > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Kurang {shortage} — tetap bisa diselesaikan
                </span>
              )}
              {data.order.code_transaction && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                  <Package className="h-3.5 w-3.5" />
                  {data.order.code_transaction}
                </span>
              )}
            </div>

            {/* Checklist komponen set */}
            <div className="space-y-2">
              {reqs.map((r) => {
                const complete = r.generated_qty >= r.needed_qty
                const emptySlots = Math.max(0, r.needed_qty - r.generated_qty)
                return (
                  <div key={r.key} className="flex gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                    {/* Foto instrumen — klik untuk zoom. Bantu verifikasi komponen fisik. */}
                    {r.instrument.image_url ? (
                      <button
                        type="button"
                        onClick={() => setZoom({ url: r.instrument.image_url as string, name: r.instrument.name })}
                        title="Klik untuk perbesar"
                        className="group relative h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.instrument.image_url}
                          alt={r.instrument.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                          <ZoomIn className="h-4 w-4" />
                        </span>
                      </button>
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-300">
                        <Package className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {complete ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-gray-300" />
                        )}
                        <Badge variant={r.source === "paket" ? "info" : "default"}>
                          {r.source === "paket" ? "Paket" : "Satuan"}
                        </Badge>
                        <span className="font-medium text-gray-800">{r.instrument.name}</span>
                        {r.source === "paket" && r.package_name && (
                          <span className="text-xs text-gray-400">· {r.package_name}</span>
                        )}
                        <span
                          className={
                            "ml-auto text-xs font-semibold " +
                            (complete ? "text-green-600" : "text-amber-600")
                          }
                        >
                          {r.generated_qty}/{r.needed_qty}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.generated_units.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-green-700"
                        >
                          <Check className="h-3 w-3" />
                          {u.code ?? `#${u.id}`}
                          {/* Edit: batalkan centang unit tersimpan (ganti dengan unit lain) */}
                          <button
                            type="button"
                            onClick={() => handleUncheck(u.id)}
                            disabled={busy}
                            title="Batalkan centang / ganti unit"
                            className="ml-0.5 rounded-full p-0.5 text-green-600 transition-colors hover:bg-green-100 hover:text-red-600 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {Array.from({ length: emptySlots }).map((_, i) => {
                          // Kandidat unit tersedia untuk slot ini (kode langsung).
                          const cand = r.available_units[i]
                          if (!cand || !cand.code) {
                            return (
                              <span
                                key={`empty-${i}`}
                                className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-400"
                              >
                                stok habis
                              </span>
                            )
                          }
                          return (
                            <button
                              key={cand.id}
                              type="button"
                              onClick={() => handleCheckCode(cand.code as string)}
                              disabled={busy}
                              title="Klik untuk centang unit ini"
                              className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-500 transition-colors hover:border-[#4ba69d] hover:bg-[#4ba69d]/5 hover:text-[#4ba69d] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {checking === cand.code ? (
                                <Circle className="h-3 w-3 animate-pulse" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              {cand.code}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal "Siap Disterilkan" + preview & cetak Label Barcode Sterilisasi */}
      <Modal
        open={ready !== null}
        onClose={closeReady}
        title="Siap Disterilkan"
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={closeReady}>
              Tutup
            </Button>
            <Button
              onClick={printLabel}
              disabled={!ready || ready.items.length === 0}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Cetak Label{ready && ready.items.length > 0 ? ` (${ready.items.length})` : ""}
            </Button>
          </div>
        }
      >
        {ready && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Inspeksi &amp; packaging selesai — order siap disterilkan.
            </div>
            <p className="text-xs text-gray-500">
              {ready.items.length} label sterilisasi (satu per alat) · Batch{" "}
              <span className="font-mono font-semibold text-gray-700">{ready.batch ?? "—"}</span>
            </p>

            {/* Preview label sterilisasi — satu per alat instrumen */}
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {ready.items.map((it, i) => {
                const unit = it.unitCode ?? "—"
                return (
                  <div key={`${it.unitCode ?? "x"}-${i}`} className="rounded-lg border border-gray-300 p-3">
                    <p className="text-center text-[11px] font-bold uppercase tracking-wider text-gray-700 border-b border-dashed border-gray-300 pb-1.5">
                      Label Sterilisasi CSSD
                    </p>
                    <p className="mt-2 text-center text-base font-bold text-gray-900">
                      {it.instrumentName}
                    </p>
                    <p className="text-center text-[11px] text-gray-500">
                      {it.source === "paket" ? "Paket" : "Satuan"}
                      {it.source === "paket" && it.packageName ? ` · ${it.packageName}` : ""}
                    </p>
                    <div className="my-1.5 flex justify-center">
                      {it.unitCode ? (
                        <Barcode
                          id={`steril-label-barcode-${i}`}
                          value={it.unitCode}
                          height={48}
                          moduleWidth={2}
                        />
                      ) : (
                        <span className="text-xs text-gray-400">Kode unit belum tersedia</span>
                      )}
                    </div>
                    <p className="text-center font-mono text-sm font-semibold tracking-wider text-gray-800">
                      {unit}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      <span className="text-gray-500">Kode Alat</span>
                      <span className="font-mono font-semibold text-gray-800">{unit}</span>
                      <span className="text-gray-500">No. Batch</span>
                      <span className="font-semibold text-gray-800">{ready.batch ?? "—"}</span>
                      <span className="text-gray-500">ID Pengemas</span>
                      <span className="font-semibold text-gray-800">{ready.packer}</span>
                      <span className="text-gray-500">Tgl Steril</span>
                      <span className="text-gray-400">menyusul (sterilisasi)</span>
                      <span className="text-gray-500">Tgl Kedaluwarsa</span>
                      <span className="text-gray-400">menyusul (sterilisasi)</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400">
              Tempel satu label pada tiap alat. Tgl sterilisasi &amp; kedaluwarsa diisi otomatis
              setelah batch sterilisasi divalidasi.
            </p>
          </div>
        )}
      </Modal>

      {/* Zoom foto instrumen — overlay layar penuh, klik di mana saja untuk menutup */}
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
            <img
              src={zoom.url}
              alt={zoom.name}
              className="max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl"
            />
            <p className="text-sm font-medium text-white">{zoom.name}</p>
          </div>
        </div>
      )}
    </>
  )
}

"use client"

import { useMemo, useState } from "react"
import { Package, Check, Circle, CheckCircle2, Printer, Search, ZoomIn, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Barcode } from "@/components/atoms/Barcode"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"
import type {
  ProdPackagingBatch,
  ProdPackagingUnit,
  ProdSterilLabel,
} from "@/lib/store/slices/productionPackagingSlice"

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

type UnitGroup = { name: string; image: string | null; units: ProdPackagingUnit[] }

function groupUnits(units: ProdPackagingUnit[]): UnitGroup[] {
  const groups: UnitGroup[] = []
  const index = new Map<string, UnitGroup>()
  for (const u of units) {
    const name = u.instrument?.name ?? u.package_name ?? "Instrumen"
    const key = String(u.instrument?.id ?? name)
    let g = index.get(key)
    if (!g) {
      g = { name, image: u.instrument?.image_url ?? null, units: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.units.push(u)
  }
  return groups
}

// Rincian isi sebuah paket dalam batch: instrumen penyusun + jumlah unitnya.
function paketBreakdown(batch: ProdPackagingBatch, packageName: string) {
  const map = new Map<string, { name: string; qty: number }>()
  for (const u of batch.units) {
    if (u.source !== "paket" || u.package_name !== packageName) continue
    const name = u.instrument?.name ?? "Instrumen"
    const cur = map.get(name) ?? { name, qty: 0 }
    cur.qty += 1
    map.set(name, cur)
  }
  return [...map.values()]
}

/**
 * Tab "Inspection & Packaging" pipeline Produksi. Petugas memindai barcode tiap
 * unit untuk memverifikasi komponen set (checklist digital), mencatat nomor lot
 * indikator kimia, lalu menyelesaikan → sistem mencetak Label Barcode Sterilisasi
 * (nama set, batch, expiry otomatis, ID petugas) & batch jadi "Siap Disterilkan".
 */
export function ProductionPackagingTab({
  items,
  onChanged,
}: {
  items: ProdPackagingBatch[]
  onChanged: () => void
}) {
  const [active, setActive] = useState<ProdPackagingBatch | null>(null)
  // instrument_stock_id unit yang sudah diperiksa (checklist digital, lokal).
  const [inspected, setInspected] = useState<Set<number>>(new Set())
  const [scanCode, setScanCode] = useState("")
  const [scanMsg, setScanMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [chemIndicator, setChemIndicator] = useState("")
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Label hasil (muncul setelah selesai) untuk dicetak.
  const [label, setLabel] = useState<ProdSterilLabel | null>(null)
  // Foto instrumen yang sedang di-zoom (klik thumbnail) — null = tidak ada.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // Paket yang isinya sedang ditampilkan di kartu (key `${batch.id}::${namaPaket}`).
  const [openPaket, setOpenPaket] = useState<string | null>(null)

  const groups = useMemo(() => groupUnits(active?.units ?? []), [active])
  const total = active?.units.length ?? 0
  const checked = inspected.size
  const allInspected = total > 0 && checked >= total
  const canFinish = allInspected && chemIndicator.trim().length > 0 && !finishing
  // Kata kunci pencarian per unit (filter checklist): cocokkan kode unit / nama instrumen.
  const query = scanCode.trim().toLowerCase()
  // Query cocok dengan kode batch (PRD / PKG) → tampilkan seluruh unit.
  const batchHit =
    query.length > 0 &&
    ((active?.code_transaction ?? "").toLowerCase().includes(query) ||
      (active?.code ?? "").toLowerCase().includes(query))
  const noMatch =
    query.length > 0 &&
    !batchHit &&
    !groups.some(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.units.some((u) => (u.code ?? "").toLowerCase().includes(query)),
    )

  function open(batch: ProdPackagingBatch) {
    setActive(batch)
    setInspected(new Set())
    setScanCode("")
    setScanMsg(null)
    setChemIndicator("")
    setError(null)
  }

  function toggleInspect(id: number) {
    setInspected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Ekstrak kode unit dari hasil scan. Label unit dicetak sebagai QR berisi URL
  // (.../cssd/scan?code=GNE-001); scanner mengetik URL penuh. Ambil `?code=` bila
  // ada, jika tidak pakai nilai apa adanya (barcode kode polos).
  function extractCode(raw: string): string {
    const s = raw.trim()
    const m = s.match(/[?&]code=([^&\s]+)/i)
    if (m) {
      try {
        return decodeURIComponent(m[1])
      } catch {
        return m[1]
      }
    }
    return s
  }

  // Scan barcode → cocokkan ke unit batch & centang. Verifikasi lokal (unit sudah
  // terkunci sejak Produksi), jadi tak perlu round-trip ke server.
  function handleScan() {
    if (!active || !scanCode.trim()) return
    const code = extractCode(scanCode)
    const unit = active.units.find((u) => (u.code ?? "").toLowerCase() === code.toLowerCase())
    if (!unit || unit.instrument_stock_id == null) {
      setScanMsg({ type: "err", text: `Unit "${code}" tidak ada di batch ini.` })
      return
    }
    if (inspected.has(unit.instrument_stock_id)) {
      setScanMsg({ type: "err", text: `Unit "${unit.code}" sudah dicentang.` })
      setScanCode("")
      return
    }
    setInspected((prev) => new Set(prev).add(unit.instrument_stock_id as number))
    setScanMsg({ type: "ok", text: `Unit "${unit.code}" tercentang.` })
    setScanCode("")
  }

  async function finish() {
    if (!active || !canFinish) return
    setFinishing(true)
    setError(null)
    try {
      const res = await api.post(`/master/packaging/${active.id}/complete`, {
        chemical_indicator: chemIndicator.trim(),
      })
      setLabel(res.data?.data?.label as ProdSterilLabel)
      setActive(null)
      // Refetch DITUNDA sampai modal label ditutup agar komponen tidak unmount.
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setFinishing(false)
    }
  }

  function closeLabel() {
    setLabel(null)
    onChanged()
  }

  // Cetak Label Barcode Sterilisasi — satu label per unit alat.
  function printLabel() {
    if (!label || label.items.length === 0) return
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const sterilDate = formatDate(label.packaged_at)
    const expiry = formatDate(label.expiry_date)

    const labels = label.items
      .map((it, i) => {
        const svg = document.getElementById(`prod-steril-label-${i}`)
        const barcodeSvg = svg ? new XMLSerializer().serializeToString(svg) : ""
        const unit = it.unit_code ?? "—"
        const pkg = it.source === "paket" && it.package_name ? ` · ${esc(it.package_name)}` : ""
        return `
          <div class="label">
            <div class="head">LABEL STERILISASI CSSD</div>
            <div class="set">${esc(it.instrument_name)}</div>
            <div class="sub">${it.source === "paket" ? "Paket" : "Satuan"}${pkg}</div>
            <div class="bc">${barcodeSvg}</div>
            <div class="batch">${esc(unit)}</div>
            <table>
              <tr><td class="k">Kode Alat</td><td class="v">${esc(unit)}</td></tr>
              <tr><td class="k">Nama Set</td><td class="v">${esc(label.set_name)}</td></tr>
              <tr><td class="k">No. Batch</td><td class="v">${esc(label.batch)}</td></tr>
              <tr><td class="k">Indikator Kimia</td><td class="v">${esc(label.chemical_indicator ?? "—")}</td></tr>
              <tr><td class="k">ID Petugas Pengemas</td><td class="v">${esc(label.packer ?? "—")}</td></tr>
              <tr><td class="k">Tgl Sterilisasi</td><td class="v">${esc(sterilDate)}</td></tr>
              <tr><td class="k">Tgl Kedaluwarsa</td><td class="v">${esc(expiry)}</td></tr>
            </table>
          </div>`
      })
      .join("")

    const w = window.open("", "_blank", "width=460,height=600")
    if (!w) return
    w.document.write(`
      <html>
        <head>
          <title>Label Sterilisasi ${esc(label.batch)}</title>
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
            td.k { color: #555; width: 45%; }
            td.v { font-weight: 600; }
            @media print { @page { margin: 6mm; } .label { margin: 0 auto 8mm; } }
          </style>
        </head>
        <body>${labels}</body>
      </html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <>
      <div className="space-y-2">
        {items.map((batch) => (
          <div
            key={batch.id}
            className="rounded-lg border border-gray-200 border-l-4 border-l-[#075489]"
          >
            <div className="flex items-start justify-between gap-2 px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                      {batch.code_transaction ?? batch.code}
                    </span>
                    <Badge variant="warning">Perlu Inspeksi</Badge>
                  </div>
                  {batch.items?.length ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {batch.items.slice(0, 4).map((it, i) => {
                        const isPaket = it.type === "paket"
                        const key = `${batch.id}::${it.name}`
                        const open = openPaket === key
                        if (!isPaket) {
                          return (
                            <span
                              key={`${it.name}-${i}`}
                              className="inline-flex max-w-[180px] items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200"
                            >
                              <span className="truncate font-medium">{it.name}</span>
                              <span className="shrink-0 text-gray-400">×{it.quantity}</span>
                            </span>
                          )
                        }
                        return (
                          <button
                            key={`${it.name}-${i}`}
                            type="button"
                            onClick={() => setOpenPaket(open ? null : key)}
                            title="Lihat isi set"
                            className={
                              "inline-flex max-w-[200px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 transition-colors " +
                              (open
                                ? "bg-[#075489]/10 text-[#075489] ring-[#075489]/30"
                                : "bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100")
                            }
                          >
                            <span className="truncate font-medium">{it.name}</span>
                            <ChevronDown className={"h-3 w-3 shrink-0 transition-transform " + (open ? "rotate-180" : "")} />
                          </button>
                        )
                      })}
                      {batch.items.length > 4 && (
                        <span className="rounded-md bg-[#075489]/8 px-1.5 py-0.5 text-xs font-medium text-[#075489]">
                          +{batch.items.length - 4} lainnya
                        </span>
                      )}
                    </div>
                  ) : null}

                  {/* Rincian isi paket yang dipilih (instrumen penyusun × jumlah). */}
                  {openPaket?.startsWith(`${batch.id}::`) && (
                    <div className="mt-1.5 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5">
                      <p className="mb-1 text-[11px] font-semibold text-gray-500">
                        Isi {openPaket.split("::")[1]}:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {paketBreakdown(batch, openPaket.split("::")[1]).map((p) => (
                          <span
                            key={p.name}
                            className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200"
                          >
                            {p.name} ×{p.qty}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>Selesai cleaning: {formatDateTime(batch.processed_at)}</span>
                    <span>{batch.units_count} unit</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => open(batch)}
                className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90"
              >
                Inspeksi &amp; Kemas
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal checklist inspeksi & packaging */}
      <Modal
        open={active !== null}
        onClose={finishing ? () => {} : () => setActive(null)}
        title={active ? `Inspeksi & Packaging — ${active.code_transaction ?? active.code}` : "Inspeksi & Packaging"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <span className="text-xs text-gray-400">
                Diperiksa {checked}/{total} unit
                {!allInspected ? ` · kurang ${total - checked}` : ""}
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setActive(null)} disabled={finishing}>
                Batal
              </Button>
              <Button
                onClick={finish}
                disabled={!canFinish}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {finishing ? "Memproses..." : "Selesai & Cetak Label"}
              </Button>
            </div>
          </div>
        }
      >
        {active && (
          <div className="space-y-5">
            {/* Cari / scan per unit — memfilter checklist saat mengetik. */}
            <div className="space-y-1.5">
              <Label htmlFor="pkg-scan">Cari Kode Unit/Instrument</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#075489]" />
                <Input
                  id="pkg-scan"
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleScan()
                    }
                  }}
                  placeholder=""
                  className="pl-9"
                />
              </div>
              {scanMsg && (
                <p className={"text-xs " + (scanMsg.type === "ok" ? "text-green-600" : "text-red-600")}>
                  {scanMsg.text}
                </p>
              )}
            </div>

            {/* Checklist komponen set */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Checklist Komponen ({checked}/{total})
              </p>
              <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
                {groups.map((g) => {
                  // Filter chip per unit sesuai kata kunci; sembunyikan grup tanpa hasil.
                  const nameHit = g.name.toLowerCase().includes(query)
                  const shown =
                    !query || batchHit || nameHit
                      ? g.units
                      : g.units.filter((u) => (u.code ?? "").toLowerCase().includes(query))
                  if (shown.length === 0) return null
                  const checkedInGroup = g.units.filter(
                    (u) => u.instrument_stock_id != null && inspected.has(u.instrument_stock_id),
                  ).length
                  return (
                    <div key={g.name} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {g.image ? (
                          <button
                            type="button"
                            onClick={() => setZoom({ url: g.image as string, name: g.name })}
                            title="Klik untuk perbesar"
                            className="group relative h-8 w-8 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={g.image}
                              alt={g.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                              <ZoomIn className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        ) : (
                          <Package className="h-4 w-4 shrink-0 text-[#075489]" />
                        )}
                        <span className="min-w-0 truncate text-sm font-medium text-gray-800">{g.name}</span>
                        <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-[#075489]/10 px-2 py-0.5 text-xs font-semibold text-[#075489]">
                          {checkedInGroup}/{g.units.length}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {shown.map((u) => {
                          const on = u.instrument_stock_id != null && inspected.has(u.instrument_stock_id)
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => u.instrument_stock_id != null && toggleInspect(u.instrument_stock_id)}
                              className={
                                "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] font-semibold ring-1 transition-colors " +
                                (on
                                  ? "bg-green-50 text-green-700 ring-green-300"
                                  : "bg-gray-50 text-gray-500 ring-gray-200 hover:bg-gray-100")
                              }
                            >
                              {on ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                              {u.code ?? `#${u.instrument_stock_id ?? u.id}`}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {noMatch && (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">
                    Tidak ada unit yang cocok dengan &quot;{scanCode.trim()}&quot;.
                  </p>
                )}
              </div>
            </div>

            {/* Indikator kimia internal */}
            <div className="space-y-1.5">
              <Label htmlFor="pkg-chem">No. Lot / Batch Indikator Kimia Internal *</Label>
              <Input
                id="pkg-chem"
                value={chemIndicator}
                onChange={(e) => setChemIndicator(e.target.value)}
                placeholder="mis. CI-LOT-20260702"
              />
              <p className="text-xs text-gray-400">
                Nomor lot indikator kimia yang dimasukkan ke dalam kemasan.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal label — packaging selesai, cetak label sterilisasi */}
      <Modal
        open={label !== null}
        onClose={closeLabel}
        title="Label Sterilisasi Siap Dicetak"
        size="lg"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={closeLabel}>
              Tutup
            </Button>
            <Button onClick={printLabel} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              <Printer className="mr-1.5 h-4 w-4" />
              Cetak Label
            </Button>
          </div>
        }
      >
        {label && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-green-50 px-4 py-3">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
              <p className="text-sm text-gray-700">
                Packaging <span className="font-mono font-semibold">{label.batch}</span> selesai &amp;
                berstatus <b>Siap Disterilkan</b>. Cetak label lalu tempel di kemasan luar.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm sm:grid-cols-3">
              <Info label="Nama Set" value={label.set_name} />
              <Info label="No. Batch" value={label.batch} />
              <Info label="Indikator Kimia" value={label.chemical_indicator} />
              <Info label="Petugas Pengemas" value={label.packer} />
              <Info label="Tgl Sterilisasi" value={formatDate(label.packaged_at)} />
              <Info label="Tgl Kedaluwarsa" value={formatDate(label.expiry_date)} />
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {label.items.length} label (satu per unit)
              </p>
              <div className="flex flex-wrap gap-3">
                {label.items.map((it, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-2 text-center">
                    <Barcode id={`prod-steril-label-${i}`} value={it.unit_code ?? "-"} height={44} moduleWidth={1.6} />
                    <div className="mt-1 font-mono text-[11px] font-semibold text-gray-700">
                      {it.unit_code ?? "—"}
                    </div>
                    <div className="max-w-[140px] truncate text-[11px] text-gray-500">{it.instrument_name}</div>
                  </div>
                ))}
              </div>
            </div>
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

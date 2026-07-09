"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Package, Check, Circle, Printer, Search, ZoomIn, X, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Barcode } from "@/components/atoms/Barcode"
import { Modal } from "@/components/molecules/Modal"
import { useToast } from "@/components/molecules/ToastProvider"
import api from "@/lib/axios"
import type {
  ProdPackagingBatch,
  ProdPackagingUnit,
  ProdSterilLabel,
  ProdSterilLabelItem,
} from "@/lib/store/slices/productionPackagingSlice"
import type { Printer as PrinterConfig } from "@/lib/store/slices/printerSlice"

// Satu label fisik: SATU per paket (berisi daftar instrumen di dalamnya) atau
// SATU per unit untuk instrumen satuan.
type LabelEntry = {
  kind: "satuan" | "paket"
  title: string // nama instrumen (satuan) / nama paket (paket)
  barcodeValue: string // kode unit (satuan) / nama paket (paket)
  unitCode: string | null // untuk satuan
  instruments: { name: string; qty: number }[] // isi paket
  unitCodes: string[] // kode unit di dalam paket
}

// Kelompokkan item label: instrumen paket digabung jadi satu label per paket
// (berdasar package_name); instrumen satuan tetap satu label per unit.
function groupLabelEntries(items: ProdSterilLabelItem[]): LabelEntry[] {
  const entries: LabelEntry[] = []
  const paketMap = new Map<string, LabelEntry>()
  for (const it of items) {
    if (it.source === "paket" && it.package_name) {
      let e = paketMap.get(it.package_name)
      if (!e) {
        e = { kind: "paket", title: it.package_name, barcodeValue: it.package_name, unitCode: null, instruments: [], unitCodes: [] }
        paketMap.set(it.package_name, e)
        entries.push(e)
      }
      const found = e.instruments.find((x) => x.name === it.instrument_name)
      if (found) found.qty += 1
      else e.instruments.push({ name: it.instrument_name, qty: 1 })
      if (it.unit_code) e.unitCodes.push(it.unit_code)
    } else {
      entries.push({
        kind: "satuan",
        title: it.instrument_name,
        barcodeValue: it.unit_code ?? "-",
        unitCode: it.unit_code ?? null,
        instruments: [],
        unitCodes: it.unit_code ? [it.unit_code] : [],
      })
    }
  }
  return entries
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

type UnitGroup = { key: string; name: string; image: string | null; units: ProdPackagingUnit[] }

function groupUnits(units: ProdPackagingUnit[]): UnitGroup[] {
  const groups: UnitGroup[] = []
  const index = new Map<string, UnitGroup>()
  for (const u of units) {
    const name = u.instrument?.name ?? u.package_name ?? "Instrumen"
    const key = String(u.instrument?.id ?? name)
    let g = index.get(key)
    if (!g) {
      g = { key, name, image: u.instrument?.image_url ?? null, units: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.units.push(u)
  }
  return groups
}

// Rincian isi sebuah paket dalam batch: instrumen penyusun + jumlah unit + gambar.
function paketBreakdown(batch: ProdPackagingBatch, packageName: string) {
  const map = new Map<string, { name: string; qty: number; image: string | null }>()
  for (const u of batch.units) {
    if (u.source !== "paket" || u.package_name !== packageName) continue
    const name = u.instrument?.name ?? "Instrumen"
    const cur = map.get(name) ?? { name, qty: 0, image: null }
    cur.qty += 1
    if (!cur.image && u.instrument?.image_url) cur.image = u.instrument.image_url
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
  const toast = useToast()
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
  // true = label dibuka hanya untuk dilihat (via "Lihat Label"); tutup TANPA refetch.
  // false = label muncul setelah pengemasan selesai; tutup memicu refetch.
  const [labelViewOnly, setLabelViewOnly] = useState(false)
  // Foto instrumen yang sedang di-zoom (klik thumbnail) — null = tidak ada.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // Paket yang isinya sedang ditampilkan di kartu (key `${batch.id}::${namaPaket}`).
  const [openPaket, setOpenPaket] = useState<string | null>(null)
  // Batch yang labelnya sedang diambil ulang (untuk state loading tombol "Lihat Label").
  const [labelLoadingId, setLabelLoadingId] = useState<number | null>(null)
  // Pesan error saat mengambil ulang label (di luar modal inspeksi).
  const [listError, setListError] = useState<string | null>(null)
  // Batch riwayat yang detail/history-nya sedang ditampilkan di modal.
  const [historyBatch, setHistoryBatch] = useState<ProdPackagingBatch | null>(null)

  // Daftar printer (dari Master Printer) untuk modal Cetak Label — lazy load.
  const [printers, setPrinters] = useState<PrinterConfig[]>([])
  const [printersLoading, setPrintersLoading] = useState(false)
  const printersLoadedRef = useRef(false)
  const [selectedPrinterId, setSelectedPrinterId] = useState("")
  // Index kartu label yang dipilih untuk dicetak. Kosong = cetak semua.
  const [selectedLabels, setSelectedLabels] = useState<Set<number>>(new Set())
  function toggleLabel(i: number) {
    setSelectedLabels((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  // Muat daftar printer aktif dari Master Printer — sekali saja (cache via ref).
  async function loadPrinters() {
    if (printersLoadedRef.current || printersLoading) return
    setPrintersLoading(true)
    try {
      const collected: PrinterConfig[] = []
      let cur = 1
      let last = 1
      do {
        const res = await api.get("/master/printers", { params: { page: cur } })
        const p = res.data.data
        collected.push(...p.data)
        last = p.last_page
        cur += 1
      } while (cur <= last)
      setPrinters(collected)
      printersLoadedRef.current = true
    } catch {
      // Abaikan — dropdown tetap kosong bila gagal memuat.
    } finally {
      setPrintersLoading(false)
    }
  }

  // Muat printer saat modal Cetak Label dibuka (label != null) + reset pilihan.
  useEffect(() => {
    if (label) {
      loadPrinters()
      setSelectedLabels(new Set())
      setSelectedPrinterId("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label])

  // Opsi dropdown printer — hanya printer aktif.
  const printerOptions = useMemo(
    () =>
      printers
        .filter((p) => p.is_active)
        .map((p) => ({ value: String(p.id), label: p.name })),
    [printers],
  )

  // Auto-pilih printer DEFAULT (dari localStorage, di-set di Master Printer) saat
  // modal terbuka & daftar printer siap. Key harus sama dgn DEFAULT_PRINTER_KEY.
  useEffect(() => {
    if (!label || selectedPrinterId) return
    const def = typeof window !== "undefined" ? localStorage.getItem("master_printer_default") : null
    if (def && printerOptions.some((o) => o.value === def)) {
      setSelectedPrinterId(def)
    }
  }, [label, printerOptions, selectedPrinterId])

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
      setLabelViewOnly(false)
      setLabel(res.data?.data?.label as ProdSterilLabel)
      setActive(null)
      // Refetch DITUNDA sampai modal label ditutup agar komponen tidak unmount.
      toast.success(res.data?.message ?? "Pengemasan selesai.")
    } catch (e) {
      const msg = errMsg(e)
      setError(msg)
      toast.error(msg)
    } finally {
      setFinishing(false)
    }
  }

  function closeLabel() {
    setLabel(null)
    // Hanya refetch bila label muncul akibat pengemasan selesai (data berubah).
    // "Lihat Label" bersifat read-only → tidak perlu refetch.
    if (!labelViewOnly) onChanged()
    setLabelViewOnly(false)
  }

  // Ambil ulang label sterilisasi batch yang sudah dikemas → buka modal label yang
  // sama. Data label tetap tersimpan di server, jadi bisa dilihat/dicetak kapan saja
  // meski modal sebelumnya sudah ditutup.
  async function viewLabel(batch: ProdPackagingBatch) {
    setListError(null)
    setLabelLoadingId(batch.id)
    try {
      const res = await api.get(`/master/packaging/${batch.id}/label`)
      setLabelViewOnly(true)
      // Tutup dulu modal riwayat (bila terbuka) agar label tidak menumpuk di atasnya.
      setHistoryBatch(null)
      setLabel(res.data?.data?.label as ProdSterilLabel)
    } catch (e) {
      setListError(errMsg(e))
    } finally {
      setLabelLoadingId(null)
    }
  }

  // Cetak Label — untuk sementara TIDAK membuka PDF/print browser, hanya
  // console.log printer terpilih + data label. TODO: sambungkan ke API cetak
  // (kirim selectedPrinter + labelPayload ke print server).
  function printLabel() {
    if (!label || !selectedPrinterId) return
    const entries = groupLabelEntries(label.items)
    if (entries.length === 0) return

    const selectedPrinter = printers.find((p) => String(p.id) === selectedPrinterId) ?? null
    const labelPayload = entries
      // Kartu yang dipilih; bila tak ada yang dipilih → semua.
      .filter((_, i) => selectedLabels.size === 0 || selectedLabels.has(i))
      .map((e) => ({
        kode_produksi: label.batch,
        nama_instrumen: e.title,
        petugas_pengemasan: label.packer ?? null,
        tanggal_steril: label.packaged_at,
        tanggal_kadaluarsa: label.expiry_date,
      }))
    console.log("[cetak-label]", { printer: selectedPrinter, labels: labelPayload })
  }

  // Label yang ditampilkan: satu per paket / satu per unit satuan.
  const labelEntries = label ? groupLabelEntries(label.items) : []

  return (
    <>
      {listError && (
        <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{listError}</div>
      )}
      <div className="space-y-2">
        {items.map((batch) => {
          const done = batch.stage_status === "selesai"
          return (
          <div
            key={batch.id}
            onClick={done ? () => setHistoryBatch(batch) : undefined}
            className={
              "rounded-lg border border-gray-200" +
              (done ? " cursor-pointer hover:border-[#075489]/40 hover:bg-gray-50" : "")
            }
          >
            <div className="flex items-start justify-between gap-2 px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                      {batch.code_transaction ?? batch.code}
                    </span>
                    {done ? (
                      <Badge variant="success">Sudah Dikemas</Badge>
                    ) : (
                      <Badge variant="warning">Perlu Inspeksi</Badge>
                    )}
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
                      <div className="flex flex-wrap gap-1.5">
                        {paketBreakdown(batch, openPaket.split("::")[1]).map((p) => (
                          <span
                            key={p.name}
                            className="inline-flex items-center gap-1.5 rounded-md bg-white py-1 pl-1 pr-2 text-[11px] text-gray-600 ring-1 ring-gray-200"
                          >
                            {p.image ? (
                              <button
                                type="button"
                                onClick={() => setZoom({ url: p.image as string, name: p.name })}
                                title="Klik untuk perbesar"
                                className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.image}
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
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    {done ? (
                      <>
                        <span>Dikemas: {formatDateTime(batch.packaged_at)}</span>
                        {(batch.completed_by ?? batch.operator) && (
                          <span>oleh {batch.completed_by ?? batch.operator}</span>
                        )}
                      </>
                    ) : (
                      <span>Selesai cleaning: {formatDateTime(batch.processed_at)}</span>
                    )}
                    <span>{batch.units_count} unit</span>
                  </div>
                </div>
              </div>
              {done ? (
                <div className="flex shrink-0 items-center gap-2 self-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      viewLabel(batch)
                    }}
                    disabled={labelLoadingId === batch.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#075489] px-3 py-1.5 text-xs font-medium text-[#075489] hover:bg-[#075489]/8 disabled:opacity-60"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    {labelLoadingId === batch.id ? "Memuat..." : "Cetak Label"}
                  </button>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => open(batch)}
                  className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90"
                >
                  Inspeksi &amp; Kemas
                </button>
              )}
            </div>
          </div>
          )
        })}
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
        title="Cetak Label"
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {!selectedPrinterId ? (
              <span className="text-xs text-amber-600">Pilih printer dulu untuk mencetak.</span>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={closeLabel}>
                Tutup
              </Button>
              <Button
                onClick={printLabel}
                disabled={!selectedPrinterId}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white disabled:opacity-60"
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Cetak Label{selectedLabels.size > 0 ? ` (${selectedLabels.size})` : " (Semua)"}
              </Button>
            </div>
          </div>
        }
      >
        {label && (
          <div className="space-y-4">
            {/* Pilih printer (dari Master Printer) — wajib sebelum cetak */}
            <div className="space-y-1.5">
              <Label>
                Printer <span className="text-red-500">*</span>
              </Label>
              <SelectSearch
                options={printerOptions}
                value={selectedPrinterId}
                onChange={setSelectedPrinterId}
                loading={printersLoading}
                placeholder="Pilih printer..."
                searchPlaceholder="Cari printer..."
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">View Label</p>
                <p className="text-xs text-gray-400">
                  {selectedLabels.size > 0
                    ? `${selectedLabels.size} dipilih`
                    : "Klik kartu untuk pilih — kosong = cetak semua"}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {labelEntries.map((e, i) => {
                  const picked = selectedLabels.has(i)
                  return (
                  <div
                    key={i}
                    onClick={() => toggleLabel(i)}
                    className={
                      "relative w-[220px] cursor-pointer rounded-lg border p-3 text-center transition-colors " +
                      (picked
                        ? "border-[#075489] bg-[#075489]/5 ring-1 ring-[#075489]/20"
                        : "border-gray-200 hover:border-[#075489]/40")
                    }
                  >
                    {/* Penanda pilih */}
                    <span
                      className={
                        "absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded border " +
                        (picked ? "border-[#075489] bg-[#075489] text-white" : "border-gray-300 bg-white")
                      }
                    >
                      {picked && <Check className="h-3 w-3" />}
                    </span>
                    {/* Barcode berisi kode produksi (batch). */}
                    <div className="my-2 flex justify-center">
                      <Barcode id={`prod-steril-label-${i}`} value={label.batch} height={44} moduleWidth={1.6} />
                    </div>
                    <div className="font-mono text-[11px] font-semibold text-gray-700">{label.batch}</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{e.title}</div>
                    <table className="mt-2 w-full text-left text-[10px]">
                      <tbody>
                        <tr>
                          <td className="py-0.5 pr-2 text-gray-500">Petugas Pengemasan</td>
                          <td className="py-0.5 font-medium text-gray-800">{label.packer ?? "—"}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-2 text-gray-500">Tanggal Steril</td>
                          <td className="py-0.5 font-medium text-gray-800">{formatDate(label.packaged_at)}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-2 text-gray-500">Tanggal Kadaluarsa</td>
                          <td className="py-0.5 font-medium text-gray-800">{formatDate(label.expiry_date)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal riwayat packaging: No. Lot + siapa yang memproses & menyelesaikan */}
      <Modal
        open={historyBatch !== null}
        onClose={() => setHistoryBatch(null)}
        title={historyBatch ? `Riwayat Packaging — ${historyBatch.code}` : "Riwayat Packaging"}
        size="lg"
        footer={
          <div className="flex w-full justify-end gap-2">
            {historyBatch && (
              <button
                type="button"
                onClick={() => viewLabel(historyBatch)}
                disabled={labelLoadingId === historyBatch.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#075489] px-3 py-1.5 text-xs font-medium text-[#075489] hover:bg-[#075489]/8 disabled:opacity-60"
              >
                <Printer className="h-3.5 w-3.5" />
                {labelLoadingId === historyBatch.id ? "Memuat..." : "Cetak Label"}
              </button>
            )}
            <Button variant="outline" onClick={() => setHistoryBatch(null)}>
              Tutup
            </Button>
          </div>
        }
      >
        {historyBatch && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Sudah Dikemas</Badge>
              {historyBatch.code_transaction && (
                <span className="text-xs text-gray-500">{historyBatch.code_transaction}</span>
              )}
              {historyBatch.washing_code && (
                <span className="text-xs text-gray-500">{historyBatch.washing_code}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-3">
              <Info label="No. Batch (PKG)" value={historyBatch.code} />
              <Info label="No. Lot (Indikator Kimia)" value={historyBatch.chemical_indicator} />
              <Info label="Jumlah Unit" value={`${historyBatch.units_count} unit`} />
              <Info label="Diproses oleh" value={historyBatch.processed_by} />
              <Info label="Dikemas oleh" value={historyBatch.completed_by ?? historyBatch.operator} />
              <Info label="Waktu Dikemas" value={formatDateTime(historyBatch.packaged_at)} />
            </div>

            <div className="space-y-1.5">
              <Label>Unit Dikemas ({historyBatch.units_count})</Label>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {groupUnits(historyBatch.units).map((g) => (
                  <div key={g.key} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-800">{g.name}</span>
                      <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-[#075489]/10 px-2 py-0.5 text-xs font-semibold text-[#075489]">
                        {g.units.length} unit
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {g.units.map((u) => (
                        <span key={u.id} className="rounded bg-[#075489]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#075489]">
                          {u.code ?? `#${u.id}`}
                        </span>
                      ))}
                    </div>
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

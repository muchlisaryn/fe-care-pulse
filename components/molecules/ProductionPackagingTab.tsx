"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Package, Check, Printer, Search, ZoomIn, X, ChevronRight } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Barcode } from "@/components/atoms/Barcode"
import { Modal } from "@/components/molecules/Modal"
import { useToast } from "@/components/molecules/ToastProvider"
import api from "@/lib/axios"
import { isEscposPrinter, printCssdLabels, type CssdLabelPayload } from "@/lib/printServer"
import type {
  PackagingType,
  ProdPackagingBatch,
  ProdPackagingUnit,
  ProdSterilLabel,
  ProdSterilLabelItem,
} from "@/lib/store/slices/productionPackagingSlice"
import type { Printer as PrinterConfig } from "@/lib/store/slices/printerSlice"

// Satu label fisik: SATU per set paket (berisi daftar instrumen di dalamnya) atau
// SATU per unit untuk instrumen satuan.
type LabelEntry = {
  kind: "satuan" | "paket"
  title: string // nama instrumen (satuan) / nama paket (paket)
  barcodeValue: string // kode unit (satuan) / nama paket (paket)
  unitCode: string | null // untuk satuan
  instruments: { name: string; qty: number }[] // isi paket
  unitCodes: string[] // kode unit di dalam paket
  packagingItemId: number | null // id packaging_item (paket: id item pertama)
  labelCode: string // teks yang DITAMPILKAN: tiga segmen berspasi, "PKG 26050201 1"
  barcodeNo: string // isi barcode saat DIPINDAI: packaging_item.barcode_no, tanpa spasi
}

// Kode yang dicetak & di-barcode pada satu label, disusun dari TIGA segmen yang
// dipisah spasi: prefix (PKG/RPK), nomor packaging (ymd + urutan harian), lalu
// nomor set dari production_item.package_no — mis. "PKG 26050201 1". Prefix
// sengaja tidak dilebur ke nomor packaging. Batch lama tanpa penomoran set hanya
// memakai dua segmen pertama.
function buildLabelCode(prefix: string, packagingNumber: string, packageNo: number | null) {
  return [prefix, packagingNumber, packageNo].filter((part) => part !== null && part !== "").join(" ")
}

// Kelompokkan item label: instrumen paket digabung jadi satu label per SET FISIK
// (package_name + package_no) — dua set bernama sama dapat labelnya masing-masing;
// instrumen satuan tetap satu label per unit. `prefix` + `packagingNumber` dipakai
// menyusun labelCode tiap entry.
function groupLabelEntries(
  items: ProdSterilLabelItem[],
  prefix: string,
  packagingNumber: string,
): LabelEntry[] {
  const entries: LabelEntry[] = []
  const paketMap = new Map<string, LabelEntry>()
  for (const it of items) {
    if (it.source === "paket" && it.package_name) {
      const key = `${it.package_name}|${it.package_no ?? ""}`
      let e = paketMap.get(key)
      if (!e) {
        e = {
          kind: "paket",
          title: it.package_name,
          barcodeValue: it.package_name,
          unitCode: null,
          instruments: [],
          unitCodes: [],
          packagingItemId: it.id,
          labelCode: buildLabelCode(prefix, packagingNumber, it.package_no),
          barcodeNo: it.barcode_no,
        }
        paketMap.set(key, e)
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
        packagingItemId: it.id,
        labelCode: buildLabelCode(prefix, packagingNumber, it.package_no),
        barcodeNo: it.barcode_no,
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

// Unit `paket` dikelompokkan per SET FISIK — kombinasi nama paket + `package_no`
// dari production_item — sehingga 2 set bernama sama jadi 2 grup terpisah, bukan
// melebur. Unit `satuan` tetap dikelompokkan per instrumen. Batch lama tanpa
// package_no (null) melebur jadi satu grup seperti perilaku sebelumnya.
function groupUnits(units: ProdPackagingUnit[]): UnitGroup[] {
  const groups: UnitGroup[] = []
  const index = new Map<string, UnitGroup>()
  for (const u of units) {
    const isPaket = u.source === "paket"
    const name = isPaket
      ? u.package_name ?? "Paket"
      : u.instrument?.name ?? u.package_name ?? "Instrumen"
    // Baris paket pakai foto paket (snapshot), baris satuan foto instrumennya.
    const image = isPaket ? u.image_url : u.instrument?.image_url ?? u.image_url
    const key = isPaket
      ? `paket|${name}|${u.package_no ?? ""}`
      : `satuan|${u.instrument?.id ?? name}`
    let g = index.get(key)
    if (!g) {
      g = { key, name, image: image ?? null, units: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.units.push(u)
    g.image ??= image ?? null
  }
  return groups
}

// Unit cocok dengan kata kunci pencarian: kode unit (hasil scan barcode — kodenya
// tidak lagi ditampilkan, tapi tetap bisa dicari) atau nama instrumennya.
function unitHit(u: ProdPackagingUnit, query: string): boolean {
  return (
    (u.code ?? "").toLowerCase().includes(query) ||
    (u.name ?? u.instrument?.name ?? "").toLowerCase().includes(query)
  )
}

// Foto per nama paket / instrumen (dari unit batch) untuk thumbnail chip kartu.
// Baris paket memakai foto paket, baris satuan memakai foto instrumennya.
function imagesByName(batch: ProdPackagingBatch): Record<string, string> {
  const map: Record<string, string> = {}
  for (const u of batch.units ?? []) {
    const image = u.image_url ?? u.instrument?.image_url
    if (!image) continue
    const key = u.source === "paket" ? u.package_name : u.instrument?.name ?? null
    if (key && !map[key]) map[key] = image
  }
  return map
}

/** Tgl kedaluwarsa steril bila dikemas hari ini dengan masa simpan `days`. */
function expiryPreview(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Tab "Inspection & Packaging" pipeline Produksi. Petugas memindai barcode tiap
 * unit untuk memverifikasi komponen set (checklist digital), mencatat nomor lot
 * indikator kimia & memilih jenis kemasan (masa simpannya menentukan tgl
 * kedaluwarsa steril), lalu menyelesaikan → sistem mencetak Label Barcode
 * Sterilisasi & batch jadi "Siap Disterilkan".
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
  // Jenis kemasan terpilih — masa simpannya menentukan tgl kedaluwarsa steril.
  const [packagingType, setPackagingType] = useState("")
  const [types, setTypes] = useState<PackagingType[]>([])
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Label hasil (muncul setelah selesai) untuk dicetak.
  const [label, setLabel] = useState<ProdSterilLabel | null>(null)
  // true = label dibuka hanya untuk dilihat (via "Lihat Label"); tutup TANPA refetch.
  // false = label muncul setelah pengemasan selesai; tutup memicu refetch.
  const [labelViewOnly, setLabelViewOnly] = useState(false)
  // Foto instrumen yang sedang di-zoom (klik thumbnail) — null = tidak ada.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // Batch yang labelnya sedang diambil ulang (untuk state loading tombol "Lihat Label").
  const [labelLoadingId, setLabelLoadingId] = useState<number | null>(null)
  // Pesan error saat mengambil ulang label (di luar modal inspeksi).
  const [listError, setListError] = useState<string | null>(null)
  // Batch riwayat yang detail/history-nya sedang ditampilkan di modal.
  const [historyBatch, setHistoryBatch] = useState<ProdPackagingBatch | null>(null)

  // Daftar printer (dari Master Printer) untuk modal Cetak Label. Diambil ulang
  // tiap modal dibuka: konfigurasi (auto_cut, paper_size, device_path, ...) bisa
  // saja baru diubah di Master Printer, dan tab ini tidak ikut Redux `printers`
  // sehingga tak menerima sinyal invalidatePrinters().
  const [printers, setPrinters] = useState<PrinterConfig[]>([])
  const [printersLoading, setPrintersLoading] = useState(false)
  // Cegah fetch ganda saat modal dibuka (mis. double-effect React StrictMode).
  const printersInFlightRef = useRef(false)
  const [selectedPrinterId, setSelectedPrinterId] = useState("")
  // Pengiriman label ke print server sedang berjalan.
  const [printing, setPrinting] = useState(false)
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

  // Muat daftar printer aktif dari Master Printer. Sengaja tanpa cache lintas
  // modal — konfigurasi printer yang basi akan salah cetak (mis. tetap memotong
  // kertas padahal auto_cut baru dimatikan), dan daftarnya cuma beberapa baris.
  async function loadPrinters() {
    if (printersInFlightRef.current) return
    printersInFlightRef.current = true
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
    } catch {
      // Abaikan — dropdown tetap kosong bila gagal memuat.
    } finally {
      setPrintersLoading(false)
      printersInFlightRef.current = false
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

  // Opsi dropdown printer — hanya printer aktif & ESC/POS, karena endpoint
  // /print-label pada print server menolak bahasa printer lain (zpl/tspl/epl).
  const printerOptions = useMemo(
    () =>
      printers
        .filter((p) => p.is_active && isEscposPrinter(p))
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
  const canFinish = allInspected && chemIndicator.trim().length > 0 && packagingType !== "" && !finishing
  const selectedType = types.find((t) => String(t.value) === packagingType) ?? null
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
    !groups.some((g) => g.name.toLowerCase().includes(query) || g.units.some((u) => unitHit(u, query)))

  /**
   * Buka modal inspeksi. Tidak ada penulisan ke server di sini — batch antrean
   * (`started: false`) baru dibuatkan record packaging + packaging_item saat
   * "Selesai & Cetak Label" ditekan (lihat `finish`).
   */
  function open(batch: ProdPackagingBatch) {
    setActive(batch)
    setInspected(new Set())
    setScanCode("")
    setScanMsg(null)
    setChemIndicator("")
    setPackagingType(batch.packaging_type_id != null ? String(batch.packaging_type_id) : "")
    setError(null)
    loadTypes()
  }

  /** Muat pilihan jenis kemasan aktif (+ masa simpannya) dari master — sekali saja. */
  async function loadTypes() {
    if (types.length > 0) return
    try {
      const res = await api.get("/master/packaging-types/options")
      setTypes((res.data?.data ?? []) as PackagingType[])
    } catch (e) {
      setError(errMsg(e))
    }
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
    const payload = {
      chemical_indicator: chemIndicator.trim(),
      packaging_type_id: Number(packagingType),
    }
    try {
      // Batch antrean: record packaging + packaging_item dibuat sekarang (satu
      // request). Batch yang recordnya sudah ada (mis. pengemasan ulang RPK)
      // cukup ditandai selesai.
      const res =
        active.started && active.id != null
          ? await api.post(`/master/packaging/${active.id}/complete`, payload)
          : await api.post("/master/packaging/complete", {
              washing_code: active.washing_code,
              ...payload,
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
    // Label baru ada setelah batch dikemas, jadi id-nya pasti terisi.
    if (batch.id == null) return
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

  // Cetak Label — kirim printer terpilih + data label ke care-pulse-print-server
  // (POST /api/print-label), yang mencetak ke printer termal ESC/POS. Seluruh
  // konfigurasi (auto_cut, paper_size, char_per_line, code_page) ikut apa adanya
  // dari Master Printer lewat printerPayload() — halaman ini tidak menimpanya.
  async function printLabel() {
    if (!label || !selectedPrinterId || printing) return
    const entries = groupLabelEntries(label.items, label.packaging_prefix, label.packaging_number)
    if (entries.length === 0) return

    const selectedPrinter = printers.find((p) => String(p.id) === selectedPrinterId)
    if (!selectedPrinter) return

    const labelPayload: CssdLabelPayload[] = entries
      // Kartu yang dipilih; bila tak ada yang dipilih → semua.
      .filter((_, i) => selectedLabels.size === 0 || selectedLabels.has(i))
      .map((e) => ({
        // Print server memakai satu field ini untuk teks sekaligus barcode, jadi
        // dikirim versi TANPA SPASI (packaging_item.barcode_no) supaya hasil scan
        // label fisik sama persis dengan yang tersimpan di database.
        kode_produksi: e.barcodeNo,
        nama_instrumen: e.title,
        no_lot: label.chemical_indicator,
        petugas_pengemasan: label.packer ?? null,
        tanggal_steril: label.packaged_at,
        tanggal_kadaluarsa: label.expiry_date,
      }))

    setPrinting(true)
    try {
      const message = await printCssdLabels(selectedPrinter, labelPayload)
      toast.success(message)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mencetak label.")
    } finally {
      setPrinting(false)
    }
  }

  // Label yang ditampilkan: satu per paket / satu per unit satuan.
  const labelEntries = label ? groupLabelEntries(label.items, label.packaging_prefix, label.packaging_number) : []

  return (
    <>
      {listError && (
        <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{listError}</div>
      )}
      <div className="space-y-2">
        {items.map((batch) => {
          const done = batch.stage_status === "selesai"
          const imageByName = imagesByName(batch)
          return (
          <div
            // Satu washing bisa punya beberapa ronde packaging (PKG lalu RPK saat
            // ada unit gagal steril), jadi washing_code sendiri TIDAK unik. Batch
            // yang sudah punya record dikunci id-nya; batch antrean belum punya
            // record sama sekali sehingga washing_code-nya pasti tunggal.
            key={batch.id != null ? `pkg-${batch.id}` : `queue-${batch.washing_code}`}
            onClick={done ? () => setHistoryBatch(batch) : undefined}
            className={
              "rounded-lg border border-gray-200" +
              (done ? " cursor-pointer hover:border-[#075489]/40 hover:bg-gray-50" : "")
            }
          >
            <div className="flex items-start justify-between gap-2 px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0">
                  {/* Baris 1: status | kode produksi. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {done ? (
                      <Badge variant="success">Sudah Dikemas</Badge>
                    ) : (
                      <Badge variant="warning">Perlu Inspeksi</Badge>
                    )}
                    <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                      {batch.code_transaction ?? batch.code ?? batch.washing_code}
                    </span>
                  </div>
                  {batch.items?.length ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1">
                      {batch.items.slice(0, 4).map((it, i) => (
                        <span
                          key={`${it.name}-${i}`}
                          title={`${it.name} ×${it.quantity}`}
                          className="inline-flex max-w-[200px] items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200"
                        >
                          {imageByName[it.name] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageByName[it.name]}
                              alt={it.name}
                              className="h-5 w-5 shrink-0 rounded object-cover"
                            />
                          )}
                          <span className="truncate font-medium">{it.name}</span>
                          {/* Paket: jumlah SET, bukan jumlah instrumen di dalamnya. */}
                          <span className="shrink-0 text-gray-400">×{it.quantity}</span>
                        </span>
                      ))}
                      {batch.items.length > 4 && (
                        <span className="rounded-md bg-[#075489]/8 px-1.5 py-0.5 text-xs font-medium text-[#075489]">
                          +{batch.items.length - 4} lainnya
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    {done ? (
                      <span>Dikemas: {formatDateTime(batch.packaged_at)}</span>
                    ) : (
                      <span>Selesai cleaning: {formatDateTime(batch.processed_at)}</span>
                    )}
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
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex shrink-0 gap-2 ml-auto">
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
            {/* Checklist komponen: pencarian + daftar unit dijadikan satu section
                agar tidak membingungkan (cari & centang menyatu). */}
            <div className="space-y-3 rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Checklist Komponen ({checked}/{total})
              </p>

              {/* Cari / scan per unit — memfilter checklist saat mengetik. */}
              <div className="space-y-1.5">
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
                    placeholder="Cari kode unit atau instrumen..."
                    className="pl-9"
                  />
                </div>
                {scanMsg && (
                  <p className={"text-xs " + (scanMsg.type === "ok" ? "text-green-600" : "text-red-600")}>
                    {scanMsg.text}
                  </p>
                )}
              </div>

              <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
                {groups.map((g) => {
                  // Filter chip per unit sesuai kata kunci; sembunyikan grup tanpa hasil.
                  const nameHit = g.name.toLowerCase().includes(query)
                  const shown =
                    !query || batchHit || nameHit
                      ? g.units
                      : g.units.filter((u) => unitHit(u, query))
                  if (shown.length === 0) return null
                  const checkedInGroup = g.units.filter(
                    (u) => u.instrument_stock_id != null && inspected.has(u.instrument_stock_id),
                  ).length
                  return (
                    <div key={g.key} className="px-3 py-2.5">
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
                      {/* Checklist unit: satu baris penuh per instrumen (urut ke bawah)
                          dengan target sentuh besar agar mudah dicentang di tablet. */}
                      <div className="mt-2 flex flex-col gap-1.5">
                        {shown.map((u) => {
                          const on = u.instrument_stock_id != null && inspected.has(u.instrument_stock_id)
                          return (
                            <button
                              key={u.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => u.instrument_stock_id != null && toggleInspect(u.instrument_stock_id)}
                              className={
                                "flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ring-1 transition-colors " +
                                (on
                                  ? "bg-green-50 text-green-800 ring-green-300"
                                  : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50 active:bg-gray-100")
                              }
                            >
                              <span
                                className={
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 " +
                                  (on
                                    ? "bg-green-600 text-white ring-green-600"
                                    : "bg-white text-transparent ring-gray-300")
                                }
                              >
                                <Check className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">
                                {u.name ?? u.instrument?.name ?? "Instrumen"}
                              </span>
                              {/* Kode unit — pembeda dua instrumen sejenis dalam satu set. */}
                              <span
                                className={
                                  "shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold sm:text-xs " +
                                  (on ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")
                                }
                              >
                                {u.code ?? `#${u.instrument_stock_id ?? u.id}`}
                              </span>
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
            </div>

            {/* Jenis kemasan — masa simpannya menentukan tgl kedaluwarsa steril */}
            <div className="space-y-1.5">
              <Label htmlFor="pkg-type">Jenis Kemasan *</Label>
              <Select
                id="pkg-type"
                value={packagingType}
                onChange={(e) => setPackagingType(e.target.value)}
              >
                <option value="">Pilih jenis kemasan...</option>
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.shelf_life_days} hari
                  </option>
                ))}
              </Select>
              {selectedType && (
                <p className="text-xs text-gray-400">
                  Kedaluwarsa steril: {expiryPreview(selectedType.shelf_life_days)}
                </p>
              )}
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
            <div className="flex shrink-0 gap-2 ml-auto">
              <Button variant="outline" onClick={closeLabel} disabled={printing}>
                Tutup
              </Button>
              <Button
                onClick={printLabel}
                disabled={!selectedPrinterId || printing}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white disabled:opacity-60"
              >
                <Printer className="mr-1.5 h-4 w-4" />
                {printing
                  ? "Mencetak..."
                  : `Cetak Label${selectedLabels.size > 0 ? ` (${selectedLabels.size})` : ""}`}
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
                {selectedLabels.size > 0 && (
                  <p className="text-xs text-gray-400">{selectedLabels.size} dipilih</p>
                )}
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
                    {/* Penanda pilih — di baris sendiri (bukan absolute) supaya tidak
                        menutupi barcode yang kini selebar kartu. */}
                    <div className="mb-1 flex justify-end">
                      <span
                        className={
                          "flex h-4 w-4 items-center justify-center rounded border " +
                          (picked ? "border-[#075489] bg-[#075489] text-white" : "border-gray-300 bg-white")
                        }
                      >
                        {picked && <Check className="h-3 w-3" />}
                      </span>
                    </div>
                    {/* Barcode selebar kartu; kodenya dirender oleh atom Barcode
                        supaya lebarnya persis mengikuti area bar (di luar quiet zone). */}
                    <div>
                      <Barcode
                        id={`prod-steril-label-${i}`}
                        // Yang di-encode = barcode_no (tanpa spasi) agar hasil scan
                        // cocok persis dengan kolom packaging_item.barcode_no;
                        // teks di bawahnya tetap versi berspasi agar mudah dibaca.
                        value={e.barcodeNo}
                        height={44}
                        moduleWidth={1.6}
                        fluid
                        caption={e.labelCode}
                        captionClassName="font-mono text-[11px] font-semibold leading-tight text-gray-700"
                      />
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{e.title}</div>
                    <table className="mt-2 w-full text-left text-[10px]">
                      <tbody>
                        <tr>
                          <td className="py-0.5 pr-2 text-gray-500">No. Lot / Batch</td>
                          <td className="py-0.5 font-medium text-gray-800">{label.chemical_indicator ?? "—"}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-2 text-gray-500">Petugas Pengemasan</td>
                          <td className="py-0.5 font-medium text-gray-800">{label.packer ?? "—"}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-2 text-gray-500">Tanggal Steril</td>
                          <td className="py-0.5 font-medium text-gray-800">{formatDate(label.packaged_at)}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-2 text-gray-500">Tanggal Kadaluwarsa</td>
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
              <Info label="Jenis Kemasan" value={historyBatch.packaging_type_label} />
              <Info label="Tgl Kedaluwarsa Steril" value={historyBatch.expiry_date} />
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
                    {/* Rincian unit: nama instrumen (snapshot produksi) + kode unitnya,
                        urut ke bawah seperti checklist inspeksi. */}
                    <div className="mt-1.5 flex flex-col gap-1">
                      {g.units.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                            {u.name ?? u.instrument?.name ?? "Instrumen"}
                          </span>
                          <span className="shrink-0 rounded bg-[#075489]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#075489]">
                            {u.code ?? `#${u.id}`}
                          </span>
                        </div>
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

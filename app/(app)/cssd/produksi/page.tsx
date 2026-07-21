"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Trash2, Package, Search, ScanLine, AlertTriangle, Loader2, ZoomIn } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { Badge } from "@/components/atoms/Badge"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { Modal } from "@/components/molecules/Modal"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { fetchCleaning, invalidateCleaning } from "@/lib/store/slices/cleaningSlice"
import { fetchProductionPackaging } from "@/lib/store/slices/productionPackagingSlice"
import { fetchProductionSterilize } from "@/lib/store/slices/productionSterilizeSlice"
import { CleaningTab } from "@/components/molecules/CleaningTab"
import { ProductionPackagingTab } from "@/components/molecules/ProductionPackagingTab"
import { ProductionSterilizationTab } from "@/components/molecules/ProductionSterilizationTab"
import { useToast } from "@/components/molecules/ToastProvider"
import api from "@/lib/axios"

// Tab halaman Produksi CSSD: form produksi + tahapan pipeline reprocessing.
type ProduksiTab = "produksi" | "cleaning" | "packaging" | "sterilization"
const ITEMS_PER_PAGE = 20

// Jenis instrumen (master) — untuk produksi satuan.
type InstrumentType = { id: number; code: string; name: string; image_url?: string | null }
// Katalog paket/set instrumen (Master › Set Instrumen, tipe `paket`).
type PaketCatalog = { id: number; code: string; name: string; image_url?: string | null }
// Rincian isi paket (jenis instrumen + jumlah per set).
type PaketItem = { instrument_id: number; quantity: number; instrument?: { name: string } | null }

type AddMode = "satuan" | "paket"

// Satu baris produksi yang akan dikirim ke pipeline Cleaning.
type ProduksiLine = {
  type: AddMode
  refId: number // instrument_id (satuan) / instrument_catalog_id (paket)
  name: string
  quantity: string // teks agar boleh kosong sementara; divalidasi saat submit
  image?: string | null // gambar instrumen/paket — ditampilkan sebagai thumbnail baris
  items?: PaketItem[] // rincian isi paket (untuk type `paket`) — ditampilkan sebagai detail
}

function errMsg(e: unknown): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? "Terjadi kesalahan."
}

// Date lokal → "YYYY-MM-DD" untuk <input type="date">.
function toDateInput(d: Date): string {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

// Rentang default filter Cleaning: 7 hari terakhir (hari ini − 7 s/d hari ini).
function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  return { from: toDateInput(from), to: toDateInput(to) }
}

/**
 * Produksi CSSD — awal lifecycle. CSSD memproses stok alat miliknya sendiri:
 * pilih jenis/paket + jumlah, lalu "Mulai Produksi" membuat batch internal yang
 * langsung masuk tahap Cleaning (lanjut ke Inspection → Sterilization → Storage).
 */
const PRODUKSI_TABS: ProduksiTab[] = ["produksi", "cleaning", "packaging", "sterilization"]

function ProduksiCssdPage() {
  const searchParams = useSearchParams()
  const dispatch = useAppDispatch()
  const toast = useToast()

  // Tab aktif: form produksi atau salah satu tahap pipeline. Disinkronkan ke URL
  // (?tab=cleaning) agar tiap tahap punya URL sendiri & bisa di-deep-link.
  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState<ProduksiTab>(
    PRODUKSI_TABS.includes(tabParam as ProduksiTab) ? (tabParam as ProduksiTab) : "produksi",
  )
  const [page, setPage] = useState(1)
  // Pencarian teks: disaring MURNI DI FRONTEND terhadap data yang sudah dimuat,
  // jadi hasilnya langsung menyusut saat mengetik tanpa request ke backend.
  const [search, setSearch] = useState("")
  // Filter rentang tanggal (tab Cleaning) — berdasarkan tanggal batch diproses
  // (processed_at, fallback order_date). Format "YYYY-MM-DD" dari <input type="date">.
  // Default: 7 hari terakhir.
  const [dateFrom, setDateFrom] = useState(() => defaultDateRange().from)
  const [dateTo, setDateTo] = useState(() => defaultDateRange().to)
  // Mode scan (tab Sterilisasi): kolom cari dipakai sebagai input barcode. Scanner
  // mengetik `barcode_no` lalu menekan Enter → labelnya langsung tercentang.
  const [scanMode, setScanMode] = useState(false)
  // Isi kolom saat mode scan — sengaja terpisah dari `search` supaya pindaian tidak
  // ikut menyaring daftar (pencarian teks nonaktif selama mode scan).
  const [scanInput, setScanInput] = useState("")
  // Label yang tercentang hasil scan — dipisah dari centang manual di dalam tab
  // agar bisa diisi dari sini tanpa mengangkat seluruh state pemilihan.
  const [scannedCodes, setScannedCodes] = useState<string[]>([])
  // Pindaian sedang divalidasi ke backend (mencegah scan bertumpuk).
  const [scanChecking, setScanChecking] = useState(false)
  // Alert hasil scan yang ditolak backend — ditampilkan sebagai modal.
  const [scanAlert, setScanAlert] = useState<{ title: string; message: string } | null>(null)

  // Draft rentang tanggal — di-commit saat "Terapkan" ditekan, karena perubahannya
  // memicu request ke backend (beda dengan pencarian yang murni frontend).
  const [dateFromInput, setDateFromInput] = useState(() => defaultDateRange().from)
  const [dateToInput, setDateToInput] = useState(() => defaultDateRange().to)

  // Terapkan rentang tanggal dari draft → memicu fetch ulang, lalu ke halaman 1.
  function applyFilter(e?: React.FormEvent) {
    e?.preventDefault()
    setDateFrom(dateFromInput)
    setDateTo(dateToInput)
    setPage(1)
  }
  // Reset ke kondisi awal: search kosong + rentang tanggal kembali ke 7 hari terakhir.
  function resetFilter() {
    const def = defaultDateRange()
    setDateFromInput(def.from)
    setDateToInput(def.to)
    setSearch("")
    setDateFrom(def.from)
    setDateTo(def.to)
    setPage(1)
  }
  const defaultRange = defaultDateRange()
  const hasFilter =
    search !== "" || dateFrom !== defaultRange.from || dateTo !== defaultRange.to
  // Sub-tampilan pada tab Packaging: batch yang masih perlu dikemas vs riwayat
  // batch yang sudah dikemas (untuk lihat/cetak ulang label).
  const [pkgView, setPkgView] = useState<"pending" | "history">("pending")
  // Sub-tampilan pada tab Cleaning: proses cleaning vs riwayat cleaning.
  const [cleanView, setCleanView] = useState<"proses" | "history">("proses")
  // Sub-tampilan pada tab Sterilisasi: proses steril / validasi hasil / gagal steril / riwayat.
  const [sterView, setSterView] = useState<"proses" | "validasi" | "history">("proses")

  // Data pipeline (tahap Cleaning/Packaging/Sterilization) — sama seperti dulu di
  // Tracking Order, kini dipantau dari halaman Produksi.
  const cleaning = useAppSelector((s) => s.cleaning.items)
  const cleaningLoading = useAppSelector((s) => s.cleaning.loading)
  const packaging = useAppSelector((s) => s.productionPackaging.items)
  const packagingLoading = useAppSelector((s) => s.productionPackaging.loading)
  const sterilizePipeline = useAppSelector((s) => s.productionSterilize.items)
  const sterilizeLoading = useAppSelector((s) => s.productionSterilize.loading)

  // Muat data pipeline setiap kali tab-nya dibuka — selalu fetch ulang (tanpa cache)
  // agar datanya selalu terbaru. Membuka menu Produksi (tab "produksi") tidak memuat
  // data cleaning/packaging/sterilisasi sama sekali.
  // Rentang tanggal dikerjakan BACKEND, jadi perubahannya ikut memicu fetch ulang.
  useEffect(() => {
    const range = { date_from: dateFrom || undefined, date_to: dateTo || undefined }
    if (tab === "cleaning") dispatch(fetchCleaning(range))
    else if (tab === "packaging") dispatch(fetchProductionPackaging(range))
    else if (tab === "sterilization") dispatch(fetchProductionSterilize(range))
  }, [tab, dateFrom, dateTo, dispatch])

  // Muat ulang data tab pipeline yang sedang aktif (dipanggil setelah aksi/mutasi).
  function refreshPipeline() {
    const range = { date_from: dateFrom || undefined, date_to: dateTo || undefined }
    if (tab === "cleaning") dispatch(fetchCleaning(range))
    else if (tab === "packaging") dispatch(fetchProductionPackaging(range))
    else if (tab === "sterilization") dispatch(fetchProductionSterilize(range))
  }

  // Kata kunci pencarian — hanya menyaring data yang SUDAH ada di browser. Rentang
  // tanggalnya sendiri sudah disaring backend, jadi tidak difilter ulang di sini.
  const q = search.trim().toLowerCase()
  const cleaningFiltered = useMemo(() => {
    if (!q) return cleaning
    return cleaning.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        (o.code_transaction ?? "").toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        (o.room?.name ?? "").toLowerCase().includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q)),
    )
  }, [cleaning, q])
  const cleaningItems = useMemo(() => cleaningFiltered.filter((o) => o.status === "pencucian"), [cleaningFiltered])
  // Pisahkan cleaning: yang masih diproses vs riwayat (sudah selesai cuci & lanjut,
  // atau dibatalkan).
  const cleaningProses = useMemo(() => cleaningItems.filter((o) => o.stage_status === "proses"), [cleaningItems])
  const cleaningHistory = useMemo(
    () => cleaningItems.filter((o) => o.stage_status === "selesai" || o.stage_status === "batal"),
    [cleaningItems],
  )
  const cleaningActive = cleanView === "history" ? cleaningHistory : cleaningProses
  const packagingItems = useMemo(() => {
    if (!q) return packaging
    return packaging.filter(
      (o) =>
        // `code` null = batch masih antrean (record packaging belum dibuat).
        (o.code ?? "").toLowerCase().includes(q) ||
        (o.washing_code ?? "").toLowerCase().includes(q) ||
        (o.code_transaction ?? "").toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q)) ||
        o.units.some((u) => (u.code ?? "").toLowerCase().includes(q)),
    )
  }, [packaging, q])
  // Pisahkan batch packaging: yang masih perlu dikemas vs riwayat (sudah dikemas).
  const packagingPending = useMemo(
    () => packagingItems.filter((b) => b.stage_status !== "selesai"),
    [packagingItems],
  )
  const packagingHistory = useMemo(
    () => packagingItems.filter((b) => b.stage_status === "selesai"),
    [packagingItems],
  )
  const packagingActive = pkgView === "history" ? packagingHistory : packagingPending
  const sterilizationItems = useMemo(() => {
    if (!q) return sterilizePipeline
    return sterilizePipeline.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        // Nomor label & nama set — hasil scan mengisi kolom cari dengan barcode_no,
        // jadi keduanya WAJIB ikut dicocokkan agar kartunya tidak tersaring keluar.
        (o.barcode_no ?? "").toLowerCase().includes(q) ||
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.code_transaction ?? "").toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        o.units.some(
          (u) =>
            (u.code ?? "").toLowerCase().includes(q) ||
            (u.barcode_no ?? "").toLowerCase().includes(q),
        ),
    )
  }, [sterilizePipeline, q])
  // Pisahkan pipeline sterilisasi: siap-steril (tray, akan dibatch) & menunggu validasi.
  const sterProses = useMemo(
    () => sterilizationItems.filter((o) => o.kind === "ready" && o.reprocess !== true),
    [sterilizationItems],
  )
  // Validasi Hasil: batch STR yang masih diproses + unit gagal steril (antre re-proses)
  // — tab "Gagal Steril" dihapus, datanya digabung ke sini.
  const sterValidasi = useMemo(
    () =>
      sterilizationItems.filter(
        (o) => (o.kind === "batch" && o.sterilization?.status === "diproses") || o.reprocess === true,
      ),
    [sterilizationItems],
  )
  const sterHistory = useMemo(
    () => sterilizationItems.filter((o) => o.kind === "batch" && o.sterilization?.status !== "diproses"),
    [sterilizationItems],
  )
  const sterActive =
    sterView === "validasi"
      ? sterValidasi
      : sterView === "history"
        ? sterHistory
        : sterProses

  // Pagination tahap pipeline (tab non-produksi). Slice ber-tipe spesifik dihitung
  // di JSX agar props tiap Tab tidak ber-tipe union. Untuk tab Packaging & Sterilisasi,
  // jumlah & slice mengikuti sub-tampilan aktif.
  const activeCount =
    tab === "packaging"
      ? packagingActive.length
      : tab === "sterilization"
        ? sterActive.length
        : tab === "cleaning"
          ? cleaningActive.length
          : 0
  const pipelineLoading =
    tab === "sterilization" ? sterilizeLoading : tab === "packaging" ? packagingLoading : cleaningLoading
  const totalPages = Math.ceil(activeCount / ITEMS_PER_PAGE)
  const pageStart = (page - 1) * ITEMS_PER_PAGE

  /**
   * Satu hasil scan barcode. Divalidasi ke BACKEND lebih dulu supaya barcode yang
   * tidak dikenal — atau dikenal tapi tidak layak (sudah masuk batch, kemasannya
   * dibatalkan) — dijawab dengan alasan jelas lewat modal, bukan sekadar tidak
   * bereaksi. Label QR/barcode berisi nomornya apa adanya, jadi tidak perlu diurai.
   */
  async function handleScan(raw: string) {
    const code = raw.trim()
    if (!code || scanChecking) return

    // Kolom hanya menampilkan barcode yang baru dipindai. Daftar SENGAJA tidak
    // disaring — petugas tetap melihat seluruh antrean, dan kartu tujuannya
    // didatangi lewat auto-scroll di bawah.
    setScanInput(code)

    if (scannedCodes.includes(code)) {
      toast.error(`Label "${code}" sudah tercentang.`)
      return
    }

    setScanChecking(true)
    try {
      const res = await api.post("/master/sterilization-pipeline/scan", { barcode_no: code })
      const label = res.data?.data as { barcode_no: string; name: string | null } | undefined

      const index = sterActive.findIndex((o) => o.barcode_no === code)
      if (index < 0) {
        setScanAlert({
          title: "Label di luar daftar",
          message: `Label "${code}" valid, tetapi tidak ada di daftar yang sedang ditampilkan. Periksa rentang tanggal atau sub-tab yang aktif, lalu pindai ulang.`,
        })
        return
      }

      // Kartunya bisa berada di halaman pagination lain — pindah dulu ke halaman
      // yang memuatnya, baru digulirkan ke posisinya.
      setPage(Math.floor(index / ITEMS_PER_PAGE) + 1)
      setScannedCodes((prev) => [...prev, code])
      toast.success(`${label?.name ?? code} tercentang.`)
      // Kolom dikosongkan begitu tercentang → siap menerima barcode berikutnya.
      setScanInput("")

      // Dua frame: frame pertama menunggu React menggambar ulang daftar (termasuk
      // pindah halaman), frame kedua baru mencari elemennya.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document
            .getElementById(`ster-label-${code}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        }),
      )
    } catch (e) {
      setScanAlert({ title: "Barcode Tidak Dikenal", message: errMsg(e) })
    } finally {
      setScanChecking(false)
    }
  }

  // Kolom pencarian — difokuskan otomatis saat mode scan dinyalakan, lalu fokusnya
  // dijaga agar pindaian tidak nyasar ke elemen lain.
  const searchInputRef = useRef<HTMLInputElement>(null)

  /** Kembalikan fokus ke kolom scan pada frame berikutnya. */
  function refocusScanField() {
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  // Handler scan terbaru disimpan di ref supaya listener keyboard di bawah tidak
  // perlu dipasang ulang tiap render (isinya bergantung pada banyak state).
  const scanHandlerRef = useRef(handleScan)
  useEffect(() => {
    scanHandlerRef.current = handleScan
  })

  /**
   * Mode scan: kolom inputnya sengaja dikunci agar tidak bisa diketik manual, jadi
   * pindaian ditangkap di level dokumen. Scanner barcode berperilaku seperti
   * keyboard — mengetik cepat lalu menutup dengan Enter.
   */
  // Nyalakan mode scan → kolom pencarian langsung difokuskan. Tanpa ini fokus
  // tertinggal di kolom yang terakhir disentuh (mis. Dari Tanggal) dan seluruh
  // pindaian masuk ke sana.
  useEffect(() => {
    if (scanMode) searchInputRef.current?.focus()
  }, [scanMode])

  useEffect(() => {
    if (!scanMode) return

    let buffer = ""
    // Pindaian sebelumnya sudah selesai → karakter berikutnya memulai barcode BARU.
    let justScanned = false
    let debounce: ReturnType<typeof setTimeout> | null = null

    /** Proses isi buffer sebagai satu barcode utuh. */
    function flush() {
      if (debounce) {
        clearTimeout(debounce)
        debounce = null
      }
      const code = buffer
      buffer = ""
      justScanned = true
      if (code) scanHandlerRef.current(code)
    }

    function onKeyDown(e: KeyboardEvent) {
      // Jangan bajak ketikan saat pengguna mengisi form lain (mis. modal batch).
      // Kolom pencarian sendiri DIKECUALIKAN: di mode scan ia read-only dan memang
      // dipegang fokusnya, jadi pindaian justru harus ditangkap dari sana.
      const el = e.target as HTMLElement | null
      const isSearchField = el != null && el === searchInputRef.current
      if (
        !isSearchField &&
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
        return

      // Scanner yang mengirim Enter langsung diproses tanpa menunggu jeda.
      // `preventDefault` di sini penting: tanpa itu Enter akan mengaktifkan
      // elemen yang sedang fokus (link/tombol) dan halaman bisa berpindah.
      if (e.key === "Enter") {
        e.preventDefault()
        flush()
        // Fokus dikembalikan ke kolom scan bila sempat berpindah.
        refocusScanField()
        return
      }
      if (e.key === "Backspace") {
        buffer = buffer.slice(0, -1)
        setScanInput(buffer)
        return
      }
      if (e.key.length === 1) {
        // Karakter pertama setelah pindaian sebelumnya mengganti isi kolom,
        // bukan menyambungnya.
        buffer = justScanned ? e.key : buffer + e.key
        justScanned = false
        setScanInput(buffer)

        // Scanner yang TIDAK mengirim Enter tetap terproses: sesaat setelah
        // karakter terakhir, isi buffer dianggap satu barcode utuh. Timer di-reset
        // tiap karakter — scanner mengetik dalam hitungan milidetik, jadi 200 ms
        // sudah cukup aman tanpa memotong pindaian yang masih berjalan.
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(flush, 200)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      if (debounce) clearTimeout(debounce)
    }
  }, [scanMode])

  function changeTab(next: ProduksiTab) {
    setTab(next)
    setPage(1)
    // Selalu buka sub-tampilan pertama tiap ganti tab (mis. Proses Cleaning, bukan History).
    setCleanView("proses")
    setPkgView("pending")
    setSterView("proses")
    // Bersihkan sisa pencarian & pindaian: kata kunci tab lama tidak relevan di tab
    // baru, dan mode scan hanya berlaku di tahap Sterilisasi.
    setSearch("")
    setScanMode(false)
    setScanInput("")
    setScannedCodes([])
    setScanAlert(null)
    // Catat tab aktif di URL: /cssd/produksi (form) atau /cssd/produksi?tab=cleaning.
    // Pakai history API, BUKAN router.replace: ganti tab murni state klien, sedangkan
    // router.replace memicu navigasi server (RSC round-trip + proxy) sehingga URL baru
    // berubah setelah request itu selesai. history.replaceState memperbaruinya seketika
    // tanpa menjalankan ulang server — cara yang memang dianjurkan Next.js untuk ini.
    window.history.replaceState(null, '', next === 'produksi' ? '/cssd/produksi' : `/cssd/produksi?tab=${next}`)
  }

  // Pratinjau / zoom gambar instrumen/paket di daftar produksi.
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null)

  const [mode, setMode] = useState<AddMode>("satuan")
  const [lines, setLines] = useState<ProduksiLine[]>([])
  const [note, setNote] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [instruments, setInstruments] = useState<InstrumentType[]>([])
  const [catalogs, setCatalogs] = useState<PaketCatalog[]>([])

  // Pilihan & jumlah yang sedang diisi.
  const [pickId, setPickId] = useState("")
  const [pickQty, setPickQty] = useState("1")
  const [paketItems, setPaketItems] = useState<PaketItem[]>([])
  const [loadingPaket, setLoadingPaket] = useState(false)
  // Status muat opsi dropdown (untuk animasi loading di SelectSearch).
  const [instrumentsLoading, setInstrumentsLoading] = useState(true)
  const [catalogsLoading, setCatalogsLoading] = useState(true)

  useEffect(() => {
    let active = true
    // Muat semua jenis instrumen (endpoint paginate 20).
    ;(async () => {
      setInstrumentsLoading(true)
      try {
        const collected: InstrumentType[] = []
        let cur = 1
        let last = 1
        do {
          const res = await api.get("/master/instruments", { params: { page: cur } })
          const p = res.data.data
          collected.push(...p.data)
          last = p.last_page
          cur += 1
        } while (cur <= last && active)
        if (active) setInstruments(collected)
      } finally {
        if (active) setInstrumentsLoading(false)
      }
    })()
    // Daftar katalog paket.
    setCatalogsLoading(true)
    api
      .get("/master/instrument-catalogs", { params: { type: "paket" } })
      .then((res) => {
        if (active) setCatalogs(res.data.data.data)
      })
      .finally(() => {
        if (active) setCatalogsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Loading opsi sesuai mode aktif (satuan → instrumen, paket → katalog).
  const optionsLoading = mode === "satuan" ? instrumentsLoading : catalogsLoading

  const options = useMemo(
    () =>
      mode === "satuan"
        ? instruments.map((i) => ({ value: String(i.id), label: i.name }))
        : catalogs.map((c) => ({ value: String(c.id), label: c.name })),
    [mode, instruments, catalogs],
  )

  // Pindah mode → reset pilihan yang sedang diisi.
  function switchMode(m: AddMode) {
    setMode(m)
    setPickId("")
    setPickQty("1")
    setPaketItems([])
  }

  // Saat paket dipilih, muat rincian isinya (informasi untuk operator).
  async function handlePick(value: string) {
    setPickId(value)
    if (mode !== "paket" || !value) {
      setPaketItems([])
      return
    }
    setLoadingPaket(true)
    try {
      const res = await api.get(`/master/instrument-catalogs/${value}`)
      setPaketItems(res.data.data.items ?? [])
    } finally {
      setLoadingPaket(false)
    }
  }

  // Tambah / akumulasi baris. Jenis/paket yang sama digabung jumlahnya.
  function addLine() {
    const qty = Number(pickQty)
    if (!pickId || !qty || qty <= 0) return
    const src = mode === "satuan" ? instruments : catalogs
    const picked = src.find((x) => String(x.id) === pickId)
    if (!picked) return
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.type === mode && l.refId === picked.id)
      if (idx === -1)
        return [
          ...prev,
          {
            type: mode,
            refId: picked.id,
            name: picked.name,
            quantity: String(qty),
            image: picked.image_url ?? null,
            // Simpan rincian isi paket agar bisa ditampilkan sebagai detail di daftar.
            items: mode === "paket" ? paketItems : undefined,
          },
        ]
      const next = [...prev]
      next[idx] = { ...next[idx], quantity: String((Number(next[idx].quantity) || 0) + qty) }
      return next
    })
    setPickId("")
    setPickQty("1")
    setPaketItems([])
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function setLineQty(index: number, value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: value } : l)))
  }


  async function submit() {
    if (saving) return
    if (lines.length === 0) {
      setFormError("Tambahkan minimal satu jenis instrumen / paket.")
      return
    }
    const items = lines.map((l) => ({
      type: l.type,
      quantity: Number(l.quantity) || 0,
      ...(l.type === "satuan"
        ? { instrument_id: l.refId }
        : { instrument_catalog_id: l.refId, package_name: l.name }),
    }))
    if (items.some((it) => !it.quantity || it.quantity <= 0)) {
      setFormError("Jumlah tiap baris harus lebih dari 0.")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await api.post("/master/production", { items, note: note.trim() || null })
      setLines([])
      setNote("")
      // Batch baru langsung berstatus pencucian → tandai data cleaning perlu di-refresh,
      // lalu alihkan ke tab Cleaning (efek lazy-load akan memuat ulang datanya).
      dispatch(invalidateCleaning())
      changeTab("cleaning")
      toast.success(res.data?.message ?? "Batch produksi berhasil dibuat & masuk tahap Cleaning.")
    } catch (e) {
      const msg = errMsg(e)
      setFormError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produksi CSSD"
        subtitle="Start production & monitor the reprocessing stages: Cleaning → Inspection → Sterilization"
      />

      {/* Tab: form produksi baru + tahapan pipeline */}
      <Card className="p-0">
        <div className="flex gap-5 overflow-x-auto border-b border-gray-200 px-5 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              { key: "produksi", label: "Produksi Baru" },
              { key: "cleaning", label: "Cleaning & Disinfection" },
              { key: "packaging", label: "Inspection & Packaging" },
              { key: "sterilization", label: "Sterilization" },
            ] as { key: ProduksiTab; label: string }[]
          ).map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => changeTab(t.key)}
                className={
                  "relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors " +
                  (active
                    ? "border-[#075489] font-semibold text-[#075489]"
                    : "border-transparent font-medium text-gray-500 hover:text-gray-800")
                }
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Filter tahap pipeline: pencarian (frontend, instan) + rentang tanggal.
            Hanya rentang tanggal yang dikirim ke backend, jadi ia perlu ditekan
            "Terapkan" dulu — tiap perubahannya memicu request baru. */}
        {tab !== "produksi" && (
          <form onSubmit={applyFilter} className="px-5 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              {/* Pencarian: murni frontend — menyaring data yang sudah dimuat
                  langsung saat mengetik, tanpa menunggu tombol & tanpa request. */}
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="pipeline-search">Cari</Label>
                <div className="relative">
                  {/* Ikon kiri sekaligus indikator: berputar selama barcode
                      divalidasi ke backend. */}
                  {scanChecking ? (
                    <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#075489]" />
                  ) : scanMode ? (
                    <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#075489]" />
                  ) : (
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  )}
                  <Input
                    ref={searchInputRef}
                    id="pipeline-search"
                    // Mode scan: kolom dikunci (tidak bisa diketik manual) dan hanya
                    // menampilkan hasil pindaian yang ditangkap di level halaman.
                    value={scanMode ? scanInput : search}
                    // `readOnly`, BUKAN `disabled`: kolom tetap bisa memegang fokus
                    // sehingga ketikan scanner masuk ke sini — bukan bocor ke kolom
                    // tanggal di sebelahnya — tapi tetap tidak bisa diketik manual.
                    readOnly={scanMode}
                    onChange={(e) => {
                      // Isi kolom sudah diseleksi setelah pindaian, jadi ketikan /
                      // pindaian berikutnya otomatis menggantinya.
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                    onKeyDown={(e) => {
                      // Di luar mode scan kolom ini murni pencarian teks (tanpa
                      // validasi ke backend), jadi Enter cukup dicegah agar tidak
                      // ikut men-submit form filter tanggal.
                      if (e.key === "Enter") e.preventDefault()
                    }}
                    onBlur={(e) => {
                      // Selama mode scan, fokus yang lepas ke "tidak ke mana-mana"
                      // ditarik kembali ke sini — kalau dibiarkan, Enter dari scanner
                      // bisa mengaktifkan elemen lain dan halaman ikut berpindah.
                      // Perpindahan yang DISENGAJA (klik tombol / kolom lain, yang
                      // mengisi relatedTarget) tidak diganggu agar modal & form tetap
                      // bisa dipakai.
                      if (scanMode && !e.relatedTarget) refocusScanField()
                    }}
                    placeholder={
                      scanMode
                        ? "Menunggu pindaian barcode..."
                        : "Cari kode batch, nama set, atau kode unit..."
                    }
                    className={
                      "pl-9 " + (tab === "sterilization" ? "pr-28 " : "") +
                      (scanMode ? "border-[#075489] bg-[#075489]/5" : "")
                    }
                  />
                  {/* Tombol mode scan di DALAM kolom — hanya di tahap Sterilisasi,
                      karena di situlah label kemasan dipindai untuk dipilih. */}
                  {tab === "sterilization" && (
                    <button
                      type="button"
                      onClick={() => {
                        setScanMode((v) => !v)
                        setScanInput("")
                        setSearch("")
                        setPage(1)
                      }}
                      title={scanMode ? "Kembali ke pencarian teks" : "Aktifkan mode scan barcode"}
                      aria-pressed={scanMode}
                      className={
                        "absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors " +
                        (scanMode
                          ? "bg-[#075489] text-white hover:bg-[#075489]/90"
                          : "text-gray-500 hover:bg-gray-100")
                      }
                    >
                      <ScanLine className="h-3.5 w-3.5" />
                      Scan
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pipeline-date-from">Dari Tanggal</Label>
                <Input
                  id="pipeline-date-from"
                  type="date"
                  value={dateFromInput}
                  max={dateToInput || undefined}
                  onChange={(e) => setDateFromInput(e.target.value)}
                  className="sm:w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pipeline-date-to">Sampai Tanggal</Label>
                <Input
                  id="pipeline-date-to"
                  type="date"
                  value={dateToInput}
                  min={dateFromInput || undefined}
                  onChange={(e) => setDateToInput(e.target.value)}
                  className="sm:w-44"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
                  Terapkan
                </Button>
                {hasFilter && (
                  <Button type="button" variant="outline" onClick={resetFilter} className="shrink-0">
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </Card>

      {/* Konten tahap pipeline */}
      {tab !== "produksi" && (
        <Card className="p-4">
          {/* Sub-tampilan tab Cleaning: Proses Cleaning vs History Cleaning. */}
          {tab === "cleaning" && (
            <div className="mb-3 inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 p-0.5 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([
                { key: "proses" as const, label: "Proses Cleaning", count: cleaningProses.length },
                { key: "history" as const, label: "History", count: cleaningHistory.length },
              ]).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    setCleanView(v.key)
                    setPage(1)
                  }}
                  className={
                    "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors " +
                    (cleanView === v.key ? "bg-[#075489] text-white" : "text-gray-600 hover:bg-gray-100")
                  }
                >
                  {v.label} ({v.count})
                </button>
              ))}
            </div>
          )}
          {/* Sub-tampilan tab Packaging: Perlu Dikemas vs Riwayat (sudah dikemas). */}
          {tab === "packaging" && (
            <div className="mb-3 inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 p-0.5 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([
                { key: "pending" as const, label: "Proses Packaging", count: packagingPending.length },
                { key: "history" as const, label: "History", count: packagingHistory.length },
              ]).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    setPkgView(v.key)
                    setPage(1)
                  }}
                  className={
                    "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors " +
                    (pkgView === v.key
                      ? "bg-[#075489] text-white"
                      : "text-gray-600 hover:bg-gray-100")
                  }
                >
                  {v.label} ({v.count})
                </button>
              ))}
            </div>
          )}
          {/* Sub-tampilan tab Sterilisasi: Proses Steril / Validasi Hasil / History. */}
          {tab === "sterilization" && (
            <div className="mb-3 inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 p-0.5 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {([
                { key: "proses" as const, label: "Proses Steril", count: sterProses.length },
                { key: "validasi" as const, label: "Validasi Hasil", count: sterValidasi.length },
                { key: "history" as const, label: "History", count: sterHistory.length },
              ]).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    setSterView(v.key)
                    setPage(1)
                  }}
                  className={
                    "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors " +
                    (sterView === v.key ? "bg-[#075489] text-white" : "text-gray-600 hover:bg-gray-100")
                  }
                >
                  {v.label} ({v.count})
                </button>
              ))}
            </div>
          )}
          {pipelineLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
          ) : activeCount === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {q || dateFrom || dateTo
                ? "Tidak ada data yang cocok."
                : tab === "packaging"
                  ? pkgView === "history"
                    ? "Belum ada riwayat batch yang dikemas."
                    : "Belum ada batch yang perlu dikemas."
                  : tab === "sterilization"
                    ? sterView === "validasi"
                      ? "Tidak ada batch menunggu validasi."
                      : sterView === "history"
                        ? "Belum ada riwayat batch sterilisasi."
                        : "Belum ada batch siap disterilkan."
                    : tab === "cleaning"
                      ? cleanView === "history"
                        ? "Belum ada riwayat cleaning."
                        : "Belum ada batch pada tahap cleaning."
                      : "Belum ada order pada tahap ini."}
            </div>
          ) : (
            <>
              {tab === "cleaning" && (
                <CleaningTab
                  items={cleaningActive.slice(pageStart, pageStart + ITEMS_PER_PAGE)}
                  onChanged={refreshPipeline}
                  stage="cleaning"
                  // History: kartu ringkas — rincian dilihat dengan membuka kartunya.
                  compact={cleanView === "history"}
                />
              )}
              {tab === "packaging" && (
                <ProductionPackagingTab
                  items={packagingActive.slice(pageStart, pageStart + ITEMS_PER_PAGE)}
                  onChanged={refreshPipeline}
                />
              )}
              {tab === "sterilization" && (
                <ProductionSterilizationTab
                  items={sterActive.slice(pageStart, pageStart + ITEMS_PER_PAGE)}
                  onChanged={refreshPipeline}
                  // Label hasil scan ikut tercentang di dalam tab; membatalkannya
                  // dari sana mengembalikan kabar ke sini.
                  scannedCodes={scannedCodes}
                  onScanRemove={(code) => setScannedCodes((prev) => prev.filter((c) => c !== code))}
                  onScanClear={() => setScannedCodes([])}
                />
              )}
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={activeCount}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setPage}
              />
            </>
          )}
        </Card>
      )}

      {/* Form produksi baru */}
      {tab === "produksi" && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Form tambah baris */}
        <Card className="space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">Tambah Alat untuk Diproduksi</h2>
          </div>

          {/* Mode satuan / paket */}
          <div className="flex gap-2">
            {(["satuan", "paket"] as AddMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium " +
                  (mode === m
                    ? "border-[#075489] bg-[#075489]/8 text-[#075489]"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50")
                }
              >
                {m === "satuan" ? "Satuan" : "Paket / Set"}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>{mode === "satuan" ? "Jenis Instrumen" : "Paket / Set Instrumen"}</Label>
            <SelectSearch
              options={options}
              value={pickId}
              onChange={handlePick}
              loading={optionsLoading}
              placeholder={mode === "satuan" ? "Cari instrumen..." : "Cari paket..."}
            />
          </div>

          {/* Rincian isi paket (informasi) */}
          {mode === "paket" && pickId && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
              {loadingPaket ? (
                <span className="text-gray-400">Memuat isi paket...</span>
              ) : paketItems.length === 0 ? (
                <span className="text-gray-400">Paket tidak memiliki rincian isi.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {paketItems.map((it) => (
                    <span key={it.instrument_id} className="rounded bg-white px-1.5 py-0.5 text-gray-600 ring-1 ring-gray-200">
                      {it.instrument?.name ?? `#${it.instrument_id}`} ×{it.quantity}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="w-24 space-y-1.5">
              <Label htmlFor="prod-qty">Jumlah</Label>
              <Input
                id="prod-qty"
                type="number"
                min={1}
                value={pickQty}
                onChange={(e) => setPickQty(e.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={addLine}
              disabled={!pickId || !(Number(pickQty) > 0)}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              Tambah
            </Button>
          </div>
        </Card>

        {/* Daftar baris + submit */}
        <Card className="flex flex-col p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800">Daftar Produksi</h2>
            </div>
            {lines.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-[#075489]/10 px-2.5 py-1 text-xs font-semibold text-[#075489]">
                {lines.length} jenis
              </span>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-14 text-center">
              <p className="text-sm text-gray-400">Belum ada alat. Tambahkan dari panel kiri.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {lines.map((l, i) => {
                const sets = Number(l.quantity) || 0
                const isPaket = l.type === "paket"
                return (
                  <div
                    key={`${l.type}-${l.refId}`}
                    className={
                      "group relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
                      (isPaket ? "border-[#4ba69d]/30" : "border-[#075489]/20")
                    }
                  >
                    {/* Aksen warna kiri sesuai tipe (paket = teal, satuan = biru). */}
                    <span
                      className={"absolute inset-y-0 left-0 w-1 " + (isPaket ? "bg-[#4ba69d]" : "bg-[#075489]")}
                    />
                    <div className="flex items-center gap-3 py-2.5 pl-4 pr-3">
                      {/* Gambar instrumen/paket (klik untuk zoom; fallback: nomor urut baris). */}
                      {l.image ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ src: l.image!, name: l.name })}
                          title="Lihat gambar"
                          className={
                            "group/thumb relative h-10 w-10 shrink-0 cursor-zoom-in overflow-hidden rounded-lg ring-1 transition hover:ring-2 " +
                            (isPaket ? "ring-[#4ba69d]/30 hover:ring-[#4ba69d]/60" : "ring-[#075489]/20 hover:ring-[#075489]/50")
                          }
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={l.image} alt={l.name} className="h-full w-full object-cover" />
                          <span className="absolute inset-0 hidden items-center justify-center bg-black/30 text-white group-hover/thumb:flex">
                            <ZoomIn className="h-4 w-4" />
                          </span>
                        </button>
                      ) : (
                        <span
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white " +
                            (isPaket ? "bg-[#4ba69d]" : "bg-[#075489]")
                          }
                        >
                          {i + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-800">{l.name}</span>
                          <Badge variant={isPaket ? "info" : "default"}>{isPaket ? "Paket" : "Satuan"}</Badge>
                        </div>

                        {/* Detail isi paket: instrumen × total unit (per-set × jumlah set) */}
                        {isPaket && l.items && l.items.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                              <Package className="h-3 w-3" /> Isi:
                            </span>
                            {l.items.map((it) => (
                              <span
                                key={it.instrument_id}
                                className="rounded-md bg-[#4ba69d]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#4ba69d] ring-1 ring-[#4ba69d]/20"
                              >
                                {it.instrument?.name ?? `#${it.instrument_id}`} ×{it.quantity * sets}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => setLineQty(i, e.target.value)}
                          className="h-9 w-16 text-center font-semibold"
                        />
                        <span className="w-6 text-[11px] text-gray-400">{isPaket ? "set" : "unit"}</span>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="prod-note">Catatan (opsional)</Label>
            <Textarea
              id="prod-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              onClick={submit}
              disabled={saving || lines.length === 0}
              className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white shadow-sm"
            >
              {saving ? "Memproses..." : "Mulai Produksi"}
            </Button>
          </div>
        </Card>
      </div>
      )}

      {/* Pratinjau / zoom gambar instrumen/paket */}
      <Modal
        open={previewImage !== null}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.name ?? "Gambar"}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setPreviewImage(null)}>
            Tutup
          </Button>
        }
      >
        {previewImage && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="max-h-[70vh] w-auto rounded-lg object-contain"
            />
          </div>
        )}
      </Modal>

      {/* Alert hasil scan barcode yang ditolak backend (tidak dikenal / tidak layak) */}
      <Modal
        open={scanAlert !== null}
        onClose={() => setScanAlert(null)}
        title={scanAlert?.title ?? "Barcode Tidak Dikenal"}
        size="sm"
        footer={
          <Button
            onClick={() => setScanAlert(null)}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            Mengerti
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <p className="pt-2 text-sm leading-relaxed text-gray-600">{scanAlert?.message}</p>
        </div>
      </Modal>
    </div>
  )
}

/**
 * Bungkus dengan Suspense karena `useSearchParams` (baca tab dari URL) memaksa
 * client-side rendering hingga boundary terdekat saat prerender.
 */
export default function ProduksiCssdPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ProduksiCssdPage />
    </Suspense>
  )
}

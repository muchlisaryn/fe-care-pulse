"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Factory, Plus, Trash2, Boxes, Package, Search } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { fetchCleaning } from "@/lib/store/slices/cleaningSlice"
import { fetchSterilizePipeline } from "@/lib/store/slices/sterilizePipelineSlice"
import { CleaningTab } from "@/components/molecules/CleaningTab"
import { PackagingTab } from "@/components/molecules/PackagingTab"
import { SterilizationTab } from "@/components/molecules/SterilizationTab"
import api from "@/lib/axios"

// Tab halaman Produksi CSSD: form produksi + tahapan pipeline reprocessing.
type ProduksiTab = "produksi" | "cleaning" | "packaging" | "sterilization"
const ITEMS_PER_PAGE = 20

// Jenis instrumen (master) — untuk produksi satuan.
type InstrumentType = { id: number; code: string; name: string }
// Katalog paket/set instrumen (Master › Set Instrumen, tipe `paket`).
type PaketCatalog = { id: number; code: string; name: string }
// Rincian isi paket (jenis instrumen + jumlah per set).
type PaketItem = { instrument_id: number; quantity: number; instrument?: { name: string } | null }

type AddMode = "satuan" | "paket"

// Satu baris produksi yang akan dikirim ke pipeline Cleaning.
type ProduksiLine = {
  type: AddMode
  refId: number // instrument_id (satuan) / instrument_catalog_id (paket)
  name: string
  quantity: string // teks agar boleh kosong sementara; divalidasi saat submit
  items?: PaketItem[] // rincian isi paket (untuk type `paket`) — ditampilkan sebagai detail
}

function errMsg(e: unknown): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? "Terjadi kesalahan."
}

/**
 * Produksi CSSD — awal lifecycle. CSSD memproses stok alat miliknya sendiri:
 * pilih jenis/paket + jumlah, lalu "Mulai Produksi" membuat batch internal yang
 * langsung masuk tahap Cleaning (lanjut ke Inspection → Sterilization → Storage).
 */
const PRODUKSI_TABS: ProduksiTab[] = ["produksi", "cleaning", "packaging", "sterilization"]

function ProduksiCssdPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dispatch = useAppDispatch()

  // Tab aktif: form produksi atau salah satu tahap pipeline. Disinkronkan ke URL
  // (?tab=cleaning) agar tiap tahap punya URL sendiri & bisa di-deep-link.
  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState<ProduksiTab>(
    PRODUKSI_TABS.includes(tabParam as ProduksiTab) ? (tabParam as ProduksiTab) : "produksi",
  )
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")

  // Data pipeline (tahap Cleaning/Packaging/Sterilization) — sama seperti dulu di
  // Tracking Order, kini dipantau dari halaman Produksi.
  const cleaning = useAppSelector((s) => s.cleaning.items)
  const cleaningLoading = useAppSelector((s) => s.cleaning.loading)
  const sterilizePipeline = useAppSelector((s) => s.sterilizePipeline.items)
  const sterilizeLoading = useAppSelector((s) => s.sterilizePipeline.loading)

  useEffect(() => {
    dispatch(fetchCleaning())
    dispatch(fetchSterilizePipeline())
  }, [dispatch])

  function refreshPipeline() {
    dispatch(fetchCleaning())
    dispatch(fetchSterilizePipeline())
  }

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
  const packagingItems = useMemo(() => cleaningFiltered.filter((o) => o.status === "pengemasan"), [cleaningFiltered])
  const sterilizationItems = useMemo(() => {
    if (!q) return sterilizePipeline
    return sterilizePipeline.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        (o.code_transaction ?? "").toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        (o.room?.name ?? "").toLowerCase().includes(q) ||
        o.units.some((u) => (u.code ?? "").toLowerCase().includes(q)),
    )
  }, [sterilizePipeline, q])

  const tabCount: Record<ProduksiTab, number> = {
    produksi: 0, // badge tidak ditampilkan untuk tab form
    cleaning: cleaningItems.length,
    packaging: packagingItems.length,
    sterilization: sterilizationItems.length,
  }

  // Pagination tahap pipeline (tab non-produksi). Slice ber-tipe spesifik dihitung
  // di JSX agar props tiap Tab tidak ber-tipe union.
  const activeCount = tabCount[tab]
  const pipelineLoading = tab === "sterilization" ? sterilizeLoading : cleaningLoading
  const totalPages = Math.ceil(activeCount / ITEMS_PER_PAGE)
  const pageStart = (page - 1) * ITEMS_PER_PAGE

  function changeTab(next: ProduksiTab) {
    setTab(next)
    setPage(1)
    // Catat tab aktif di URL: /cssd/produksi (form) atau /cssd/produksi?tab=cleaning
    router.replace(next === "produksi" ? "/cssd/produksi" : `/cssd/produksi?tab=${next}`, { scroll: false })
  }

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

  useEffect(() => {
    let active = true
    // Muat semua jenis instrumen (endpoint paginate 20).
    ;(async () => {
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
    })()
    // Daftar katalog paket.
    api
      .get("/master/instrument-catalogs", { params: { type: "paket" } })
      .then((res) => {
        if (active) setCatalogs(res.data.data.data)
      })
    return () => {
      active = false
    }
  }, [])

  const options = useMemo(
    () =>
      mode === "satuan"
        ? instruments.map((i) => ({ value: String(i.id), label: `${i.code ? `${i.code} — ` : ""}${i.name}` }))
        : catalogs.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` })),
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
      await api.post("/master/production", { items, note: note.trim() || null })
      setLines([])
      setNote("")
      // Batch baru langsung berstatus pencucian → muat ulang & alihkan ke tab Cleaning.
      refreshPipeline()
      changeTab("cleaning")
    } catch (e) {
      setFormError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produksi CSSD"
        subtitle="Mulai produksi & pantau tahap reprocessing: Cleaning → Inspection → Sterilization"
      />

      {/* Tab: form produksi baru + tahapan pipeline */}
      <Card className="p-0">
        <div className="flex flex-wrap gap-6 border-b border-gray-200 px-5 pt-4">
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
                  "relative -mb-px flex items-center gap-2 border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors " +
                  (active
                    ? "border-[#075489] font-semibold text-[#075489]"
                    : "border-transparent font-medium text-gray-500 hover:text-gray-800")
                }
              >
                {t.label}
                {t.key !== "produksi" && (
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                      (active ? "bg-[#075489]/10 text-[#075489]" : "bg-gray-100 text-gray-500")
                    }
                  >
                    {tabCount[t.key]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Pencarian untuk tahap pipeline */}
        {tab !== "produksi" && (
          <div className="px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Cari kode order / peminjam / ruangan / alat..."
                className="pl-9"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Konten tahap pipeline */}
      {tab !== "produksi" && (
        <Card className="p-4">
          {pipelineLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
          ) : activeCount === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {q ? "Tidak ada data yang cocok." : "Belum ada order pada tahap ini."}
            </div>
          ) : (
            <>
              {tab === "cleaning" && (
                <CleaningTab
                  items={cleaningItems.slice(pageStart, pageStart + ITEMS_PER_PAGE)}
                  onChanged={refreshPipeline}
                  stage="cleaning"
                />
              )}
              {tab === "packaging" && (
                <PackagingTab
                  items={packagingItems.slice(pageStart, pageStart + ITEMS_PER_PAGE)}
                  onChanged={refreshPipeline}
                />
              )}
              {tab === "sterilization" && (
                <SterilizationTab
                  items={sterilizationItems.slice(pageStart, pageStart + ITEMS_PER_PAGE)}
                  onChanged={refreshPipeline}
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
            <Factory className="h-4 w-4 text-[#075489]" />
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
                {m === "satuan" ? <Boxes className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
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
              <Plus className="mr-1 h-4 w-4" />
              Tambah
            </Button>
          </div>
        </Card>

        {/* Daftar baris + submit */}
        <Card className="flex flex-col p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#075489]/10 text-[#075489]">
                <Boxes className="h-4 w-4" />
              </span>
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
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-300">
                <Boxes className="h-6 w-6" />
              </span>
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
                      {/* Nomor urut baris. */}
                      <span
                        className={
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white " +
                          (isPaket ? "bg-[#4ba69d]" : "bg-[#075489]")
                        }
                      >
                        {i + 1}
                      </span>
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
              placeholder="mis. Produksi rutin pagi"
            />
          </div>

          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-gray-400">Masuk tahap Cleaning</span>
            <Button
              type="button"
              onClick={submit}
              disabled={saving || lines.length === 0}
              className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white shadow-sm"
            >
              <Factory className="mr-1.5 h-4 w-4" />
              {saving ? "Memproses..." : "Mulai Produksi"}
            </Button>
          </div>
        </Card>
      </div>
      )}
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

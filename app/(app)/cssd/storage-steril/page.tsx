"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Warehouse,
  Search,
  CalendarClock,
  AlertTriangle,
  MapPin,
  Boxes,
  ChevronDown,
  ChevronRight,
  ZoomIn,
  X,
} from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { LoadMoreSentinel } from "@/components/molecules/LoadMoreSentinel"
import { RackPickerModal } from "@/components/molecules/RackPickerModal"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchStorageIncoming,
  fetchProductionStorageIncoming,
  fetchStorageInventory,
  fetchStorageSummary,
  invalidateStorage,
  type StorageIncomingOrder,
  type StorageIncomingUnit,
  type StorageInventoryRow,
} from "@/lib/store/slices/storageSlice"
import api from "@/lib/axios"

type StorageTab = "simpan" | "inventaris"

// Kelompok unit pada modal simpan ke rak: tiap paket = satu grup (satu lokasi
// rak untuk seluruh paket); tiap instrumen satuan = grup berisi satu unit.
type StoreUnitGroup = {
  key: string
  source: "satuan" | "paket"
  packageName: string | null
  /** Nomor label kemasan bungkus steril grup ini (satu label = satu bungkus). */
  barcodeNo: string | null
  units: StorageIncomingUnit[]
}

// Judul grup pada modal simpan: paket → nama paket, satuan → nama instrumen.
function groupTitle(g: StoreUnitGroup): string {
  return (g.source === "paket" ? g.packageName : g.units[0]?.instrument) ?? "—"
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

const STORAGE_TABS: StorageTab[] = ["simpan", "inventaris"]

function StorageSterilPage() {
  const dispatch = useAppDispatch()
  const searchParams = useSearchParams()
  const { incoming, productionIncoming, inventory, summary } = useAppSelector((s) => s.storage)

  // Gabungan order steril + batch produksi steril (yang belum tersimpan penuh)
  // untuk daftar "Perlu Disimpan". Order sudah otomatis keluar saat digudang;
  // batch produksi disaring di sini karena statusnya tidak berpindah.
  const incomingAll = useMemo(
    () => [...incoming.items, ...productionIncoming.items.filter((o) => o.stored_count < o.unit_count)],
    [incoming.items, productionIncoming.items],
  )

  // Tab aktif disinkronkan ke URL (?tab=inventaris) agar bisa di-deep-link & bertahan
  // saat refresh. Tab default "simpan" (URL tanpa query).
  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState<StorageTab>(
    STORAGE_TABS.includes(tabParam as StorageTab) ? (tabParam as StorageTab) : "simpan",
  )
  function changeTab(next: StorageTab) {
    setTab(next)
    // history.replaceState (bukan router) → URL berubah seketika tanpa navigasi server.
    window.history.replaceState(
      null,
      "",
      next === "simpan" ? "/cssd/storage-steril" : `/cssd/storage-steril?tab=${next}`,
    )
  }
  // Pencarian dijalankan di SERVER (data dimuat bertahap, jadi tak bisa disaring
  // di klien): `searchInput` draft di kotak isian, `search` yang sudah dikirim.
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  // Inventaris: pengelompokan + status lipat per grup.
  const [groupBy, setGroupBy] = useState<"rak" | "batch">("rak")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  // Paket yang detail isinya sedang dibuka di inventaris.
  const [openPkt, setOpenPkt] = useState<Set<string>>(new Set())
  const togglePkt = (key: string) =>
    setOpenPkt((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Modal simpan ke rak.
  const [active, setActive] = useState<StorageIncomingOrder | null>(null)
  const [rackById, setRackById] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Foto instrumen yang sedang di-zoom (klik thumbnail) — null = tidak ada.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)
  // Pilihan lokasi rak dari Master Rak (untuk dropdown saat simpan ke gudang).
  const [rackOptions, setRackOptions] = useState<{ id: number; name: string }[]>([])
  // Status muat pilihan rak (animasi loading dropdown) + penanda sudah dimuat.
  const [rackOptionsLoading, setRackOptionsLoading] = useState(false)
  const rackLoadedRef = useRef(false)
  // Rak yang dipilih untuk SEMUA grup sekaligus (tombol "Pilih Rak (Semua)").
  const [bulkRack, setBulkRack] = useState("")
  // Target tombol "Pilih Rak" yang sedang dibuka: satu grup instrumen, atau
  // "semua" (isi otomatis seluruh batch). null = modal pemilih rak tertutup.
  const [pickerTarget, setPickerTarget] = useState<{ type: "all" } | { type: "group"; key: string } | null>(null)
  const [scanNotice, setScanNotice] = useState<string | null>(null)

  // Angka kartu statistik diambil dari endpoint ringkasan (bukan menghitung
  // seluruh baris di klien) supaya daftarnya bisa dimuat bertahap.
  useEffect(() => {
    dispatch(fetchStorageSummary())
  }, [dispatch])

  // LAZY LOAD: tiap tab hanya mengambil HALAMAN PERTAMA saat tab itu dibuka
  // (atau saat kata kunci pencarian berubah). Halaman berikutnya menyusul lewat
  // pengamat scroll di dasar daftar.
  useEffect(() => {
    if (tab === "simpan") {
      dispatch(fetchStorageIncoming({ page: 1, search }))
      dispatch(fetchProductionStorageIncoming({ page: 1, search }))
    } else {
      dispatch(fetchStorageInventory({ page: 1, search }))
    }
  }, [dispatch, tab, search])

  // Ambil halaman berikutnya daftar tab aktif. Untuk tab "Perlu Disimpan" ada dua
  // sumber (order & batch produksi) — order dihabiskan dulu, baru batch produksi.
  const loadMore = useCallback(() => {
    if (tab === "simpan") {
      if (incoming.loading || incoming.loadingMore || productionIncoming.loadingMore) return
      if (incoming.page < incoming.lastPage) {
        dispatch(fetchStorageIncoming({ page: incoming.page + 1, search }))
      } else if (productionIncoming.page < productionIncoming.lastPage) {
        dispatch(fetchProductionStorageIncoming({ page: productionIncoming.page + 1, search }))
      }
      return
    }
    if (inventory.loading || inventory.loadingMore) return
    if (inventory.page < inventory.lastPage) {
      dispatch(fetchStorageInventory({ page: inventory.page + 1, search }))
    }
  }, [dispatch, tab, search, incoming, productionIncoming, inventory])

  // Masih ada halaman berikutnya untuk tab aktif?
  const hasMore =
    tab === "simpan"
      ? incoming.page < incoming.lastPage || productionIncoming.page < productionIncoming.lastPage
      : inventory.page < inventory.lastPage
  const loadingMore =
    tab === "simpan" ? incoming.loadingMore || productionIncoming.loadingMore : inventory.loadingMore

  // Pengamat scroll: begitu penanda di dasar daftar terlihat, halaman berikutnya
  // diambil otomatis (infinite scroll). rootMargin → dimuat sedikit lebih awal.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
  }

  // Muat pilihan rak dari Master Rak — lazy, dipanggil saat tombol "Simpan ke Rak"
  // ditekan (bukan saat mount). Hanya di-fetch sekali (cache via ref).
  async function loadRackOptions() {
    if (rackLoadedRef.current || rackOptionsLoading) return
    setRackOptionsLoading(true)
    try {
      const res = await api.get("/master/racks/options")
      setRackOptions(res.data.data)
      rackLoadedRef.current = true
    } catch {
      // Abaikan — dropdown tetap kosong bila gagal memuat.
    } finally {
      setRackOptionsLoading(false)
    }
  }

  // Dipanggil setelah menyimpan ke rak: unit pindah dari "Perlu Disimpan" ke
  // "Inventaris". Daftar dimuat ulang dari halaman pertama + angka ringkasan;
  // inventaris hanya bila sudah pernah dimuat (tetap malas bila belum dibuka).
  function refresh() {
    dispatch(fetchStorageIncoming({ page: 1, search }))
    dispatch(fetchProductionStorageIncoming({ page: 1, search }))
    if (inventory.loaded) dispatch(fetchStorageInventory({ page: 1, search }))
    dispatch(fetchStorageSummary())
  }

  function openStore(order: StorageIncomingOrder) {
    // Muat pilihan rak saat modal "Simpan ke Rak" dibuka pertama kali.
    loadRackOptions()
    setActive(order)
    setError(null)
    setBulkRack("")
    const init: Record<number, string> = {}
    order.units.forEach((u) => {
      init[u.id] = u.rack_code ?? ""
    })
    setRackById(init)
  }

  // Unit modal dikelompokkan: paket (per package_name) jadi satu grup → satu rak.
  // Satuan dengan JENIS instrumen yang sama juga digabung jadi satu grup → satu rak
  // (karena akan disimpan di rak yang sama). Nomor label kemasan (barcode_no) ikut
  // jadi kunci: bungkus steril berbeda label = barang berbeda meski isinya sejenis.
  const unitGroups = useMemo<StoreUnitGroup[]>(() => {
    if (!active) return []
    const groups: StoreUnitGroup[] = []
    const byKey = new Map<string, StoreUnitGroup>()
    for (const u of active.units) {
      // Paket → gabung per nama paket; satuan → gabung per jenis instrumen.
      const name = u.source === "paket" ? u.package_name ?? "Paket" : u.instrument ?? `#${u.id}`
      const key = `${u.source}|${name}|${u.barcode_no ?? ""}`
      let g = byKey.get(key)
      if (!g) {
        g = {
          key,
          source: u.source,
          packageName: u.source === "paket" ? u.package_name ?? "Paket" : null,
          barcodeNo: u.barcode_no,
          units: [],
        }
        byKey.set(key, g)
        groups.push(g)
      }
      g.units.push(u)
    }
    return groups
  }, [active])

  // Set satu lokasi rak untuk semua unit (belum tersimpan) dalam satu grup/paket.
  function setGroupRack(group: StoreUnitGroup, value: string) {
    setRackById((prev) => {
      const next = { ...prev }
      group.units.forEach((u) => {
        if (!u.stored) next[u.id] = value
      })
      return next
    })
  }

  // Isi satu lokasi rak untuk SELURUH batch sekaligus (semua unit belum tersimpan).
  function setAllRack(value: string) {
    setBulkRack(value)
    setRackById((prev) => {
      const next = { ...prev }
      active?.units.forEach((u) => {
        if (!u.stored) next[u.id] = value
      })
      return next
    })
  }

  // Grup yang sedang jadi target modal "Pilih Rak" (null bila targetnya semua).
  const pickerGroup =
    pickerTarget?.type === "group" ? unitGroups.find((g) => g.key === pickerTarget.key) ?? null : null

  // Rak terpilih dari modal (hasil scan QR atau pilih manual) → isi ke grup
  // terkait, atau ke SELURUH batch bila tombol yang ditekan adalah "semua".
  function handleRackPicked(name: string) {
    if (!pickerTarget) return
    if (pickerTarget.type === "all") {
      setAllRack(name)
      setScanNotice(`Rak "${name}" → semua instrumen.`)
      return
    }
    if (!pickerGroup) return
    setGroupRack(pickerGroup, name)
    setScanNotice(`Rak "${name}" → ${groupTitle(pickerGroup)}.`)
  }

  // Tutup modal simpan + reset state pemilih rak sekaligus.
  function closeModal() {
    setPickerTarget(null)
    setScanNotice(null)
    setBulkRack("")
    setActive(null)
  }

  // Notifikasi scan hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!scanNotice) return
    const t = setTimeout(() => setScanNotice(null), 4000)
    return () => clearTimeout(t)
  }, [scanNotice])

  async function saveStorage() {
    if (!active || saving) return
    const items = active.units
      .filter((u) => !u.stored && (rackById[u.id] ?? "").trim())
      .map((u) => ({ instrument_stock_id: u.id, rack_code: rackById[u.id].trim() }))
    if (items.length === 0) {
      setError("Isi lokasi rak minimal satu unit yang belum tersimpan.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(active.store_url ?? `/master/orders/${active.id}/store`, { items })
      closeModal()
      dispatch(invalidateStorage())
      refresh()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  // Penyaringan dilakukan di server (lihat efek lazy load di atas); `q` hanya
  // penanda apakah pencarian sedang aktif untuk teks "tidak ditemukan".
  const q = search.trim()
  const incomingFiltered = incomingAll
  const inventoryFiltered = inventory.items

  // Kelompokkan inventaris (per rak / per order) agar ringkas & bisa dilipat.
  const inventoryGroups = useMemo(() => {
    const map = new Map<string, StorageInventoryRow[]>()
    for (const r of inventoryFiltered) {
      const key = groupBy === "rak" ? r.rack_code : r.batch ?? "Tanpa Batch"
      const arr = map.get(key) ?? []
      arr.push(r)
      map.set(key, arr)
    }
    return [...map.entries()]
      .map(([key, items]) => ({ key, items, alertCount: items.filter((i) => i.alert).length }))
      .sort((a, b) => a.key.localeCompare(b.key, "id", { numeric: true }))
  }, [inventoryFiltered, groupBy])


  // Satu baris unit di detail inventaris (dipakai untuk satuan & isi paket).
  function renderUnitRow(r: StorageInventoryRow) {
    return (
      <div
        key={r.id}
        className={
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-gray-50 px-4 py-2 text-sm last:border-0 " +
          (r.alert ? "bg-red-50/60" : "")
        }
      >
        {/* Kiri: identitas unit (foto + kode + nama instrumen) */}
        <div className="flex min-w-0 items-center gap-2">
          {r.unit.image_url && (
            <button
              type="button"
              onClick={() => setZoom({ url: r.unit.image_url as string, name: r.unit.instrument ?? r.unit.code ?? "Instrumen" })}
              title="Klik untuk perbesar"
              className="h-6 w-6 shrink-0 cursor-zoom-in overflow-hidden rounded border border-gray-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.unit.image_url}
                alt={r.unit.instrument ?? ""}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          )}
          <span className="shrink-0 font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
            {r.unit.code ?? `#${r.unit.id}`}
          </span>
          <span className="truncate text-gray-700">{r.unit.instrument ?? "—"}</span>
        </div>
        {/* Kanan: meta (rak/batch). Kedaluwarsa TIDAK diulang per unit — sama untuk
            seluruh isi bungkus, jadi cukup tampil sekali di kepala grup. */}
        <div className="flex flex-wrap items-center gap-2">
          {groupBy === "batch" && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />
              {r.rack_code}
            </span>
          )}
          {groupBy === "rak" && r.batch && <span className="font-mono text-xs text-gray-500">{r.batch}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage Steril"
        subtitle="Penyimpanan unit steril di rak gudang + pemantauan masa kedaluwarsa"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Unit di Gudang Steril" value={`${summary.total}`} icon={Warehouse} />
        <StatCard title="Mendekati Kedaluwarsa" value={`${summary.alert}`} icon={CalendarClock} positive={false} />
        <StatCard title="Sudah Kedaluwarsa" value={`${summary.expired}`} icon={AlertTriangle} positive={false} />
      </div>

      <Card className="p-0">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <div className="flex gap-5 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                // Angka dari server (total keseluruhan), bukan jumlah baris yang
                // kebetulan sudah dimuat — daftarnya bertambah sambil di-scroll.
                // null = tabnya belum pernah dibuka, jadi angkanya belum diketahui.
                {
                  key: "simpan",
                  label: "Perlu Disimpan",
                  count: incoming.loaded ? incoming.total + productionIncoming.total : null,
                },
                { key: "inventaris", label: "Inventaris Gudang", count: summary.total },
              ] as { key: StorageTab; label: string; count: number | null }[]
            ).map((t) => {
              const activeT = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => changeTab(t.key)}
                  className={
                    "relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors " +
                    (activeT
                      ? "border-[#075489] font-semibold text-[#075489]"
                      : "border-transparent font-medium text-gray-500 hover:text-gray-800")
                  }
                >
                  {t.label}
                  {t.count !== null && (
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                        (activeT ? "bg-[#075489]/10 text-[#075489]" : "bg-gray-100 text-gray-500")
                      }
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <form onSubmit={handleSearch} className="flex w-full gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={
                  tab === "simpan"
                    ? "Cari order / peminjam / ruangan..."
                    : "Cari kode unit, instrumen, rak, atau order..."
                }
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              Cari
            </Button>
          </form>
        </div>

        {tab === "simpan" ? (
          incoming.loading || (!incoming.loaded && !productionIncoming.loaded) ? (
            <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
          ) : incomingFiltered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {q ? "Tidak ada batch yang cocok." : "Belum ada order / batch steril yang perlu disimpan."}
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {incomingFiltered.map((order) => (
                <div
                  key={`${order.source ?? "order"}-${order.id}`}
                  className="rounded-lg border border-gray-200"
                >
                  <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {order.source === "produksi" ? `Batch ${order.code}` : (order.borrowed_by ?? "—")}
                          </span>
                          {order.source !== "produksi" && (
                            <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/10 px-2 py-0.5 rounded">
                              {order.code_transaction ?? order.code}
                            </span>
                          )}
                          {order.stored_count > 0 && order.stored_count < order.unit_count && (
                            <Badge variant="warning">
                              {order.stored_count}/{order.unit_count} tersimpan
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                          <span>{order.unit_count} unit</span>
                          <span>Kedaluwarsa: {formatDate(order.expiry_date)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openStore(order)}
                      className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90"
                    >
                      Simpan ke Rak
                    </button>
                  </div>
                </div>
              ))}
              {/* Penanda dasar daftar: memicu pengambilan halaman berikutnya. */}
              <LoadMoreSentinel ref={sentinelRef} hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
            </div>
          )
        ) : inventory.loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : inventoryFiltered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {q ? "Tidak ada unit yang cocok." : "Belum ada unit di gudang steril."}
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {/* Toolbar: pengelompokan agar tidak menampilkan terlalu banyak baris */}
            <div className="flex justify-end">
              <Select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as "rak" | "batch")}
                className="w-auto"
              >
                <option value="rak">Per Rak</option>
                <option value="batch">Per Batch</option>
              </Select>
            </div>

            <div className="space-y-2">
                {inventoryGroups.map((g) => {
                  const open = q ? true : expanded.has(g.key)
                  return (
                    <div key={g.key} className="overflow-hidden rounded-lg border border-gray-200">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-left hover:bg-gray-50"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                        )}
                        {groupBy === "rak" ? (
                          <MapPin className="h-4 w-4 shrink-0 text-[#075489]" />
                        ) : (
                          <Boxes className="h-4 w-4 shrink-0 text-[#075489]" />
                        )}
                        <span className="font-semibold text-gray-800">{g.key}</span>
                        <span className="text-xs text-gray-400">{g.items.length} unit</span>
                        {g.alertCount > 0 && (
                          <Badge variant="danger" className="ml-auto">
                            {g.alertCount} perlu perhatian
                          </Badge>
                        )}
                      </button>
                      {open && (
                        <div className="border-t border-gray-100">
                          {(() => {
                            // Kelompokkan sesuai bentuknya saat DIPRODUKSI: paket per nama
                            // paket, satuan per jenis instrumen — masing-masing dipisah lagi
                            // per batch produksi, karena bungkus steril berbeda batch adalah
                            // barang berbeda meski isinya sejenis.
                            const bundles = new Map<
                              string,
                              {
                                source: "satuan" | "paket"
                                name: string
                                productionCode: string | null
                                units: typeof g.items
                              }
                            >()
                            for (const r of g.items) {
                              const name =
                                r.source === "paket"
                                  ? r.package_name ?? "Paket"
                                  : r.unit.instrument ?? "Instrumen"
                              const key = `${r.source}|${name}|${r.production_code ?? ""}`
                              const b =
                                bundles.get(key) ??
                                {
                                  source: r.source,
                                  name,
                                  productionCode: r.production_code,
                                  units: [] as typeof g.items,
                                }
                              b.units.push(r)
                              bundles.set(key, b)
                            }

                            return [...bundles.entries()].map(([key, b]) => {
                              const pkey = `${g.key}::${key}`
                              const popen = q ? true : openPkt.has(pkey)
                              const isPaket = b.source === "paket"
                              // Kedaluwarsa berlaku untuk seluruh isi bungkus → wakili dengan
                              // unit paling awal kedaluwarsa, tampil sekali di kepala grup.
                              const soonest = b.units.reduce((a, u) =>
                                (u.days_to_expiry ?? Infinity) < (a.days_to_expiry ?? Infinity) ? u : a,
                              )
                              return (
                                <div key={pkey} className="border-b border-gray-50 last:border-0">
                                  <button
                                    type="button"
                                    onClick={() => togglePkt(pkey)}
                                    className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm hover:bg-gray-50"
                                  >
                                    {popen ? (
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                    )}
                                    <Badge variant={isPaket ? "info" : "default"}>
                                      {isPaket ? "Paket" : "Satuan"}
                                    </Badge>
                                    <span className="font-medium text-gray-800">{b.name}</span>
                                    {b.productionCode ? (
                                      <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded">
                                        {b.productionCode}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                    <span className="text-xs text-gray-400">{b.units.length} unit</span>
                                    <span className="ml-auto flex items-center gap-2">
                                      <span
                                        className={
                                          "text-xs " +
                                          (soonest.alert ? "font-semibold text-red-600" : "text-gray-500")
                                        }
                                      >
                                        {formatDate(soonest.expiry_date)}
                                      </span>
                                      {soonest.expired ? (
                                        <Badge variant="danger">Kedaluwarsa</Badge>
                                      ) : soonest.alert ? (
                                        <Badge variant="danger">{soonest.days_to_expiry}h lagi</Badge>
                                      ) : (
                                        <Badge variant="success">Di Gudang</Badge>
                                      )}
                                    </span>
                                  </button>
                                  {popen && <div className="bg-gray-50/40">{b.units.map(renderUnitRow)}</div>}
                                </div>
                              )
                            })
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

            {/* Penanda dasar daftar: memicu pengambilan halaman berikutnya. */}
            <LoadMoreSentinel ref={sentinelRef} hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
          </div>
        )}
      </Card>

      {/* Modal simpan ke rak */}
      <Modal
        open={active !== null}
        onClose={saving ? () => {} : closeModal}
        title="Simpan ke Gudang"
        size="xl"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex shrink-0 justify-end gap-2 sm:ml-auto">
              <Button variant="outline" onClick={closeModal} disabled={saving}>
                Batal
              </Button>
              <Button
                onClick={saveStorage}
                disabled={saving}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {saving ? "Menyimpan..." : "Simpan ke Gudang"}
              </Button>
            </div>
          </div>
        }
      >
        {active && (
          <div className="space-y-4">
            {/* Pengisian rak PER INSTRUMEN: klik "Pilih Rak" pada item yang dituju →
                modal terbuka berisi pilihan scan QR rak atau pilih manual dari daftar. */}
            {active.units.some((u) => !u.stored) && (
              <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                {/* Sejajar dengan kartu di bawahnya: keterangan melar di kiri,
                    tombol rak lebar tetap di kanan. */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-gray-800">
                    Tentukan lokasi rak untuk semua instrumen
                  </p>
                  {/* Pilih satu rak → isi otomatis ke SEMUA instrumen batch ini. */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPickerTarget({ type: "all" })}
                    className="w-full shrink-0 sm:w-52"
                    title="Pilih satu rak untuk semua instrumen batch ini"
                  >
                    <span className="truncate">{bulkRack ? `Semua: ${bulkRack}` : "Pilih Rak (Semua)"}</span>
                  </Button>
                </div>
                {scanNotice && (
                  <p className="text-xs text-gray-600">{scanNotice}</p>
                )}
              </div>
            )}

            {/* Daftar unit + rak. Satu rak per grup: paket per nama paket,
                satuan per jenis instrumen (unit sejenis disimpan di rak yang sama). */}
            <div className="space-y-2">
              {unitGroups.map((g) => {
                // Seluruh unit dalam grup disimpan di SATU rak.
                const firstUnstored = g.units.find((u) => !u.stored)
                const allStored = !firstUnstored
                const groupRack = firstUnstored ? rackById[firstUnstored.id] ?? "" : g.units[0]?.rack_code ?? ""
                const isPaket = g.source === "paket"
                const title = groupTitle(g)
                // Paket → gambar SET (katalog); satuan → gambar instrumen. Fallback komponen pertama.
                const photo = isPaket
                  ? g.units[0]?.package_image ?? g.units[0]?.image_url ?? null
                  : g.units[0]?.image_url ?? null
                return (
                  <div
                    key={g.key}
                    className={
                      "rounded-lg border px-3 py-2.5 transition-colors " +
                      (allStored
                        ? "border-gray-200"
                        : groupRack
                          ? "border-[#075489]/40 bg-[#075489]/5"
                          : "border-gray-200")
                    }
                  >
                    {/* Dua kolom sejajar: kiri identitas grup (melar), kanan aksi rak
                        dengan lebar tetap supaya rapi & sebaris antar kartu. */}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                      {/* Foto set/instrumen menggantikan ikon; klik untuk zoom. Fallback ke ikon bila tak ada foto. */}
                      {photo ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            // Jangan ikut memilih grup — ini cuma memperbesar foto.
                            e.stopPropagation()
                            setZoom({ url: photo, name: title ?? "Instrumen" })
                          }}
                          title="Klik untuk perbesar"
                          className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo}
                            alt={title ?? "Instrumen"}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                            <ZoomIn className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ) : (
                        <Boxes className="h-4 w-4 shrink-0 text-[#075489]" />
                      )}
                      {/* Hanya paket yang diberi badge; satuan langsung tampil nama instrumennya. */}
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {isPaket && <Badge variant="info">Paket</Badge>}
                        <span className="truncate text-sm font-medium text-gray-800">{title}</span>
                        {/* Nomor label kemasan yang tercetak di bungkus sterilnya. */}
                        {g.barcodeNo ? (
                          <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded">
                            {g.barcodeNo}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                        <span className="text-xs text-gray-400">{g.units.length} unit</span>
                      </div>
                      </div>
                      {/* Lokasi rak: tombol "Pilih Rak" → modal berisi scan QR atau
                          pilih manual. Grup yang sudah tersimpan tak bisa diubah. */}
                      <div className="w-full shrink-0 sm:w-52">
                        {allStored ? (
                          <div className="flex justify-start sm:justify-end">
                            <Badge variant="success">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {groupRack || "Tersimpan"}
                              </span>
                            </Badge>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPickerTarget({ type: "group", key: g.key })}
                            className={
                              "w-full " + (groupRack ? "border-[#075489] text-[#075489]" : "")
                            }
                            title="Pilih rak untuk item ini — scan QR atau pilih dari daftar"
                          >
                            <span className="truncate">{groupRack || "Pilih Rak"}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Kode unit hanya untuk paket (rincian isi set). Satuan cukup
                        nama instrumennya di header — tanpa kode. */}
                    {isPaket && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.units.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded"
                          title={u.code ?? undefined}
                        >
                          {u.image_url && (
                            <button
                              type="button"
                              onClick={(e) => {
                                // Jangan ikut memilih grup — ini cuma memperbesar foto.
                                e.stopPropagation()
                                setZoom({ url: u.image_url as string, name: u.instrument ?? u.code ?? "Instrumen" })
                              }}
                              title="Klik untuk perbesar"
                              className="h-4 w-4 shrink-0 cursor-zoom-in overflow-hidden rounded-sm border border-gray-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={u.image_url}
                                alt={u.instrument ?? ""}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          )}
                          {/* Isi paket ditampilkan dengan NAMA instrumen (dari
                              production_item), bukan kode unitnya. */}
                          {u.instrument ?? u.code ?? `#${u.id}`}
                        </span>
                      ))}
                    </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal pilih rak: scan QR pakai kamera ATAU pilih manual dari Master Rak. */}
      <RackPickerModal
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        racks={rackOptions}
        loading={rackOptionsLoading}
        value={
          pickerTarget?.type === "all"
            ? bulkRack
            : pickerGroup
              ? rackById[pickerGroup.units.find((u) => !u.stored)?.id ?? -1] ?? ""
              : ""
        }
        target={
          pickerTarget?.type === "all"
            ? "semua instrumen batch ini"
            : pickerGroup
              ? groupTitle(pickerGroup)
              : null
        }
        onSelect={handleRackPicked}
      />

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
    </div>
  )
}

/**
 * Bungkus dengan Suspense karena `useSearchParams` (baca tab dari URL) memaksa
 * client-side rendering hingga boundary terdekat saat prerender.
 */
export default function StorageSterilPageWrapper() {
  return (
    <Suspense fallback={null}>
      <StorageSterilPage />
    </Suspense>
  )
}

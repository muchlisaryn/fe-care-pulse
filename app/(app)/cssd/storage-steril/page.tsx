"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Warehouse,
  Search,
  ScanLine,
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
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchStorageIncoming,
  fetchProductionStorageIncoming,
  fetchStorageInventory,
  invalidateStorage,
  type StorageIncomingOrder,
  type StorageIncomingUnit,
} from "@/lib/store/slices/storageSlice"
import api from "@/lib/axios"

type StorageTab = "simpan" | "inventaris"

// Kelompok unit pada modal simpan ke rak: tiap paket = satu grup (satu lokasi
// rak untuk seluruh paket); tiap instrumen satuan = grup berisi satu unit.
type StoreUnitGroup = {
  key: string
  source: "satuan" | "paket"
  packageName: string | null
  units: StorageIncomingUnit[]
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

export default function StorageSterilPage() {
  const dispatch = useAppDispatch()
  const {
    incoming,
    incomingLoaded,
    productionIncoming,
    productionIncomingLoaded,
    inventory,
    inventoryLoading,
    inventoryLoaded,
  } = useAppSelector((s) => s.storage)

  // Gabungan order steril + batch produksi steril (yang belum tersimpan penuh)
  // untuk daftar "Perlu Disimpan". Order sudah otomatis keluar saat digudang;
  // batch produksi disaring di sini karena statusnya tidak berpindah.
  const incomingAll = useMemo(
    () => [...incoming, ...productionIncoming.filter((o) => o.stored_count < o.unit_count)],
    [incoming, productionIncoming],
  )

  const [tab, setTab] = useState<StorageTab>("simpan")
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

  // Modal simpan ke rak.
  const [active, setActive] = useState<StorageIncomingOrder | null>(null)
  const [rackById, setRackById] = useState<Record<number, string>>({})
  const [setAll, setSetAll] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Foto instrumen yang sedang di-zoom (klik thumbnail) — null = tidak ada.
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null)

  // Selalu segarkan saat halaman dibuka agar unit yang baru selesai disterilkan
  // langsung muncul (tanpa perlu refresh manual). Data cache tetap tampil seketika
  // sementara refetch berjalan di latar — spinner hanya tampil saat load pertama.
  useEffect(() => {
    dispatch(fetchStorageIncoming())
    dispatch(fetchProductionStorageIncoming())
    dispatch(fetchStorageInventory())
  }, [dispatch])

  function refresh() {
    dispatch(fetchStorageIncoming())
    dispatch(fetchProductionStorageIncoming())
    dispatch(fetchStorageInventory())
  }

  function openStore(order: StorageIncomingOrder) {
    setActive(order)
    setError(null)
    setSetAll("")
    const init: Record<number, string> = {}
    order.units.forEach((u) => {
      init[u.id] = u.rack_code ?? ""
    })
    setRackById(init)
  }

  function applyAll() {
    if (!active || !setAll.trim()) return
    setRackById((prev) => {
      const next = { ...prev }
      active.units.forEach((u) => {
        if (!u.stored) next[u.id] = setAll.trim()
      })
      return next
    })
  }

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
      setActive(null)
      dispatch(invalidateStorage())
      refresh()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  // Unit modal dikelompokkan: paket (per package_name) jadi satu grup → satu rak.
  // Satuan dengan JENIS instrumen yang sama juga digabung jadi satu grup → satu rak
  // (karena akan disimpan di rak yang sama).
  const unitGroups = useMemo<StoreUnitGroup[]>(() => {
    if (!active) return []
    const groups: StoreUnitGroup[] = []
    const byKey = new Map<string, StoreUnitGroup>()
    for (const u of active.units) {
      // Paket → gabung per nama paket; satuan → gabung per jenis instrumen.
      const key =
        u.source === "paket"
          ? `paket|${u.package_name ?? "Paket"}`
          : `satuan|${u.instrument ?? `#${u.id}`}`
      let g = byKey.get(key)
      if (!g) {
        g = {
          key,
          source: u.source,
          packageName: u.source === "paket" ? u.package_name ?? "Paket" : null,
          units: [],
        }
        byKey.set(key, g)
        groups.push(g)
      }
      g.units.push(u)
    }
    return groups
  }, [active])

  const q = search.trim().toLowerCase()
  const incomingFiltered = useMemo(() => {
    if (!q) return incomingAll
    return incomingAll.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        (o.code_transaction ?? "").toLowerCase().includes(q) ||
        (o.borrowed_by ?? "").toLowerCase().includes(q) ||
        (o.room?.name ?? "").toLowerCase().includes(q),
    )
  }, [incomingAll, q])

  const inventoryFiltered = useMemo(() => {
    if (!q) return inventory
    return inventory.filter(
      (r) =>
        r.rack_code.toLowerCase().includes(q) ||
        (r.unit.code ?? "").toLowerCase().includes(q) ||
        (r.unit.instrument ?? "").toLowerCase().includes(q) ||
        (r.order?.code ?? "").toLowerCase().includes(q),
    )
  }, [inventory, q])

  // Kelompokkan inventaris (per rak / per order) agar ringkas & bisa dilipat.
  const inventoryGroups = useMemo(() => {
    const map = new Map<string, typeof inventoryFiltered>()
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

  const alertCount = inventory.filter((r) => r.alert && !r.expired).length
  const expiredCount = inventory.filter((r) => r.expired).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage Steril"
        subtitle="Penyimpanan unit steril di rak gudang + pemantauan masa kedaluwarsa"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Unit di Gudang Steril" value={`${inventory.length}`} icon={Warehouse} />
        <StatCard title="Mendekati Kedaluwarsa" value={`${alertCount}`} icon={CalendarClock} positive={false} />
        <StatCard title="Sudah Kedaluwarsa" value={`${expiredCount}`} icon={AlertTriangle} positive={false} />
      </div>

      <Card className="p-0">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <div className="flex flex-wrap gap-6 border-b border-gray-200">
            {(
              [
                { key: "simpan", label: "Perlu Disimpan", count: incomingAll.length },
                { key: "inventaris", label: "Inventaris Gudang", count: inventory.length },
              ] as { key: StorageTab; label: string; count: number }[]
            ).map((t) => {
              const activeT = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={
                    "relative -mb-px flex items-center gap-2 border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors " +
                    (activeT
                      ? "border-[#075489] font-semibold text-[#075489]"
                      : "border-transparent font-medium text-gray-500 hover:text-gray-800")
                  }
                >
                  {t.label}
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                      (activeT ? "bg-[#075489]/10 text-[#075489]" : "bg-gray-100 text-gray-500")
                    }
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder={
                tab === "simpan"
                  ? "Cari order / peminjam / ruangan..."
                  : "Cari kode unit, instrumen, rak, atau order..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {tab === "simpan" ? (
          !incomingLoaded && !productionIncomingLoaded ? (
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
                  className="rounded-lg border border-gray-200 border-l-4 border-l-[#075489]"
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
            </div>
          )
        ) : inventoryLoading && !inventoryLoaded ? (
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
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50"
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
                          <Badge variant="danger" className="ml-1">
                            {g.alertCount} perlu perhatian
                          </Badge>
                        )}
                      </button>
                      {open && (
                        <div className="border-t border-gray-100">
                          {g.items.map((r) => (
                            <div
                              key={r.id}
                              className={
                                "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-50 px-4 py-2 text-sm last:border-0 " +
                                (r.alert ? "bg-red-50/60" : "")
                              }
                            >
                              <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                                {r.unit.code ?? `#${r.unit.id}`}
                              </span>
                              <span className="text-gray-700">{r.unit.instrument ?? "—"}</span>
                              {groupBy === "batch" && (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                  <MapPin className="h-3 w-3" />
                                  {r.rack_code}
                                </span>
                              )}
                              {groupBy === "rak" && r.batch && (
                                <span className="font-mono text-xs text-gray-500">{r.batch}</span>
                              )}
                              <span
                                className={
                                  "ml-auto text-xs " +
                                  (r.alert ? "font-semibold text-red-600" : "text-gray-500")
                                }
                              >
                                {formatDate(r.expiry_date)}
                              </span>
                              {r.expired ? (
                                <Badge variant="danger">Kedaluwarsa</Badge>
                              ) : r.alert ? (
                                <Badge variant="danger">{r.days_to_expiry}h lagi</Badge>
                              ) : (
                                <Badge variant="success">Di Gudang</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
          </div>
        )}
      </Card>

      {/* Modal simpan ke rak */}
      <Modal
        open={active !== null}
        onClose={saving ? () => {} : () => setActive(null)}
        title={active ? `Simpan ke Gudang — ${active.code_transaction ?? active.code}` : "Simpan ke Gudang"}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <span className="text-xs text-gray-400">
                Scan / isi lokasi rak tiap unit. Bila semua tersimpan, order masuk gudang steril.
              </span>
            )}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setActive(null)} disabled={saving}>
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
            {/* Set rak untuk semua unit sekaligus */}
            <div className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <Label htmlFor="rack-all">Scan / Isi Lokasi Rak untuk Semua Unit</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="rack-all"
                    value={setAll}
                    onChange={(e) => setSetAll(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        applyAll()
                      }
                    }}
                    placeholder=""
                    className="pl-9 font-mono"
                  />
                </div>
                <Button type="button" variant="outline" onClick={applyAll} disabled={!setAll.trim()}>
                  Terapkan
                </Button>
              </div>
            </div>

            {/* Daftar unit + rak. Satu rak per grup: paket per nama paket,
                satuan per jenis instrumen (unit sejenis disimpan di rak yang sama). */}
            <div className="space-y-2">
              {unitGroups.map((g) => {
                // Seluruh unit dalam grup disimpan di SATU rak.
                const firstUnstored = g.units.find((u) => !u.stored)
                const allStored = !firstUnstored
                const groupRack = firstUnstored ? rackById[firstUnstored.id] ?? "" : g.units[0]?.rack_code ?? ""
                const isPaket = g.source === "paket"
                const title = isPaket ? g.packageName : g.units[0]?.instrument ?? "—"
                // Paket → gambar SET (katalog); satuan → gambar instrumen. Fallback komponen pertama.
                const photo = isPaket
                  ? g.units[0]?.package_image ?? g.units[0]?.image_url ?? null
                  : g.units[0]?.image_url ?? null
                return (
                  <div key={g.key} className="rounded-lg border border-gray-200 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Foto set/instrumen menggantikan ikon; klik untuk zoom. Fallback ke ikon bila tak ada foto. */}
                      {photo ? (
                        <button
                          type="button"
                          onClick={() => setZoom({ url: photo, name: title ?? "Instrumen" })}
                          title="Klik untuk perbesar"
                          className="group relative h-7 w-7 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-gray-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo}
                            alt={title ?? "Instrumen"}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                            <ZoomIn className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ) : (
                        <Boxes className="h-4 w-4 shrink-0 text-[#075489]" />
                      )}
                      <Badge variant={isPaket ? "info" : "default"}>{isPaket ? "Paket" : "Satuan"}</Badge>
                      <span className="text-sm font-medium text-gray-800">{title}</span>
                      <span className="text-xs text-gray-400">{g.units.length} unit</span>
                      {/* Lokasi rak — sejajar dengan judul (di kanan), bukan di bawah. */}
                      <div className="ml-auto">
                        {allStored ? (
                          <Badge variant="success">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {groupRack || "Tersimpan"}
                            </span>
                          </Badge>
                        ) : (
                          <div className="relative w-44 sm:w-56">
                            <ScanLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                            <Input
                              value={groupRack}
                              onChange={(e) => setGroupRack(g, e.target.value)}
                              placeholder={isPaket ? "Lokasi rak paket" : "Lokasi rak"}
                              className="h-9 pl-8 font-mono text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.units.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded"
                          title={u.instrument ?? undefined}
                        >
                          {u.image_url && (
                            <button
                              type="button"
                              onClick={() => setZoom({ url: u.image_url as string, name: u.instrument ?? u.code ?? "Instrumen" })}
                              title="Klik untuk perbesar"
                              className="h-4 w-4 shrink-0 cursor-zoom-in overflow-hidden rounded-sm border border-gray-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u.image_url} alt={u.instrument ?? ""} className="h-full w-full object-cover" />
                            </button>
                          )}
                          {u.code ?? `#${u.id}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
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
    </div>
  )
}

"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  Search,
  MapPin,
  Boxes,
  ChevronDown,
  X,
  Flame,
} from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { LoadMoreSentinel } from "@/components/molecules/LoadMoreSentinel"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { ExpiryCard } from "@/components/molecules/ExpiryCard"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchStorageBmhpIncoming,
  fetchStorageBmhpInventory,
  type StorageBmhpIncomingBatch,
  type StorageBmhpIncomingUnit,
  type StorageBmhpInventoryRow,
} from "@/lib/store/slices/storageBmhpSlice"
import { useLanguage, localeOf, type Lang } from "@/lib/i18n"
import api from "@/lib/axios"
import { rupiah } from "@/lib/format"
import { Select } from "@/components/atoms/Select"

// Lazy load: modal pilih rak baru diunduh saat pertama kali dibuka.
const RackPickerModal = dynamic(() =>
  import("@/components/molecules/RackPickerModal").then((m) => m.RackPickerModal),
)


type StoreUnitGroup = {
  key: string
  source: "satuan" | "paket"
  packageName: string | null
  barcodeNo: string | null
  units: StorageBmhpIncomingUnit[]
}

/** Satu baris tabel inventaris: satu nama BMHP (atau paket) + harga satuan di satu rak. */
type InventoryNameRow = {
  key: string
  rack: string
  name: string
  isPaket: boolean
  /** Harga satuan (production_bmhp_item.price) — pembeda baris bila nama sama. */
  price: number
  items: StorageBmhpInventoryRow[]
}

/** Ada BMHP yang sudah kedaluwarsa atau mendekati kedaluwarsa (≤ 7 hari). */
function hasExpiryIssue(items: StorageBmhpInventoryRow[]): boolean {
  return items.some((r) => r.expired || r.alert)
}

/** Baris inventaris dikelompokkan per nomor label kemasan (paket: isi 1 set). */
function labelsOf(items: StorageBmhpInventoryRow[]): StorageBmhpInventoryRow[][] {
  const byLabel = new Map<string, StorageBmhpInventoryRow[]>()
  for (const r of items) {
    const key = r.barcode_no ?? `tanpa-label#${r.id}`
    byLabel.set(key, [...(byLabel.get(key) ?? []), r])
  }
  return [...byLabel.values()]
}

function groupTitle(
  g: StoreUnitGroup,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (g.source === "paket") return g.packageName ?? "—"
  const names = [...new Set(g.units.map((u) => u.instrument).filter(Boolean))] as string[]
  if (names.length === 0) return "—"
  return names.length === 1
    ? names[0]
    : `${names[0]} ${t("common.andMore", { n: names.length - 1 })}`
}

function formatDate(value: string | null, lang: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(localeOf(lang), { day: "2-digit", month: "short", year: "numeric" })
}


function errMsg(e: unknown, t: (key: string) => string): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? t("common.somethingWrong")
}

/** Judul bagian di halaman (Perlu Disimpan / Inventaris Gudang) + jumlah + aksi opsional. */
function SectionHeader({
  title,
  count,
  children,
}: {
  title: string
  count: number | null
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        {title}
        {count !== null && (
          <span className="rounded-full bg-[#075489]/10 px-1.5 py-0.5 text-sm font-semibold text-[#075489]">
            {count}
          </span>
        )}
      </h2>
      {children}
    </div>
  )
}

/** Kode siklus sterilisasi (mis. AUT01-191026-03) tempat BMHP ini disteril. */
function SterilCodeBadge({ code, title }: { code: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-amber-800"
    >
      <Flame className="h-3 w-3" />
      {code}
    </span>
  )
}

function StorageSterilBmhpPage() {
  const dispatch = useAppDispatch()
  const { t, lang } = useLanguage()
  const { incoming, inventory } = useAppSelector((s) => s.storageBmhp)

  const incomingAll = useMemo(
    () => incoming.items.filter((b) => b.stored_count < b.unit_count),
    [incoming.items],
  )

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  // Filter rak inventaris (id rak) — langsung diterapkan saat dipilih ("" = semua rak).
  const [rackFilter, setRackFilter] = useState("")

  // Modal simpan ke rak
  const [active, setActive] = useState<StorageBmhpIncomingBatch | null>(null)
  const [rackById, setRackById] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ variant: "success" | "error"; description: string } | null>(null)

  const [rackOptions, setRackOptions] = useState<{ id: number; name: string }[]>([])
  const [rackOptionsLoading, setRackOptionsLoading] = useState(false)
  const rackLoadedRef = useRef(false)
  const [bulkRack, setBulkRack] = useState("")
  const [pickerTarget, setPickerTarget] = useState<{ type: "all" } | { type: "group"; key: string } | null>(null)
  const [scanNotice, setScanNotice] = useState<string | null>(null)
  const [modalSearch, setModalSearch] = useState("")
  // Kemasan di modal yang detailnya (kode, nama, qty, harga, kode steril,
  // kedaluwarsa) sedang dibuka lewat tombol panah.
  const [openDetail, setOpenDetail] = useState<Set<string>>(new Set())
  const toggleDetail = (key: string) =>
    setOpenDetail((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Satu halaman: "Perlu Disimpan" di atas, "Inventaris Gudang" di bawahnya.
  // Pencarian hanya berlaku untuk inventaris — "Perlu Disimpan" selalu lengkap.
  const loadIncoming = useCallback(() => {
    dispatch(fetchStorageBmhpIncoming({ page: 1, search: "" }))
  }, [dispatch])

  const loadInventory = useCallback(() => {
    dispatch(fetchStorageBmhpInventory({ page: 1, search, rackId: rackFilter }))
  }, [dispatch, search, rackFilter])

  useEffect(() => {
    loadIncoming()
  }, [loadIncoming])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  function loadAll() {
    loadIncoming()
    loadInventory()
  }

  // "Perlu Disimpan" berada di atas inventaris, jadi halaman berikutnya diambil
  // lewat tombol saja — lazy load saat scroll hanya untuk inventaris di dasar halaman.
  const incomingHasMore = incoming.page < incoming.lastPage
  const loadMoreIncoming = useCallback(() => {
    if (incoming.loading || incoming.loadingMore || !incomingHasMore) return
    dispatch(fetchStorageBmhpIncoming({ page: incoming.page + 1, search: "" }))
  }, [dispatch, incoming, incomingHasMore])

  const inventoryHasMore = inventory.page < inventory.lastPage
  const loadMoreInventory = useCallback(() => {
    if (inventory.loading || inventory.loadingMore || !inventoryHasMore) return
    dispatch(fetchStorageBmhpInventory({ page: inventory.page + 1, search, rackId: rackFilter }))
  }, [dispatch, search, rackFilter, inventory, inventoryHasMore])

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !inventoryHasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreInventory()
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inventoryHasMore, loadMoreInventory])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
  }

  async function loadRackOptions() {
    if (rackLoadedRef.current || rackOptionsLoading) return
    setRackOptionsLoading(true)
    try {
      const res = await api.get("/master/racks/options")
      setRackOptions(res.data.data)
      rackLoadedRef.current = true
    } catch {
      // Abaikan bila gagal memuat opsi rak
    } finally {
      setRackOptionsLoading(false)
    }
  }

  // Daftar rak dipakai filter inventaris sejak halaman dibuka; modal simpan
  // memakai daftar yang sama (loadRackOptions tidak mengambil ulang).
  useEffect(() => {
    let cancelled = false
    api
      .get("/master/racks/options")
      .then((res) => {
        if (cancelled) return
        setRackOptions(res.data.data)
        rackLoadedRef.current = true
      })
      .catch(() => {
        // Abaikan — filter tetap bisa "Semua rak"; modal simpan akan mencoba lagi.
      })
    return () => {
      cancelled = true
    }
  }, [])

  function openStore(batch: StorageBmhpIncomingBatch) {
    loadRackOptions()
    setActive(batch)
    setError(null)
    setBulkRack("")
    setModalSearch("")
    setOpenDetail(new Set())
    setPickerTarget(null)
    setScanNotice(null)
    const init: Record<number, string> = {}
    batch.units.forEach((u) => {
      init[u.id] = u.rack_name ?? ""
    })
    setRackById(init)
  }

  const unitGroups = useMemo<StoreUnitGroup[]>(() => {
    if (!active) return []
    const groups: StoreUnitGroup[] = []
    const byKey = new Map<string, StoreUnitGroup>()
    for (const u of active.units) {
      const fallbackName =
        u.source === "paket" ? u.package_name ?? "Package" : u.instrument ?? `#${u.id}`
      const key = u.barcode_no ? `label|${u.barcode_no}` : `${u.source}|${fallbackName}`
      let g = byKey.get(key)
      if (!g) {
        g = { key, source: u.source, packageName: null, barcodeNo: u.barcode_no, units: [] }
        byKey.set(key, g)
        groups.push(g)
      }
      if (u.source === "paket") {
        g.source = "paket"
        g.packageName ??= u.package_name ?? "Package"
      }
      g.units.push(u)
    }
    return groups
  }, [active])

  const filteredGroups = useMemo(() => {
    const q = modalSearch.trim().toLowerCase()
    if (!q) return unitGroups
    return unitGroups.filter((g) =>
      [
        groupTitle(g, t),
        g.barcodeNo,
        ...g.units.flatMap((u) => [u.instrument, u.code]),
      ].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [unitGroups, modalSearch, t])

  function setGroupRack(group: StoreUnitGroup, value: string) {
    setBulkRack("")
    setRackById((prev) => {
      const next = { ...prev }
      group.units.forEach((u) => {
        if (!u.stored) next[u.id] = value
      })
      return next
    })
  }

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

  const hasRackToSave = (active?.units ?? []).some(
    (u) => !u.stored && (rackById[u.id] ?? "").trim() !== "",
  )

  const pickerGroup =
    pickerTarget?.type === "group" ? unitGroups.find((g) => g.key === pickerTarget.key) ?? null : null

  function handleRackPicked(name: string) {
    if (!pickerTarget) return
    if (pickerTarget.type === "all") {
      setAllRack(name)
      setScanNotice(t("storageBmhp.rackToAll", { rack: name }))
      return
    }
    if (!pickerGroup) return
    setGroupRack(pickerGroup, name)
    setScanNotice(t("storageBmhp.rackToGroup", { rack: name, group: groupTitle(pickerGroup, t) }))
  }

  function closeModal() {
    setPickerTarget(null)
    setScanNotice(null)
    setBulkRack("")
    setModalSearch("")
    setActive(null)
  }

  useEffect(() => {
    if (!scanNotice) return
    const timer = setTimeout(() => setScanNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [scanNotice])

  async function saveStorage() {
    if (!active || saving) return
    // Pemilih rak bekerja dengan NAMA rak; yang dikirim ke server `rack_id`-nya.
    const rackIdByName = new Map(rackOptions.map((r) => [r.name, r.id]))
    const picked = active.units.filter((u) => !u.stored && (rackById[u.id] ?? "").trim())
    if (picked.length === 0) {
      setError(t("storageBmhp.noRackChosen"))
      return
    }
    const unknown = picked.find((u) => !rackIdByName.has(rackById[u.id].trim()))
    if (unknown) {
      setError(t("storageBmhp.rackNotFound", { rack: rackById[unknown.id].trim() }))
      return
    }
    const items = picked.map((u) => ({ packaging_item_id: u.id, rack_id: rackIdByName.get(rackById[u.id].trim()) }))
    setSaving(true)
    setError(null)
    const storedBefore = active.stored_count
    try {
      const res = await api.post(`/master/storage-bmhp/${active.id}/store`, { items })
      const after = res.data?.data as StorageBmhpIncomingBatch | undefined
      const savedNow = after ? after.stored_count - storedBefore : items.length
      const skipped = items.length - savedNow
      setResult(
        skipped > 0
          ? {
              variant: "error",
              description: t("storageBmhp.storedPartial", {
                saved: savedNow,
                total: items.length,
                skipped,
              }),
            }
          : { variant: "success", description: t("storageBmhp.storedCount", { n: savedNow }) },
      )
      closeModal()
      loadAll()
    } catch (e) {
      setError(errMsg(e, t))
    } finally {
      setSaving(false)
    }
  }

  const q = search.trim()

  const kosong = <span className="text-gray-400 text-sm">—</span>

  // Inventaris dikelompokkan dua tingkat: per RAK (judul kelompok tabel), lalu
  // per NAMA BMHP + HARGA SATUAN (satu baris tabel) — harga dicatat per produksi
  // (production_bmhp_item.price), jadi nama sama berharga beda jadi baris
  // terpisah. Rinciannya per nomor label kemasan baru muncul saat baris dibuka.
  // Urutan server (kedaluwarsa terdekat dulu) tetap dipakai untuk label di dalamnya.
  const inventoryByName = useMemo<InventoryNameRow[]>(() => {
    const byKey = new Map<string, InventoryNameRow>()
    for (const r of inventory.items) {
      const isPaket = r.source === "paket"
      const name = isPaket ? r.package_name ?? "Package" : r.unit.instrument ?? "BMHP"
      const price = Number(r.unit.price ?? 0)
      const rack = r.rack_name ?? "—"
      const key = `${r.rack_id}|${r.source}|${name}|${price}`
      const row = byKey.get(key) ?? { key, rack, name, isPaket, price, items: [] }
      row.items.push(r)
      byKey.set(key, row)
    }
    return [...byKey.values()].sort(
      (a, b) =>
        a.rack.localeCompare(b.rack, "id", { numeric: true }) ||
        a.name.localeCompare(b.name, "id", { numeric: true }) ||
        a.price - b.price,
    )
  }, [inventory.items])

  const [openNames, setOpenNames] = useState<Set<string>>(new Set())
  const toggleName = (row: InventoryNameRow) =>
    setOpenNames((prev) => {
      const next = new Set(prev)
      if (next.has(row.key)) next.delete(row.key)
      else next.add(row.key)
      return next
    })

  const inventoryColumns: Column<InventoryNameRow>[] = [
    {
      header: "BMHP",
      cell: (g) => (
        <span className="inline-flex items-center gap-2">
          {g.isPaket && <Badge variant="info">{t("common.package")}</Badge>}
          <span className="font-medium text-gray-900">{g.name}</span>
        </span>
      ),
    },
    {
      header: t("storageBmhp.qty"),
      // Total qty per satuan, mis. "7 Lembar" (paket: jumlah set).
      cell: (g) => {
        if (g.isPaket) return `${labelsOf(g.items).length} set`
        const totals = new Map<string, number>()
        for (const r of g.items) {
          const unit = r.unit.unit_name ?? "pcs"
          totals.set(unit, (totals.get(unit) ?? 0) + Number(r.unit.quantity ?? 1))
        }
        return [...totals.entries()].map(([unit, n]) => `${n} ${unit}`).join(", ")
      },
      className: "whitespace-nowrap",
    },
    {
      header: t("storageBmhp.unitPrice"),
      // Satu baris = satu harga (harga beda sudah dipisah jadi baris sendiri).
      cell: (g) => rupiah(g.price),
      className: "whitespace-nowrap",
    },
    {
      header: t("storageBmhp.totalPrice"),
      cell: (g) => (
        <span className="font-semibold text-gray-900">
          {rupiah(g.items.reduce((sum, r) => sum + Number(r.unit.total_price ?? 0), 0))}
        </span>
      ),
      className: "whitespace-nowrap",
    },
    {
      header: t("storageBmhp.nearestExpiry"),
      cell: (g) => {
        const s = g.items.reduce((a, r) => ((r.days_to_expiry ?? Infinity) < (a.days_to_expiry ?? Infinity) ? r : a))
        return <ExpiryCard plain date={s.expiry_date} daysToExpiry={s.days_to_expiry} expired={s.expired} alert={s.alert} />
      },
      className: "whitespace-nowrap",
    },
    {
      header: t("storageBmhp.updatedAt"),
      // Waktu simpan ke rak TERBARU di antara label-label baris ini (storage_bmhp.stored_at).
      cell: (g) => {
        const latest = g.items.reduce<string | null>(
          (a, r) => (r.stored_at && (!a || r.stored_at > a) ? r.stored_at : a),
          null,
        )
        return latest ? (
          <span className="text-gray-700">
            {new Date(latest).toLocaleString(localeOf(lang), {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          kosong
        )
      },
      className: "whitespace-nowrap",
    },
  ]

  // Rincian satu nama BMHP: satu baris per nomor label kemasan.
  // Dibuat jelas berbeda dari baris kelompok di atasnya: garis aksen biru di kiri
  // dan header tabelnya biru muda (header utama abu-abu). Lebarnya sama dengan
  // tabel utama — `-mx-4` mengimbangi padding sel lipatan DataTable — dan muncul
  // dengan animasi saat dibuka.
  function renderLabelDetail(g: InventoryNameRow) {
    return (
      <div className="-mx-4 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="overflow-x-auto border-l-4 border-y border-[#075489]/40 border-y-[#075489]/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#075489]/10 text-sm text-[#075489]">
            <tr>
              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.packageLabelNo")}</th>
              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.name")}</th>
              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.qty")}</th>
              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.unitPrice")}</th>
              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.totalPrice")}</th>
              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.sterilCode")}</th>
              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.expiry")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {/* Satu label bisa berisi beberapa BMHP (paket): tiap BMHP satu baris,
                kolom milik label (nomor, kode steril, kedaluwarsa) digabung. */}
            {labelsOf(g.items).flatMap((rows) => {
              const r = rows[0]
              const span = rows.length
              const tone = r.alert || r.expired ? "bg-red-50/60" : undefined
              return rows.map((x, i) => (
                <tr key={x.id} className={tone}>
                  {i === 0 && (
                    <td rowSpan={span} className="whitespace-nowrap px-2.5 py-1.5 align-top font-mono font-semibold text-[#075489]">
                      {r.barcode_no ?? kosong}
                    </td>
                  )}
                  <td className="px-2.5 py-1.5 text-gray-800">{x.unit.instrument ?? "BMHP"}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700">
                    {x.unit.quantity ?? 1} {x.unit.unit_name ?? "pcs"}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700">{rupiah(x.unit.price)}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-gray-900">
                    {rupiah(x.unit.total_price)}
                  </td>
                  {i === 0 && (
                    <>
                      <td rowSpan={span} className="whitespace-nowrap px-2.5 py-1.5 align-top">
                        {r.sterilization_code ? (
                          <SterilCodeBadge code={r.sterilization_code} title={t("storageBmhp.sterilCode")} />
                        ) : (
                          kosong
                        )}
                      </td>
                      <td rowSpan={span} className="whitespace-nowrap px-2.5 py-1.5 align-top">
                        <ExpiryCard plain date={r.expiry_date} daysToExpiry={r.days_to_expiry} expired={r.expired} alert={r.alert} />
                      </td>
                    </>
                  )}
                </tr>
              ))
            })}
          </tbody>
        </table>
        </div>
      </div>
    )
  }

  return (
    // Satu ukuran huruf (text-sm) untuk seluruh isi halaman — termasuk komponen
    // bersama (DataTable, Badge, ExpiryCard) yang bawaannya text-xs, dan label
    // kartu DataTable di mobile (dt, text-[11px]). Judul halaman tidak terpengaruh.
    <div className="space-y-6 [&_.text-xs]:text-sm [&_dt]:text-sm [&_.uppercase]:text-sm">
      <PageHeader
        title={t("storageBmhp.title")}
        subtitle={t("storageBmhp.subtitle")}
      />


      {/* Perlu Disimpan — kartunya hanya tampil bila ada batch yang perlu disimpan. */}
      {incomingAll.length > 0 && (
      <Card className="p-0">
        <SectionHeader title={t("storageBmhp.tabToStore")} count={incoming.total} />
            <div className="space-y-2 p-4">
              {incomingAll.map((batch) => (
                <div
                  key={`bmhp-${batch.id}`}
                  className="rounded-lg border border-gray-200"
                >
                  <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {batch.sterilization_code && (
                            <SterilCodeBadge code={batch.sterilization_code} title={t("storageBmhp.sterilCode")} />
                          )}
                          {batch.stored_count > 0 && batch.stored_count < batch.unit_count && (
                            <Badge variant="warning">
                              {t("storageBmhp.storedOf", { stored: batch.stored_count, total: batch.unit_count })}
                            </Badge>
                          )}
                        </div>
                        {/* Info batch dipisah tanda "|". */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-500">
                          <span>{batch.unit_count} {t("storageBmhp.unitsSuffix")}</span>
                          <span className="text-gray-300">|</span>
                          <span>{t("storageBmhp.expiry")}: {formatDate(batch.expiry_date, lang)}</span>
                          {batch.processed_at && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>Steril: {formatDate(batch.processed_at, lang)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openStore(batch)}
                      className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#075489]/90"
                    >
                      {t("storageBmhp.storeOnRack")}
                    </button>
                  </div>
                </div>
              ))}
              <LoadMoreSentinel
                hasMore={incomingHasMore}
                loading={incoming.loadingMore}
                onLoadMore={loadMoreIncoming}
              />
            </div>
      </Card>
      )}

      {/* Inventaris Gudang */}
      <Card className="p-0">
        <SectionHeader title={t("storageBmhp.tabInventory")} count={null} />
        {/* Filter rak + pencarian — hanya untuk inventaris gudang. */}
        <div className="border-b border-gray-100 px-5 py-3">
          <form onSubmit={handleSearch} className="flex w-full flex-col gap-2 sm:flex-row">
            <Select
              value={rackFilter}
              onChange={(e) => setRackFilter(e.target.value)}
              className="sm:w-48"
              aria-label={t("storageBmhp.filterRack")}
            >
              <option value="">{t("storageBmhp.allRacks")}</option>
              {rackOptions.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("storageBmhp.searchInventory")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              {t("common.search")}
            </Button>
          </form>
        </div>
        {inventory.loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : (
          <div>
            <DataTable
              columns={inventoryColumns}
              data={inventoryByName}
              groupKey={(g) => g.rack}
              // Judul rak biru; MERAH bila ada BMHP di rak itu yang kedaluwarsa /
              // mendekati kedaluwarsa (≤ 7 hari).
              groupHeaderClassName={(_, rows) =>
                rows.some((g) => hasExpiryIssue(g.items))
                  ? "bg-red-600 text-center text-white"
                  : "bg-[#075489] text-center text-white"
              }
              renderExpanded={renderLabelDetail}
              isRowExpanded={(g) => openNames.has(g.key)}
              onToggleExpand={toggleName}
              rowClassName={(g) =>
                g.items.some((r) => r.alert || r.expired) ? "bg-red-50/60 hover:bg-red-50" : undefined
              }
              emptyMessage={q || rackFilter ? t("storageBmhp.noMatchingInstrument") : t("storageBmhp.noInventory")}
            />

            <LoadMoreSentinel
              ref={sentinelRef}
              hasMore={inventoryHasMore}
              loading={inventory.loadingMore}
              onLoadMore={loadMoreInventory}
            />
          </div>
        )}
      </Card>

      {/* Modal simpan ke rak */}
      <Modal
        open={active !== null}
        onClose={saving ? () => {} : closeModal}
        title={t("storageBmhp.modalTitle")}
        size="xl"
        footer={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex shrink-0 justify-end gap-2 sm:ml-auto">
              <Button variant="outline" onClick={closeModal} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={saveStorage}
                disabled={saving || !hasRackToSave}
                title={hasRackToSave ? undefined : t("storageBmhp.needRackFirst")}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {saving ? t("common.saving") : t("storageBmhp.modalTitle")}
              </Button>
            </div>
          </div>
        }
      >
        {active && (
          <div className="space-y-4">
            {active.units.some((u) => !u.stored) && (
              <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-gray-800">
                    {t("storageBmhp.setRackForAll")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPickerTarget({ type: "all" })}
                    className="w-full shrink-0 sm:w-52"
                    title={t("storageBmhp.pickRackAllTitle")}
                  >
                    <span className="truncate">{bulkRack ? `${t("storageBmhp.allPrefix")}: ${bulkRack}` : t("storageBmhp.pickRackAll")}</span>
                  </Button>
                </div>
                {scanNotice && (
                  <p className="text-sm text-gray-600">{scanNotice}</p>
                )}
              </div>
            )}

            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={t("storageBmhp.searchInModal")}
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {modalSearch && (
                <button
                  type="button"
                  onClick={() => setModalSearch("")}
                  title={t("storageBmhp.clearSearch")}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="space-y-2">
              {filteredGroups.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400">
                  {t("storageBmhp.noMatchingGroup")}
                </div>
              )}
              {filteredGroups.map((g) => {
                const firstUnstored = g.units.find((u) => !u.stored)
                const allStored = !firstUnstored
                const groupRack = firstUnstored ? rackById[firstUnstored.id] ?? "" : g.units[0]?.rack_name ?? ""
                const isPaket = g.source === "paket"
                const title = groupTitle(g, t)
                const detailOpen = openDetail.has(g.key)

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
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {/* Panah ke bawah: buka / tutup detail kemasan ini. */}
                        <button
                          type="button"
                          onClick={() => toggleDetail(g.key)}
                          aria-expanded={detailOpen}
                          aria-label={detailOpen ? t("common.collapse") : t("common.expand")}
                          title={detailOpen ? t("common.collapse") : t("common.expand")}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-[#075489]/10 hover:text-[#075489]"
                        >
                          <ChevronDown
                            className={"h-4 w-4 transition-transform " + (detailOpen ? "rotate-180" : "")}
                          />
                        </button>
                        <Boxes className="h-4 w-4 shrink-0 text-[#075489]" />
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          {isPaket && <Badge variant="info">{t("common.package")}</Badge>}
                          <span className="truncate text-sm font-medium text-gray-800">{title}</span>
                          {g.barcodeNo ? (
                            <span className="font-mono text-sm font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded">
                              {g.barcodeNo}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                          <span className="text-sm text-gray-400">{g.units.length} {t("storageBmhp.unitsSuffix")}</span>
                        </div>
                      </div>
                      <div className="w-full shrink-0 sm:w-52">
                        {allStored ? (
                          <div className="flex justify-start sm:justify-end">
                            <Badge variant="success">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {groupRack || t("storageBmhp.stored")}
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
                            title={t("storageBmhp.pickRackTitle")}
                          >
                            <span className="truncate">{groupRack || t("storageBmhp.pickRack")}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Detail kemasan — baru muncul setelah panah diklik. Harga dari
                        production_bmhp_item.price (harga saat produksi); kode steril
                        & kedaluwarsa milik batch ini. */}
                    {detailOpen && (
                      <div className="mt-2 overflow-x-auto rounded-md border border-gray-100">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-gray-50 text-sm uppercase tracking-wide text-gray-500">
                            <tr>
                              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.code")}</th>
                              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.name")}</th>
                              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.qty")}</th>
                              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.unitPrice")}</th>
                              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.totalPrice")}</th>
                              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.sterilCode")}</th>
                              <th className="px-2.5 py-1.5 font-semibold">{t("storageBmhp.expiry")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {g.units.map((u) => (
                              <tr key={u.id}>
                                <td className="whitespace-nowrap px-2.5 py-1.5 font-mono font-semibold text-[#075489]">
                                  {u.code ?? <span className="text-gray-400">—</span>}
                                </td>
                                <td className="px-2.5 py-1.5 text-gray-800">{u.instrument ?? "—"}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700">
                                  {u.quantity ?? 1} {u.unit_name ?? "pcs"}
                                </td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700">{rupiah(u.price)}</td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-gray-900">
                                  {rupiah(u.total_price)}
                                </td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-gray-700">
                                  {active.sterilization_code ?? <span className="text-gray-400">—</span>}
                                </td>
                                <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700">
                                  {formatDate(active.expiry_date, lang)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Dirender hanya saat dibuka, supaya kodenya (lazy) baru diunduh saat itu. */}
      {pickerTarget !== null && (
      <RackPickerModal
        open
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
            ? t("storageBmhp.pickerTargetAll")
            : pickerGroup
              ? groupTitle(pickerGroup, t)
              : null
        }
        onSelect={handleRackPicked}
      />
      )}

      <ResultDialog
        open={result !== null}
        onClose={() => setResult(null)}
        variant={result?.variant ?? "success"}
        description={result?.description}
        title={result?.variant === "error" ? t("storageBmhp.resultPartial") : t("storageBmhp.resultStored")}
        actionLabel={result?.variant === "error" ? t("common.close") : t("common.done")}
      />
    </div>
  )
}

export default function StorageSterilBmhpPageWrapper() {
  return (
    <Suspense fallback={null}>
      <StorageSterilBmhpPage />
    </Suspense>
  )
}

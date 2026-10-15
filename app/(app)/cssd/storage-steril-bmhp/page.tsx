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
  X,
  Asterisk,
  Package,
} from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { LoadMoreSentinel } from "@/components/molecules/LoadMoreSentinel"
import { ExpiryCard } from "@/components/molecules/ExpiryCard"
import { RackPickerModal } from "@/components/molecules/RackPickerModal"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchStorageBmhpIncoming,
  fetchStorageBmhpInventory,
  fetchStorageBmhpSummary,
  type StorageBmhpIncomingBatch,
  type StorageBmhpIncomingUnit,
  type StorageBmhpInventoryRow,
} from "@/lib/store/slices/storageBmhpSlice"
import { useLanguage, localeOf, type Lang } from "@/lib/i18n"
import api from "@/lib/axios"

type StorageTab = "simpan" | "inventaris"

type StoreUnitGroup = {
  key: string
  source: "satuan" | "paket"
  packageName: string | null
  barcodeNo: string | null
  units: StorageBmhpIncomingUnit[]
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

const BLOCKED_KEY: Record<string, string> = {
  Kedaluwarsa: "storageBmhp.blockedExpired",
  "Tanpa tanggal kedaluwarsa": "storageBmhp.blockedNoExpiry",
  "Sebungkus dengan unit kedaluwarsa": "storageBmhp.blockedSamePackage",
}

function blockedLabel(reason: string | null, t: (key: string) => string): string {
  if (!reason) return t("storageBmhp.blockedDefault")
  const key = BLOCKED_KEY[reason]
  return key ? t(key) : reason
}

function errMsg(e: unknown, t: (key: string) => string): string {
  const x = e as { response?: { data?: { message?: string } } }
  return x.response?.data?.message ?? t("common.somethingWrong")
}

const STORAGE_TABS: StorageTab[] = ["simpan", "inventaris"]

function StorageSterilBmhpPage() {
  const dispatch = useAppDispatch()
  const { t, lang } = useLanguage()
  const searchParams = useSearchParams()
  const { incoming, inventory, summary } = useAppSelector((s) => s.storageBmhp)

  const incomingAll = useMemo(
    () => incoming.items.filter((b) => b.stored_count < b.unit_count),
    [incoming.items],
  )

  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState<StorageTab>(
    STORAGE_TABS.includes(tabParam as StorageTab) ? (tabParam as StorageTab) : "simpan",
  )

  function changeTab(next: StorageTab) {
    setTab(next)
    window.history.replaceState(
      null,
      "",
      next === "simpan" ? "/cssd/storage-steril-bmhp" : `/cssd/storage-steril-bmhp?tab=${next}`,
    )
  }

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")

  const [groupBy, setGroupBy] = useState<"rak" | "batch">("rak")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const [openPkt, setOpenPkt] = useState<Set<string>>(new Set())
  const togglePkt = (key: string) =>
    setOpenPkt((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const [openSet, setOpenSet] = useState<Set<string>>(new Set())
  const toggleSet = (key: string) =>
    setOpenSet((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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

  const loadTab = useCallback(() => {
    dispatch(fetchStorageBmhpSummary())
    if (tab === "simpan") {
      dispatch(fetchStorageBmhpIncoming({ page: 1, search }))
      return
    }
    dispatch(fetchStorageBmhpInventory({ page: 1, search }))
  }, [dispatch, tab, search])

  useEffect(() => {
    loadTab()
  }, [loadTab])

  const loadMore = useCallback(() => {
    if (tab === "simpan") {
      if (incoming.loading || incoming.loadingMore) return
      if (incoming.page < incoming.lastPage) {
        dispatch(fetchStorageBmhpIncoming({ page: incoming.page + 1, search }))
      }
      return
    }
    if (inventory.loading || inventory.loadingMore) return
    if (inventory.page < inventory.lastPage) {
      dispatch(fetchStorageBmhpInventory({ page: inventory.page + 1, search }))
    }
  }, [dispatch, tab, search, incoming, inventory])

  const hasMore = tab === "simpan" ? incoming.page < incoming.lastPage : inventory.page < inventory.lastPage
  const loadingMore = tab === "simpan" ? incoming.loadingMore : inventory.loadingMore

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

  function openStore(batch: StorageBmhpIncomingBatch) {
    loadRackOptions()
    setActive(batch)
    setError(null)
    setBulkRack("")
    setModalSearch("")
    setPickerTarget(null)
    setScanNotice(null)
    const init: Record<number, string> = {}
    batch.units.forEach((u) => {
      init[u.id] = u.rack_code ?? ""
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
    const items = active.units
      .filter((u) => !u.stored && (rackById[u.id] ?? "").trim())
      .map((u) => ({ packaging_item_id: u.id, rack_code: rackById[u.id].trim() }))
    if (items.length === 0) {
      setError(t("storageBmhp.noRackChosen"))
      return
    }
    setSaving(true)
    setError(null)
    const storedBefore = active.stored_count
    try {
      const res = await api.post(active.store_url ?? `/master/storage-bmhp/${active.id}/store`, { items })
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
      loadTab()
    } catch (e) {
      setError(errMsg(e, t))
    } finally {
      setSaving(false)
    }
  }

  const q = search.trim()

  const inventoryGroups = useMemo(() => {
    const map = new Map<string, StorageBmhpInventoryRow[]>()
    for (const r of inventory.items) {
      const key = groupBy === "rak" ? r.rack_code : r.batch ?? "No Batch"
      const arr = map.get(key) ?? []
      arr.push(r)
      map.set(key, arr)
    }
    return [...map.entries()]
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => a.key.localeCompare(b.key, "id", { numeric: true }))
  }, [inventory.items, groupBy])

  function groupRackItems(items: StorageBmhpInventoryRow[]) {
    type SetGroup = { key: string; barcodeNo: string | null; units: StorageBmhpInventoryRow[] }
    type KindGroup = {
      key: string
      source: "satuan" | "paket"
      name: string
      units: StorageBmhpInventoryRow[]
      sets: SetGroup[]
    }

    const kinds = new Map<string, KindGroup>()
    for (const r of items) {
      const name = r.source === "paket" ? r.package_name ?? "Package" : r.unit.instrument ?? "BMHP"
      const key = `${r.source}|${name}`
      const g = kinds.get(key) ?? { key, source: r.source, name, units: [], sets: [] }
      g.units.push(r)
      kinds.set(key, g)
    }

    for (const g of kinds.values()) {
      if (g.source !== "paket") continue
      const sets = new Map<string, SetGroup>()
      for (const u of g.units) {
        const sk = u.barcode_no ?? `tanpa-label#${u.id}`
        const s = sets.get(sk) ?? { key: sk, barcodeNo: u.barcode_no, units: [] }
        s.units.push(u)
        sets.set(sk, s)
      }
      g.sets = [...sets.values()]
    }

    return [...kinds.values()].sort((a, b) =>
      a.source === b.source
        ? a.name.localeCompare(b.name, "id", { numeric: true })
        : a.source === "paket"
          ? -1
          : 1,
    )
  }

  function countItems(items: StorageBmhpInventoryRow[]): number {
    return groupRackItems(items).reduce(
      (n, kind) => n + (kind.source === "paket" ? kind.sets.length : kind.units.length),
      0,
    )
  }

  function soonestOf(units: StorageBmhpInventoryRow[]) {
    return units.reduce((a, u) =>
      (u.days_to_expiry ?? Infinity) < (a.days_to_expiry ?? Infinity) ? u : a,
    )
  }

  function renderAlertMark(units: StorageBmhpInventoryRow[]) {
    if (!units.some((u) => u.alert)) return null
    return (
      <Asterisk
        className="ml-auto h-4 w-4 shrink-0 text-red-600"
        aria-label={t("storageBmhp.alertMark")}
      />
    )
  }

  function renderExpiryMeta(units: StorageBmhpInventoryRow[]) {
    const s = soonestOf(units)
    return (
      <span className="ml-auto flex items-center gap-2">
        <ExpiryCard
          date={s.expiry_date}
          daysToExpiry={s.days_to_expiry}
          expired={s.expired}
          alert={s.alert}
        />
        {!s.alert && !s.expired && <Badge variant="success">{t("storageBmhp.inStorage")}</Badge>}
      </span>
    )
  }

  function renderUnitRow(r: StorageBmhpInventoryRow) {
    return (
      <div
        key={r.id}
        className={
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-gray-50 px-4 py-2 text-sm last:border-0 " +
          (r.alert ? "bg-red-50/60" : "")
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
            {r.unit.code ?? `#${r.unit.id}`}
          </span>
          <span className="truncate text-gray-700">{r.unit.instrument ?? "—"}</span>
          {r.unit.quantity && (
            <span className="text-xs text-gray-500">
              ({r.unit.quantity} {r.unit.unit_name ?? "pcs"})
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExpiryCard
            date={r.expiry_date}
            daysToExpiry={r.days_to_expiry}
            expired={r.expired}
            alert={r.alert}
          />
          {r.can_distribute === false && (
            <span title={blockedLabel(r.blocked_reason, t)}>
              <Badge variant="danger">{t("storageBmhp.notOrderable")}</Badge>
            </span>
          )}
          {r.barcode_no ? (
            <span
              title={t("storageBmhp.packageLabelNo")}
              className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-1.5 py-0.5 rounded"
            >
              {r.barcode_no}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
          {groupBy === "batch" && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />
              {r.rack_code}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("storageBmhp.title")}
        subtitle={t("storageBmhp.subtitle")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title={t("storageBmhp.statTotal")} value={`${summary.total}`} icon={Warehouse} />
        <StatCard title={t("storageBmhp.statAlert")} value={`${summary.alert}`} icon={CalendarClock} positive={false} />
        <StatCard title={t("storageBmhp.statExpired")} value={`${summary.expired}`} icon={AlertTriangle} positive={false} />
      </div>

      <Card className="p-0">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <div className="flex gap-5 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                {
                  key: "simpan",
                  label: t("storageBmhp.tabToStore"),
                  count: incoming.loaded ? incoming.total : null,
                },
                { key: "inventaris", label: t("storageBmhp.tabInventory"), count: summary.total },
              ] as { key: StorageTab; label: string; count: number | null }[]
            ).map((tTab) => {
              const activeT = tab === tTab.key
              return (
                <button
                  key={tTab.key}
                  type="button"
                  onClick={() => changeTab(tTab.key)}
                  className={
                    "relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors " +
                    (activeT
                      ? "border-[#075489] font-semibold text-[#075489]"
                      : "border-transparent font-medium text-gray-500 hover:text-gray-800")
                  }
                >
                  {tTab.label}
                  {tTab.count !== null && (
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-xs font-semibold " +
                        (activeT ? "bg-[#075489]/10 text-[#075489]" : "bg-gray-100 text-gray-500")
                      }
                    >
                      {tTab.count}
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
                    ? t("storageBmhp.searchIncoming")
                    : t("storageBmhp.searchInventory")
                }
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

        {tab === "simpan" ? (
          incoming.loading || !incoming.loaded ? (
            <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
          ) : incomingAll.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {q ? t("storageBmhp.noMatchingBatch") : t("storageBmhp.noIncoming")}
            </div>
          ) : (
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
                          <span className="text-sm font-semibold text-gray-900">
                            {t("storageBmhp.batchPrefix")} {batch.code}
                          </span>
                          {batch.machine_name && (
                            <Badge variant="default">
                              {batch.machine_name}
                            </Badge>
                          )}
                          {batch.operator && (
                            <span className="text-xs text-gray-500">
                              Op: {batch.operator}
                            </span>
                          )}
                          {batch.stored_count > 0 && batch.stored_count < batch.unit_count && (
                            <Badge variant="warning">
                              {t("storageBmhp.storedOf", { stored: batch.stored_count, total: batch.unit_count })}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                          <span>{batch.unit_count} {t("storageBmhp.unitsSuffix")}</span>
                          <span>{t("storageBmhp.expiry")}: {formatDate(batch.expiry_date, lang)}</span>
                          {batch.processed_at && (
                            <span>Steril: {formatDate(batch.processed_at, lang)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openStore(batch)}
                      className="shrink-0 self-center rounded-md border border-[#075489] bg-[#075489] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#075489]/90"
                    >
                      {t("storageBmhp.storeOnRack")}
                    </button>
                  </div>
                </div>
              ))}
              <LoadMoreSentinel ref={sentinelRef} hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
            </div>
          )
        ) : inventory.loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as "rak" | "batch")}
                className="w-auto"
              >
                <option value="rak">{t("storageBmhp.byRack")}</option>
                <option value="batch">{t("storageBmhp.byBatch")}</option>
              </Select>
            </div>

            {inventory.items.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">
                {q ? t("storageBmhp.noMatchingInstrument") : t("storageBmhp.noInventory")}
              </div>
            ) : (
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
                        <span className="text-xs text-gray-400">{countItems(g.items)} {t("storageBmhp.itemsSuffix")}</span>
                        {renderAlertMark(g.items)}
                      </button>
                      {open && (
                        <div className="border-t border-gray-100">
                          {groupRackItems(g.items).map((kind) => {
                            const pkey = `${g.key}::${kind.key}`
                            const popen = q ? true : openPkt.has(pkey)
                            const isPaket = kind.source === "paket"
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
                                    {isPaket ? t("common.package") : t("common.single")}
                                  </Badge>
                                  <span className="font-medium text-gray-800">{kind.name}</span>
                                  <span className="text-xs text-gray-400">
                                    {isPaket ? `${kind.sets.length} ${t("storageBmhp.setsSuffix")}` : `${kind.units.length} ${t("storageBmhp.unitsSuffix")}`}
                                  </span>
                                  {renderAlertMark(kind.units)}
                                </button>

                                {popen &&
                                  (isPaket ? (
                                    <div className="bg-gray-50/40">
                                      {kind.sets.map((set, i) => {
                                        const skey = `${pkey}::${set.key}`
                                        const sopen = q ? true : openSet.has(skey)
                                        return (
                                          <div key={skey} className="border-b border-gray-100 last:border-0">
                                            <button
                                              type="button"
                                              onClick={() => toggleSet(skey)}
                                              className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 pl-8 text-sm hover:bg-gray-100/60"
                                            >
                                              {sopen ? (
                                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                              ) : (
                                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                              )}
                                              <span className="text-gray-700">
                                                {kind.name}
                                                <span className="ml-1 text-xs text-gray-400">
                                                  ({t("storageBmhp.setIndex", { n: i + 1 })})
                                                </span>
                                              </span>
                                              {set.barcodeNo ? (
                                                <span
                                                  title={t("storageBmhp.packageLabelNo")}
                                                  className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-1.5 py-0.5 rounded"
                                                >
                                                  {set.barcodeNo}
                                                </span>
                                              ) : (
                                                <span className="text-xs text-gray-400">{t("storageBmhp.noLabel")}</span>
                                              )}
                                              <span className="text-xs text-gray-400">
                                                {set.units.length} {t("storageBmhp.unitsSuffix")}
                                              </span>
                                              {renderExpiryMeta(set.units)}
                                            </button>
                                            {sopen && (
                                              <div className="bg-white">{set.units.map(renderUnitRow)}</div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <div className="bg-gray-50/40">{kind.units.map(renderUnitRow)}</div>
                                  ))}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <LoadMoreSentinel ref={sentinelRef} hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} />
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
                  <p className="text-xs text-gray-600">{scanNotice}</p>
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
                const groupRack = firstUnstored ? rackById[firstUnstored.id] ?? "" : g.units[0]?.rack_code ?? ""
                const isPaket = g.source === "paket"
                const title = groupTitle(g, t)

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
                        <Boxes className="h-4 w-4 shrink-0 text-[#075489]" />
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          {isPaket && <Badge variant="info">{t("common.package")}</Badge>}
                          <span className="truncate text-sm font-medium text-gray-800">{title}</span>
                          {g.barcodeNo ? (
                            <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded">
                              {g.barcodeNo}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                          <span className="text-xs text-gray-400">{g.units.length} {t("storageBmhp.unitsSuffix")}</span>
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
                    {(isPaket || g.units.length > 1) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {g.units.map((u) => (
                          <span
                            key={u.id}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#075489] bg-[#075489]/8 px-1.5 py-0.5 rounded"
                            title={u.code ?? undefined}
                          >
                            {u.instrument ?? u.code ?? `#${u.id}`}
                            {u.quantity && ` (${u.quantity} ${u.unit_name ?? "pcs"})`}
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
            ? t("storageBmhp.pickerTargetAll")
            : pickerGroup
              ? groupTitle(pickerGroup, t)
              : null
        }
        onSelect={handleRackPicked}
      />

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

"use client"

import { Suspense, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { useLanguage, useT } from "@/lib/i18n"
import { rentangSemingguTerakhir } from "@/lib/dateRange"

function TabLoading() {
  const t = useT()
  return <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
}

// Lazy load: kode tiap tab baru diunduh saat tab itu pertama kali dibuka, dan
// datanya pun baru diambil saat tabnya dirender (tab dirender bersyarat).
const ProductionBmhpNewTab = dynamic(
  () => import("@/components/molecules/ProductionBmhpNewTab").then((m) => m.ProductionBmhpNewTab),
  { loading: TabLoading },
)
const ProductionBmhpPackagingTab = dynamic(
  () => import("@/components/molecules/ProductionBmhpPackagingTab").then((m) => m.ProductionBmhpPackagingTab),
  { loading: TabLoading },
)
const ProductionBmhpSterilizationTab = dynamic(
  () => import("@/components/molecules/ProductionBmhpSterilizationTab").then((m) => m.ProductionBmhpSterilizationTab),
  { loading: TabLoading },
)

type ProduksiBmhpTab = "produksi" | "packaging" | "sterilization"

const TABS: { key: ProduksiBmhpTab; labelKey: string }[] = [
  { key: "produksi", labelKey: "production.tabNew" },
  { key: "packaging", labelKey: "production.tabPackaging" },
  { key: "sterilization", labelKey: "production.tabSterilization" },
]

/** Filter pipeline (pengemasan & sterilisasi) — disamakan dengan halaman Produksi CSSD. */
type PipelineFilter = {
  search: string
  dateFrom: string
  dateTo: string
}

function ProduksiBmhpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()

  const tabParam = searchParams.get("tab") as ProduksiBmhpTab | null
  const [tab, setTab] = useState<ProduksiBmhpTab>(
    tabParam && ["produksi", "packaging", "sterilization"].includes(tabParam)
      ? tabParam
      : "produksi",
  )

  // Filter: `draft` = isi form; `filter` = yang sudah diterapkan (memicu request).
  // Rentang tanggal bawaannya seminggu terakhir, sama seperti Produksi CSSD.
  const [defaultFilter] = useState<PipelineFilter>(() => {
    const { from, to } = rentangSemingguTerakhir()
    return { search: "", dateFrom: from, dateTo: to }
  })
  const [draftFilter, setDraftFilter] = useState<PipelineFilter>(defaultFilter)
  const [filter, setFilter] = useState<PipelineFilter>(defaultFilter)
  const hasFilter =
    filter.search !== defaultFilter.search ||
    filter.dateFrom !== defaultFilter.dateFrom ||
    filter.dateTo !== defaultFilter.dateTo

  function changeTab(nextTab: ProduksiBmhpTab) {
    setTab(nextTab)
    // Kata kunci tab lama tidak relevan di tab baru — samakan dengan Produksi CSSD.
    setDraftFilter((f) => ({ ...f, search: "" }))
    setFilter((f) => ({ ...f, search: "" }))
    const p = new URLSearchParams(searchParams.toString())
    if (nextTab === "produksi") {
      p.delete("tab")
    } else {
      p.set("tab", nextTab)
    }
    const qs = p.toString()
    router.replace(qs ? `/cssd/production-bmhp?${qs}` : "/cssd/production-bmhp")
  }

  function applyFilter(e?: React.FormEvent) {
    e?.preventDefault()
    setFilter(draftFilter)
  }

  function resetFilter() {
    setDraftFilter(defaultFilter)
    setFilter(defaultFilter)
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("productionBmhp.title")} subtitle={t("productionBmhp.subtitle")} />

      <Card className="p-0">
        <div className="flex gap-5 overflow-x-auto border-b border-gray-200 px-5 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((item) => {
            const active = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => changeTab(item.key)}
                className={
                  "relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm transition-colors " +
                  (active
                    ? "border-[#075489] font-semibold text-[#075489]"
                    : "border-transparent font-medium text-gray-500 hover:text-gray-800")
                }
              >
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>

        {/* Filter hanya untuk tahap pipeline (pengemasan & sterilisasi). */}
        {tab !== "produksi" && (
          <form onSubmit={applyFilter} className="px-5 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="bmhp-pipeline-search">{t("common.search")}</Label>
                <Input
                  id="bmhp-pipeline-search"
                  value={draftFilter.search}
                  onChange={(e) => setDraftFilter((f) => ({ ...f, search: e.target.value }))}
                  placeholder={
                    tab === "packaging"
                      ? t("productionBmhp.searchPackaging")
                      : t("productionBmhp.searchSterilization")
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bmhp-pipeline-date-from">{t("production.dateFrom")}</Label>
                <Input
                  id="bmhp-pipeline-date-from"
                  type="date"
                  value={draftFilter.dateFrom}
                  max={draftFilter.dateTo || undefined}
                  onChange={(e) => setDraftFilter((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="sm:w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bmhp-pipeline-date-to">{t("production.dateTo")}</Label>
                <Input
                  id="bmhp-pipeline-date-to"
                  type="date"
                  value={draftFilter.dateTo}
                  min={draftFilter.dateFrom || undefined}
                  onChange={(e) => setDraftFilter((f) => ({ ...f, dateTo: e.target.value }))}
                  className="sm:w-44"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="submit" className="shrink-0 bg-[#075489] text-white hover:bg-[#075489]/90">
                  {t("production.apply")}
                </Button>
                {hasFilter && (
                  <Button type="button" variant="outline" onClick={resetFilter} className="shrink-0">
                    {t("common.reset")}
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </Card>

      {tab === "produksi" && <ProductionBmhpNewTab onSuccess={() => changeTab("packaging")} />}

      {tab !== "produksi" && (
        <Card className="p-4">
          {tab === "packaging" && <ProductionBmhpPackagingTab filter={filter} />}
          {tab === "sterilization" && <ProductionBmhpSterilizationTab filter={filter} />}
        </Card>
      )}
    </div>
  )
}

export default function ProduksiBmhpPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Memuat halaman...</div>}>
      <ProduksiBmhpContent />
    </Suspense>
  )
}

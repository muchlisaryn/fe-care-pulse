"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PackageCheck, Sparkles, PlusCircle } from "lucide-react"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ProductionBmhpNewTab } from "@/components/molecules/ProductionBmhpNewTab"
import { ProductionBmhpPackagingTab } from "@/components/molecules/ProductionBmhpPackagingTab"
import { ProductionBmhpSterilizationTab } from "@/components/molecules/ProductionBmhpSterilizationTab"
import { useLanguage } from "@/lib/i18n"

type ProduksiBmhpTab = "produksi" | "packaging" | "sterilization"

const TABS: { key: ProduksiBmhpTab; labelKey: string; icon: typeof PlusCircle }[] = [
  { key: "produksi", labelKey: "production.tabNew", icon: PlusCircle },
  { key: "packaging", labelKey: "production.tabPackaging", icon: PackageCheck },
  { key: "sterilization", labelKey: "production.tabSterilization", icon: Sparkles },
]

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

  function changeTab(nextTab: ProduksiBmhpTab) {
    setTab(nextTab)
    const p = new URLSearchParams(searchParams.toString())
    if (nextTab === "produksi") {
      p.delete("tab")
    } else {
      p.set("tab", nextTab)
    }
    const qs = p.toString()
    router.replace(qs ? `/cssd/production-bmhp?${qs}` : "/cssd/production-bmhp")
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("productionBmhp.title")} />

      <Card className="p-0">
        <div className="flex gap-5 overflow-x-auto border-b border-gray-200 px-5 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((item) => {
            const active = tab === item.key
            const Icon = item.icon
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
                <Icon className="h-4 w-4" />
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>

        <div className="p-6">
          {tab === "produksi" && (
            <ProductionBmhpNewTab onSuccess={() => changeTab("packaging")} />
          )}

          {tab === "packaging" && (
            <ProductionBmhpPackagingTab />
          )}

          {tab === "sterilization" && (
            <ProductionBmhpSterilizationTab />
          )}
        </div>
      </Card>
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

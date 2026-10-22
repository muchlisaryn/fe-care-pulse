import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/molecules/Card"
import { ProgressBarList, type ProgressBarItem } from "@/components/molecules/ProgressBarList"
import { STAT_TONE_CLASSES, type StatCardTone } from "@/components/molecules/StatCard"
import { cn } from "@/lib/utils"

type DashboardScoreCardProps = {
  title: string
  subtitle?: string
  icon: LucideIcon
  value: string
  hint?: string
  note?: string
  items: ProgressBarItem[]
  tone?: StatCardTone
  className?: string
}

/**
 * Kartu "skor" — satu angka utama yang besar, ikon yang memberi wajah, dan
 * beberapa bilah proporsi di bawahnya.
 *
 * Dipakai untuk kinerja Nafsul: angka validasi adalah jawaban utamanya,
 * sedangkan komposisi cara bayar menjelaskan dari mana angka itu datang.
 */
export function DashboardScoreCard({
  title,
  subtitle,
  icon: Icon,
  value,
  hint,
  note,
  items,
  tone = "success",
  className,
}: DashboardScoreCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-800">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>}
        </div>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            STAT_TONE_CLASSES[tone],
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>

      <div className="mt-4">
        <p className="text-3xl font-bold tabular-nums text-gray-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
      </div>

      {note && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
          {note}
        </p>
      )}

      <div className="mt-4 flex-1">
        <ProgressBarList items={items} />
      </div>
    </Card>
  )
}

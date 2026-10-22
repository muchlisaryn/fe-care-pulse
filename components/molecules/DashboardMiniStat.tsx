import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card } from "@/components/molecules/Card"
import { STAT_TONE_CLASSES, type StatCardTone } from "@/components/molecules/StatCard"
import { cn } from "@/lib/utils"

type DashboardMiniStatProps = {
  title: string
  value: string
  icon: LucideIcon
  hint?: string
  tone?: StatCardTone
  /** Visual kecil di bawah angka — sparkline, bilah kemajuan, atau ikon status. */
  visual?: ReactNode
  className?: string
}

/**
 * Kartu angka kecil untuk kolom kanan dashboard.
 *
 * Lebih ringkas dari `StatCard`: judulnya boleh dua baris, ikonnya kecil, dan
 * ada slot visual di bawah angka. Slot itu yang membuat empat kartu sejenis
 * tidak terasa seperti salinan yang sama — satu kartu memuat tren, kartu lain
 * memuat proporsi.
 */
export function DashboardMiniStat({
  title,
  value,
  icon: Icon,
  hint,
  tone = "default",
  visual,
  className,
}: DashboardMiniStatProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-2.5 p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-snug text-gray-500">{title}</p>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            STAT_TONE_CLASSES[tone],
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-xl font-bold tabular-nums text-gray-900">{value}</p>
        {hint && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-400">{hint}</p>}
      </div>

      {visual && <div className="mt-auto pt-1">{visual}</div>}
    </Card>
  )
}

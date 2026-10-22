import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card } from "@/components/molecules/Card"
import { Badge } from "@/components/atoms/Badge"
import { cn } from "@/lib/utils"

export type SpotlightMetric = {
  label: string
  value: string
  hint?: string
}

type DashboardSpotlightProps = {
  title: string
  subtitle?: string
  icon: LucideIcon
  value: string
  unit?: string
  hint?: string
  badge?: string
  chart: ReactNode
  metrics: SpotlightMetric[]
  className?: string
}

/**
 * Kartu utama dashboard: satu angka besar, satu grafik, lalu deretan angka
 * pendukung di kakinya.
 *
 * Susunannya mengikuti pertanyaan yang dibaca berurutan: "berapa totalnya?" →
 * "bagaimana naik-turunnya?" → "apa rinciannya?". Karena itu angkanya diletakkan
 * sebelum grafik, bukan sesudahnya seperti kartu laporan biasa.
 */
export function DashboardSpotlight({
  title,
  subtitle,
  icon: Icon,
  value,
  unit,
  hint,
  badge,
  chart,
  metrics,
  className,
}: DashboardSpotlightProps) {
  return (
    <Card className={cn("flex flex-col overflow-hidden p-0", className)}>
      <div className="relative border-b border-gray-100 bg-gradient-to-br from-white via-white to-[#4ba69d]/[0.04] px-5 pb-1 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#075489]/8 text-[#075489]">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-gray-800">{title}</h2>
              {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>

          {badge && (
            <Badge variant="info" className="shrink-0">
              {badge}
            </Badge>
          )}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <span className="text-4xl font-bold leading-none tabular-nums text-gray-900">{value}</span>
          {unit && <span className="mb-0.5 text-sm text-gray-500">{unit}</span>}
        </div>
        {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
      </div>

      {/* Grafik diberi padding kecil sendiri; `TrendChart` sudah mengukur lebar
          wadahnya, jadi ia boleh mengisi penuh sisa kartu. */}
      <div className="px-2 pt-2">{chart}</div>

      {metrics.length > 0 && (
        <div className="mt-auto grid grid-cols-2 divide-x divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/40 sm:grid-cols-4 sm:divide-y-0">
          {metrics.map((metric, i) => (
            <div key={i} className="min-w-0 px-4 py-3">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {metric.label}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
                {metric.value}
              </p>
              {metric.hint && <p className="mt-0.5 truncate text-[10px] text-gray-400">{metric.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

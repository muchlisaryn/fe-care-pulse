import type { LucideIcon } from "lucide-react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type InsightBannerTone = "info" | "warning"

type InsightBannerProps = {
  title: string
  description: string
  icon?: LucideIcon
  tone?: InsightBannerTone
  action?: React.ReactNode
  className?: string
}

/**
 * Bilah ringkasan di atas dashboard — satu kalimat yang menjawab "apa yang
 * perlu saya lihat hari ini?".
 *
 * Dua nada: `info` (teal) untuk keadaan yang sudah beres, `warning` (amber)
 * untuk angka yang menunggu tindakan. Tidak ada nada merah: bilah ini tidak
 * menggantikan status mendesak di kartu angka masing-masing.
 */
export function InsightBanner({
  title,
  description,
  icon: Icon = Sparkles,
  tone = "info",
  action,
  className,
}: InsightBannerProps) {
  const warning = tone === "warning"

  return (
    <div
      role="status"
      className={cn(
        "relative overflow-hidden rounded-xl border px-4 py-3.5",
        warning
          ? "border-amber-200 bg-gradient-to-r from-amber-50 via-amber-50/80 to-white"
          : "border-[#4ba69d]/25 bg-gradient-to-r from-[#075489]/[0.05] via-[#4ba69d]/[0.08] to-white",
        className,
      )}
    >
      {/* Lingkaran kabur di sudut kanan: pengisi ruang kosong agar bilahnya
          tidak terlihat seperti kotak polos, tanpa menambah elemen interaktif. */}
      <span
        className={cn(
          "pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full blur-2xl",
          warning ? "bg-amber-100/80" : "bg-[#4ba69d]/10",
        )}
      />

      <div className="relative flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1",
            warning ? "text-amber-600 ring-amber-200" : "text-[#0d8b7d] ring-[#4ba69d]/20",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{description}</p>
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}

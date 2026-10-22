import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type SectionHeadingProps = {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * Judul pemisah antar-modul di satu halaman dashboard (mis. CSSD lalu Nafsul).
 *
 * Berbeda dari `PageHeader` yang menamai halaman, komponen ini menamai BAGIAN.
 * Ukurannya lebih kecil supaya hierarkinya jelas: halaman → bagian → kartu.
 */
export function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#075489]/8 text-[#075489]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-gray-900">{title}</h2>
          {description && <p className="truncate text-xs text-gray-500">{description}</p>}
        </div>
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

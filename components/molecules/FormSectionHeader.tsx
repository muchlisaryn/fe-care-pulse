import type { LucideIcon } from "lucide-react"

type FormSectionHeaderProps = {
  icon: LucideIcon
  title: string
  description?: string
  /** Tailwind text/bg accent, e.g. "#075489" (default) or "#4ba69d". */
  accent?: string
  action?: React.ReactNode
}

// Judul sub-bagian form: ikon di kotak beraksen + judul + deskripsi opsional.
// Dipakai berulang di form untuk mengelompokkan field sesuai fungsinya.
export function FormSectionHeader({
  icon: Icon,
  title,
  description,
  accent = "#075489",
  action,
}: FormSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-gray-400">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

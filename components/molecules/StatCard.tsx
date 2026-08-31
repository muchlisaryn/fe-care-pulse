import { cn } from "@/lib/utils"
import { Card } from "@/components/molecules/Card"
import type { LucideIcon } from "lucide-react"

/**
 * Nada kartu — hanya mewarnai LENCANA IKON, tidak pernah angkanya.
 *
 * Angka tetap hitam di semua nada: warna di kartu ini menandai jenis kabar
 * (netral / baik / perlu perhatian / bermasalah), sedangkan nilainya sendiri
 * harus sama-sama mudah dibaca. `danger` disediakan untuk keadaan yang benar
 * memerlukan tindakan — bukan sekadar variasi warna.
 */
const toneMap = {
  default: "bg-[#075489]/8 text-[#075489]",
  success: "bg-[#0d8b7d]/10 text-[#0d8b7d]",
  warning: "bg-[#b45309]/10 text-[#b45309]",
  danger: "bg-red-50 text-[#b91c1c]",
} as const

export type StatCardTone = keyof typeof toneMap

type StatCardProps = {
  title: string
  value: string
  change?: string
  positive?: boolean
  icon: LucideIcon
  tone?: StatCardTone
  /** Keterangan kecil di bawah angka — satuan atau cakupan ("bulan ini"). */
  hint?: string
  className?: string
}

export function StatCard({
  title,
  value,
  change,
  positive = true,
  icon: Icon,
  tone = "default",
  hint,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-500">{title}</p>
          {/* Ukuran huruf mengecil untuk nilai yang panjang. Nominal rupiah
              seperti "Rp 1.949.988" tidak muat satu baris pada `text-3xl` di
              kartu seperempat lebar, dan yang terjadi bukan terpotong melainkan
              MEMBUNGKUS — "Rp" sendirian di baris pertama, angkanya di bawah.
              Angka pendek tetap besar supaya kartu jumlah tidak ikut mengecil. */}
          <p
            className={cn(
              "mt-1 font-bold tabular-nums text-gray-900",
              value.length > 13 ? "text-xl" : value.length > 9 ? "text-2xl" : "text-3xl",
            )}
          >
            {value}
          </p>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {hint && <p className="mt-2 text-xs text-gray-400">{hint}</p>}

      {change && (
        <p className={cn("mt-3 text-xs font-medium", positive ? "text-[#0d8b7d]" : "text-red-500")}>
          {change}
        </p>
      )}
    </Card>
  )
}

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/molecules/Card"
import { cn } from "@/lib/utils"

const toneMap = {
  default: "bg-[#075489]/8 text-[#075489]",
  success: "bg-[#0d8b7d]/10 text-[#0d8b7d]",
  warning: "bg-[#b45309]/10 text-[#b45309]",
} as const

type NavTileCardProps = {
  icon: LucideIcon
  title: string
  description: string
  /** Angka pendamping di kanan (mis. jumlah antrean); boleh dikosongkan. */
  value?: string
  tone?: keyof typeof toneMap
  className?: string
} & (
  | { href: string; onClick?: never }
  /**
   * Kartu yang MEMBUKA sesuatu di tempat (mis. modal intip dashboard) alih-alih
   * berpindah halaman. Salah satu dari `href` atau `onClick` wajib ada — dan
   * tidak boleh keduanya: kartu yang sekaligus menautkan dan menangani klik
   * akan berpindah halaman tepat saat modalnya terbuka.
   */
  | { onClick: () => void; href?: never }
)

/**
 * Kartu pintasan — dipakai dashboard utama untuk menuju atau mengintip
 * dashboard per peran.
 *
 * Tingginya dibuat sama rata (`h-full` + `flex`) supaya sederet kartu dengan
 * panjang keterangan berbeda tetap membentuk baris yang lurus.
 */
export function NavTileCard({
  href,
  onClick,
  icon: Icon,
  title,
  description,
  value,
  tone = "default",
  className,
}: NavTileCardProps) {
  const isi = (
    <Card className="flex h-full items-center gap-4 text-left transition-all hover:border-[#075489]/40 hover:shadow-md">
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", toneMap[tone])}>
        <Icon className="h-6 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{description}</p>
      </div>

      {value && <span className="shrink-0 text-2xl font-bold tabular-nums text-gray-900">{value}</span>}
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className={cn("block h-full", className)}>
        {isi}
      </Link>
    )
  }

  // `type="button"`: tanpa itu, kartu yang kebetulan berada di dalam form akan
  // mengirim form-nya saat diklik.
  return (
    <button type="button" onClick={onClick} className={cn("block h-full w-full", className)}>
      {isi}
    </button>
  )
}

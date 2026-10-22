import { MiniProgress } from "@/components/atoms/MiniProgress"
import { cn } from "@/lib/utils"

export type ProgressBarItem = {
  key: string
  label: string
  /** Nilai 0–100 untuk panjang bilah. */
  value: number
  /** Teks nilai di kanan label — persen, nominal, atau gabungan keduanya. */
  display: string
  color?: string
}

type ProgressBarListProps = {
  items: ProgressBarItem[]
  className?: string
}

/**
 * Daftar beberapa proporsi sekaligus.
 *
 * Berbeda dari `RankList` yang mengurutkan besaran, di sini urutannya tetap
 * mengikuti entitas (cara bayar) supaya posisi tiap baris tidak berpindah saat
 * angkanya berubah. Warna tiap baris juga mengikuti entitas yang sama.
 */
export function ProgressBarList({ items, className }: ProgressBarListProps) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color ?? "#0d8b7d" }}
              />
              <span className="truncate text-xs text-gray-600">{item.label}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-900">
              {item.display}
            </span>
          </div>
          <MiniProgress value={item.value} color={item.color} className="mt-1.5" />
        </li>
      ))}
    </ul>
  )
}

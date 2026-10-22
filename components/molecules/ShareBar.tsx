import { cn } from "@/lib/utils"
import { persen } from "@/lib/format"

export type ShareBarItem = {
  key: string
  label: string
  value: number
  /** Porsi 0–100. Jumlah seluruh item sebaiknya 100. */
  percent: number
  color: string
}

type ShareBarProps = {
  items: ShareBarItem[]
  formatValue?: (n: number) => string
  emptyLabel: string
  className?: string
}

/**
 * Satu batang bertumpuk + legenda — komposisi beberapa entitas dalam satu total.
 *
 * Dipakai untuk "order per ruangan": pertanyaan pertamanya "ruangan mana yang
 * paling besar porsinya", dan satu batang horizontal menjawab itu lebih cepat
 * daripada deretan batang terpisah. Legenda di bawah wajib ada karena warna
 * tidak boleh menjadi satu-satunya pembeda.
 */
export function ShareBar({
  items,
  formatValue = (n) => String(n),
  emptyLabel,
  className,
}: ShareBarProps) {
  const terisi = items.filter((item) => item.percent > 0)

  if (terisi.length === 0) {
    return <div className={cn("py-14 text-center text-sm text-gray-400", className)}>{emptyLabel}</div>
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className="flex h-10 w-full overflow-hidden rounded-lg bg-gray-100"
        role="img"
        aria-label={items.map((item) => `${item.label}: ${persen(item.percent)}`).join(", ")}
      >
        {terisi.map((item) => (
          <span
            key={item.key}
            className="h-full first:rounded-l-lg last:rounded-r-lg"
            style={{
              width: `${Math.min(100, Math.max(0, item.percent))}%`,
              backgroundColor: item.color,
            }}
          />
        ))}
      </div>

      {/* Dua kolom di kartu selebar seperempat layar; tiga kolom saat kartunya
          melebar penuh di tablet. Lima kolom membuat nama ruangan dan "39 order"
          terpotong menjadi "AN ..." / "39 or...". */}
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-xs text-gray-500" title={item.label}>
                {item.label}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold tabular-nums text-gray-900">
              {formatValue(item.value)}
            </p>
            <p className="text-[11px] text-gray-400">{persen(item.percent)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

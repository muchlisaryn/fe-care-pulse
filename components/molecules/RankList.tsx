import { cn } from "@/lib/utils"
import { CHART_PRIMARY } from "@/lib/chartPalette"

export type RankItem = {
  id: string | number
  name: string
  /** Baris kecil di bawah nama — kode alat, kode ruangan. */
  meta?: string | null
  value: number
  /** Panjang batang 0–100, sudah dihitung backend. */
  percent: number
}

type RankListProps = {
  items: RankItem[]
  formatValue?: (n: number) => string
  color?: string
  emptyLabel: string
  className?: string
}

/**
 * Daftar peringkat berbatang — alat terlaris, ruangan peminjam terbanyak.
 *
 * Batang horizontal, bukan grafik batang tegak: labelnya berupa NAMA yang
 * panjang dan berbeda-beda, dan nama panjang pada sumbu tegak selalu berakhir
 * miring atau terpotong.
 *
 * Nomor urutnya dicetak eksplisit — urutan menurun sudah terlihat dari panjang
 * batang, tapi angka peringkat membuat "nomor berapa" bisa dibaca langsung
 * tanpa menghitung baris.
 */
export function RankList({
  items,
  formatValue = (n) => String(n),
  color = CHART_PRIMARY,
  emptyLabel,
  className,
}: RankListProps) {
  if (items.length === 0) {
    return (
      <div className={cn("py-10 text-center text-sm text-gray-400", className)}>{emptyLabel}</div>
    )
  }

  return (
    <ol className={cn("space-y-3.5", className)}>
      {items.map((item, i) => (
        <li key={item.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-gray-400">{i + 1}</span>
              <span className="truncate text-sm text-gray-800">{item.name}</span>
              {item.meta ? (
                <span className="shrink-0 text-xs text-gray-400">{item.meta}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
              {formatValue(item.value)}
            </span>
          </div>

          <div className="mt-1.5 ml-6 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              // Lebar minimum 2%: nilai terkecil tetap harus terlihat sebagai
              // batang, bukan lenyap jadi jalur kosong.
              style={{ width: `${Math.max(item.percent, 2)}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

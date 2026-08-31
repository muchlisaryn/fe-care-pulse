import { Card } from "@/components/molecules/Card"
import { cn } from "@/lib/utils"

type ChartCardProps = {
  title: string
  subtitle?: string
  /** Kontrol kecil di kanan judul (mis. pemilih bulan) — satu baris saja. */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Bingkai seragam untuk tiap panel dashboard: judul, keterangan, dan satu slot
 * kontrol di kanan.
 *
 * Semua panel di seluruh dashboard memakai ini supaya tinggi kepala, jarak, dan
 * ukuran hurufnya identik — itulah yang membuat baris-baris kartu terlihat
 * sejajar walau isinya berbeda-beda (grafik, cincin, atau daftar peringkat).
 */
export function ChartCard({ title, subtitle, action, children, className }: ChartCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-800">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* `flex-1` + `justify-center`: panel yang isinya lebih pendek dari
          tetangganya tetap rata tinggi dan isinya duduk di tengah, sehingga
          barisnya tidak terlihat pincang. */}
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </Card>
  )
}

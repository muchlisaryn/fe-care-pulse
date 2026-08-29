import { Card } from "@/components/molecules/Card"

type DashboardFilterBarProps = {
  /** Kendali penyaring — biasanya `DateRangeFields`. */
  children: React.ReactNode
  /** Sisi kanan bilah: tombol Reset, dan ringkasan periode yang sedang aktif. */
  action?: React.ReactNode
}

/**
 * Bilah penyaring dashboard — SATU baris, tepat di bawah judul halaman.
 *
 * Dipakai ketiga dashboard supaya letak, tinggi, dan jarak filternya persis
 * sama: begitu pengguna berpindah dashboard, kendalinya tetap di tempat yang
 * sama dan tidak perlu dicari ulang.
 *
 * Tata letaknya `justify-between`, BUKAN grid empat kolom seperti sebelumnya.
 * Dengan grid, dua kolom tanggal menempel di kiri dan menyisakan separuh bilah
 * kosong di kanan — bilahnya terlihat berat sebelah. Di sini kendali mengisi
 * ujung kiri dan tombol Reset mengisi ujung kanan, jadi kedua sisinya berbobot.
 *
 * `items-end` membuat semua kendali rata bawah walau panjang labelnya berbeda.
 */
export function DashboardFilterBar({ children, action }: DashboardFilterBarProps) {
  return (
    <Card className="py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* Lebar tiap kendali dipatok di sini, bukan dibiarkan mengikuti sisa
            ruang: input tanggal yang meregang selebar layar terlihat seperti
            kolom pencarian, bukan penyaring. */}
        <div className="flex flex-wrap items-end gap-4 [&>div]:w-full [&>div]:sm:w-48">
          {children}
        </div>

        {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
      </div>
    </Card>
  )
}

/** Satu kendali berlabel di dalam `DashboardFilterBar`, gaya labelnya seragam. */
export function DashboardFilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}

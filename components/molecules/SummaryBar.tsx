import { cn } from "@/lib/utils"

export type SummaryItem = {
  label: string
  value: string
  /**
   * Angka pokok yang menjawab pertanyaan laporan (mis. uang yang benar-benar
   * diterima). Ditebalkan dan diberi warna merek; sisanya tetap abu supaya yang
   * satu ini terbaca lebih dulu.
   */
  emphasis?: boolean
}

/**
 * Deret angka rekap di atas tabel laporan.
 *
 * Bukan `StatCard`: kartu itu untuk dashboard — satu angka besar per kotak,
 * dengan ikon dan tren. Yang dibutuhkan laporan adalah lima sampai enam angka
 * yang dibaca BERSAMAAN sebagai satu penjumlahan (total, potongan, jasa,
 * diterima), dan deretan kartu setinggi itu mendorong tabelnya keluar layar.
 *
 * Angkanya SELALU mewakili seluruh baris hasil saring, bukan halaman yang
 * sedang tampil — itu sebabnya komponen ini duduk di atas tabel, di luar
 * paginasinya.
 */
export function SummaryBar({ items, className }: { items: SummaryItem[]; className?: string }) {
  if (items.length === 0) return null

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-4 border-b border-gray-100 bg-gray-50/60 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {item.label}
          </dt>
          <dd
            className={cn(
              "mt-1 truncate text-base font-semibold tabular-nums",
              item.emphasis ? "text-[#075489]" : "text-gray-800",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

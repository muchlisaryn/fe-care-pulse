/**
 * Judul bagian di dalam `Card` (mis. Perlu Disimpan / Inventaris Gudang) + jumlah
 * opsional + aksi opsional di kanan. Dipakai halaman Gudang Steril & Gudang Steril BMHP.
 */
export function CardSectionHeader({
  title,
  count,
  children,
}: {
  title: string
  /** null = jumlah tidak ditampilkan. */
  count: number | null
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        {title}
        {count !== null && (
          <span className="rounded-full bg-[#075489]/10 px-1.5 py-0.5 text-sm font-semibold text-[#075489]">
            {count}
          </span>
        )}
      </h2>
      {children}
    </div>
  )
}

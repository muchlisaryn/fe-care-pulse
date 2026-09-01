/**
 * Sel rupiah pada tabel: "Rp" dipatok di kiri, angka di kanan
 * (`justify-between`) supaya antar-baris "Rp"-nya sejajar di kiri dan digitnya
 * sejajar di kanan — tidak ikut bergeser saat panjang angkanya berbeda. Itulah
 * yang membuat satu kolom nominal bisa dibaca sekilas sebagai deret angka,
 * bukan sebagai teks rata kanan yang huruf "Rp"-nya berloncatan.
 *
 * Nilai datang sebagai STRING dari kolom DECIMAL; nilai yang bukan angka
 * (termasuk null yang sudah jadi "NaN") tampil sebagai em dash, tidak pernah
 * sebagai sel kosong.
 */
export function CurrencyCell({
  value,
  className,
}: {
  value: string | number | null | undefined
  className?: string
}) {
  const angka = Number(value)

  if (value === null || value === undefined || value === "" || !Number.isFinite(angka)) {
    return <span className={`tabular-nums ${className ?? ""}`}>—</span>
  }

  return (
    <span className={`flex justify-between gap-3 tabular-nums ${className ?? ""}`}>
      <span>Rp</span>
      <span>{angka.toLocaleString("id-ID", { maximumFractionDigits: 0 })}</span>
    </span>
  )
}

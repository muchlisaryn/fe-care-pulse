/**
 * Pemformat angka yang dipakai bersama seluruh dashboard.
 *
 * Ditaruh di satu tempat karena rupiah sebelumnya ditulis ulang di tiap halaman
 * transaksi — begitu formatnya berubah (mis. sen ikut ditampilkan), yang terlewat
 * satu halaman akan diam-diam menampilkan angka dengan bentuk berbeda.
 */

/** "Rp 1.949.988" — tanpa sen, karena iuran selalu bulat. */
export function rupiah(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "Rp 0"
  return `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`
}

/**
 * Rupiah ringkas untuk SUMBU grafik: "1,9 jt", "250 rb".
 *
 * Sumbu memakai bentuk ringkas, tooltip memakai `rupiah()` yang utuh — angka
 * pastinya tetap bisa dibaca saat kursor diarahkan, tanpa membuat sumbunya
 * dipenuhi digit yang saling tindih.
 */
export function rupiahRingkas(value: number): string {
  const n = Number(value) || 0
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${bulatkan(n / 1_000_000_000)} m`
  if (abs >= 1_000_000) return `${bulatkan(n / 1_000_000)} jt`
  if (abs >= 1_000) return `${bulatkan(n / 1_000)} rb`
  return String(Math.round(n))
}

/** Satu desimal, dan itu pun dibuang kalau nol — "1,9" tapi "2" bukan "2,0". */
function bulatkan(n: number): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 1 })
}

/** Angka biasa dengan pemisah ribuan — jumlah order, unit, kuitansi. */
export function angka(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("id-ID")
}

/** "12,5%" — persen selalu satu desimal agar lebarnya stabil di kartu. */
export function persen(value: number | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`
}

/**
 * Awal & akhir bulan berjalan dalam "YYYY-MM-DD" — bawaan penyaring semua
 * dashboard.
 *
 * Ditaruh di sini, bukan disalin di tiap halaman: kalau bawaannya pernah
 * berubah (mis. jadi 30 hari terakhir), yang terlewat satu halaman akan
 * diam-diam menampilkan periode yang berbeda dari tetangganya.
 */
export function rentangBulanIni(): { from: string; to: string } {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const akhir = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

  return {
    from: `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`,
    to: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(akhir)}`,
  }
}

/** "1 Agu – 31 Agu 2026" — label periode untuk subjudul panel. */
export function labelRentang(from: string, to: string): string {
  if (!from || !to) return "—"

  const a = new Date(from)
  const b = new Date(to)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${from} – ${to}`

  const hariBulan = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })

  // Tahun hanya ditulis sekali kalau keduanya setahun — "1 Agu 2026 – 31 Agu
  // 2026" mengulang informasi yang sama dan memakan lebar subjudul.
  return a.getFullYear() === b.getFullYear()
    ? `${hariBulan(a)} – ${hariBulan(b)} ${b.getFullYear()}`
    : `${hariBulan(a)} ${a.getFullYear()} – ${hariBulan(b)} ${b.getFullYear()}`
}

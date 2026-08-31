/**
 * Rentang tanggal bawaan untuk halaman daftar yang menyaring per tanggal.
 *
 * Ditaruh di satu tempat karena dipakai lebih dari satu slice (transaksi
 * Nafsul, order instrumen): kalau tiap slice menghitung sendiri, "sebulan
 * terakhir" bisa berarti hal berbeda di tiap halaman.
 */

/**
 * Tanggal "YYYY-MM-DD" menurut waktu LOKAL perangkat.
 *
 * Bukan `toISOString()` yang memakai UTC: di WIB (UTC+7) tanggal sebelum pukul
 * 07.00 akan mundur satu hari, dan data hari ini ikut tersaring keluar.
 */
export function tanggalLokal(d: Date): string {
  const bulan = String(d.getMonth() + 1).padStart(2, "0")
  const tanggal = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${bulan}-${tanggal}`
}

/**
 * Sebulan ke belakang sampai hari ini.
 *
 * Dipakai sebagai isi awal penyaring tanggal, bukan dibiarkan kosong: datanya
 * menumpuk terus, dan yang dibuka petugas hampir selalu yang belakangan ini.
 */
export function rentangSebulanTerakhir(): { from: string; to: string } {
  const kini = new Date()
  const sebulanLalu = new Date(kini)
  sebulanLalu.setMonth(sebulanLalu.getMonth() - 1)
  return { from: tanggalLokal(sebulanLalu), to: tanggalLokal(kini) }
}

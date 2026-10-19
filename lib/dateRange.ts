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
 * Geser tanggal "YYYY-MM-DD" sebanyak `hari` (boleh negatif), dihitung dalam waktu
 * LOKAL — bukan lewat `new Date("YYYY-MM-DD")` yang dibaca sebagai UTC.
 */
export function geserTanggal(ymd: string, hari: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return tanggalLokal(new Date(y, m - 1, d + hari))
}

/** Jumlah hari kalender dalam rentang inklusif, mis. 17–19 → 3. */
export function jumlahHari(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number)
  const [y2, m2, d2] = to.split("-").map(Number)
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86_400_000) + 1
}

/**
 * Seminggu ke belakang sampai hari ini.
 *
 * Dipakai sebagai isi awal penyaring tanggal, bukan dibiarkan kosong: datanya
 * menumpuk terus, dan yang dibuka petugas hampir selalu yang belakangan ini.
 */
export function rentangSemingguTerakhir(): { from: string; to: string } {
  const kini = new Date()
  const semingguLalu = new Date(kini)
  semingguLalu.setDate(semingguLalu.getDate() - 7)
  return { from: tanggalLokal(semingguLalu), to: tanggalLokal(kini) }
}

/** Sebulan ke belakang sampai hari ini — lihat `rentangSemingguTerakhir`. */
export function rentangSebulanTerakhir(): { from: string; to: string } {
  const kini = new Date()
  const sebulanLalu = new Date(kini)
  sebulanLalu.setMonth(sebulanLalu.getMonth() - 1)
  return { from: tanggalLokal(sebulanLalu), to: tanggalLokal(kini) }
}

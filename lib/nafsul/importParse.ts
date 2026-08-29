// Helper murni untuk impor Excel — TIDAK menyentuh DOM sama sekali, supaya
// modul ini bisa dipakai dari Web Worker maupun dari komponen React.
//
// SheetJS CE ("xlsx") mengabaikan style saat menulis file; fork ini API-nya sama
// persis tapi ikut menulis fill/font, dipakai untuk menyorot kolom wajib.
//
// Impor DEFAULT, bukan `import * as`: paket ini CommonJS, dan bentuk namespace
// hanya bekerja lewat interop bundler. Modul ini sengaja tetap bisa dijalankan
// di Node polos — jalur terberat aplikasi ini (membaca ratusan ribu baris)
// harus bisa diukur tanpa membuka peramban.
import XLSX from "xlsx-js-style"

export type ParsedRow = Record<string, string | number> & { baris: number }

/** Bagian ImportColumn yang dibutuhkan saat membaca file. */
export interface KolomBaca {
  header: string
  field: string
}

/** Judul kolom dicocokkan tanpa spasi/tanda baca & tanpa membedakan huruf besar-kecil. */
export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

const pad = (n: number) => String(n).padStart(2, "0")

/** Sel Excel → teks. Tanggal dipakai apa adanya (tanpa geser zona waktu). */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  return String(value).trim()
}

/**
 * Satu sheet Excel → daftar baris yang sudah dipetakan ke nama field API.
 *
 * Judul kolom dicocokkan lewat `normalize`, jadi "No. Anggota", "no anggota",
 * dan "no_anggota" sama-sama dikenali — file yang diketik ulang pengguna jarang
 * persis sama dengan templatnya.
 *
 * Dibaca sebagai ARRAY per baris (`header: 1`), bukan sebagai objek berkunci
 * judul kolom. Dua alasannya, dan keduanya baru terasa pada file besar:
 *
 *  1. Mode objek membuat satu objek berisi SELURUH judul kolom untuk tiap baris,
 *     lalu kita membuat objek kedua hasil pemetaannya — dua kali alokasi untuk
 *     tiap baris. Pada 300 ribu baris itu selisih ratusan megabyte.
 *  2. Mode objek membuang baris kosong lebih dulu, sehingga nomor baris yang
 *     dilaporkan meleset begitu ada baris kosong di tengah file. Di sini indeks
 *     larik langsung menjadi nomor baris Excel-nya.
 *
 * `onProgress` dipanggil sesekali (bukan tiap baris) supaya pemanggilnya bisa
 * menampilkan kemajuan tanpa membanjiri kanal pesan worker.
 */
export function bacaSheet(
  sheet: XLSX.WorkSheet,
  kolom: KolomBaca[],
  onProgress?: (dibaca: number, total: number) => void,
): ParsedRow[] {
  const fieldByHeader = new Map<string, string>()
  kolom.forEach((c) => {
    fieldByHeader.set(normalize(c.header), c.field)
    fieldByHeader.set(normalize(c.field), c.field)
  })

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    // Baris kosong TIDAK dibuang: indeks larik inilah yang jadi nomor baris
    // Excel, dan membuangnya membuat seluruh nomor setelahnya bergeser.
    blankrows: true,
  })

  // Judul kolom diterjemahkan ke nama field SEKALI di depan. Tanpa ini tiap sel
  // dari tiap baris harus dinormalisasi ulang — 300 ribu baris × jumlah kolom.
  const judul = (aoa[0] ?? []).map((h) => cellToString(h))
  const fieldPerKolom = judul.map((h) => fieldByHeader.get(normalize(h)))

  const hasil: ParsedRow[] = []
  const total = aoa.length

  for (let i = 1; i < total; i++) {
    const baris = aoa[i]
    if (!baris) continue

    // Baris 1 file Excel dipakai judul kolom, jadi data di indeks i ada di
    // baris i+1.
    const row: ParsedRow = { baris: i + 1 }
    let adaIsi = false

    for (let c = 0; c < fieldPerKolom.length; c++) {
      const field = fieldPerKolom[c]
      if (!field) continue

      const teks = cellToString(baris[c])
      row[field] = teks
      if (teks !== "") adaIsi = true
    }

    // Baris yang seluruh selnya kosong diabaikan diam-diam.
    if (adaIsi) hasil.push(row)

    if (onProgress && i % 5000 === 0) onProgress(i, total)
  }

  onProgress?.(total, total)

  return hasil
}

/**
 * Bagi baris jadi beberapa permintaan.
 *
 * Tanpa `kunciGrup`, potongannya lurus sebesar `ukuran`. Dengan `kunciGrup`,
 * baris yang punya nilai kunci sama tidak pernah terpecah ke dua permintaan —
 * server menggabungkannya jadi satu kesatuan (mis. satu kuitansi transaksi),
 * dan grup yang terbelah akan tersimpan sebagai dua kesatuan berbeda.
 *
 * Baris tanpa nilai kunci berdiri sendiri. Grup yang lebih besar dari `ukuran`
 * tetap dikirim utuh dalam satu permintaan — memecahnya justru merusak
 * artinya; batas baris di server dipasang lebih longgar untuk menampungnya.
 *
 * MAHAL untuk daftar besar: hanya boleh dipanggil sekali per file, jangan
 * pernah dari dalam render.
 */
export function bagiBatch(
  rows: ParsedRow[],
  ukuran: number,
  kunciGrup?: string,
): ParsedRow[][] {
  if (!kunciGrup) {
    const hasil: ParsedRow[][] = []
    for (let i = 0; i < rows.length; i += ukuran) hasil.push(rows.slice(i, i + ukuran))
    return hasil
  }

  // Baris segrup tidak harus berdampingan di file, jadi dikumpulkan dulu lewat
  // Map — urutan penyisipannya menjaga grup tetap muncul sesuai urutan file.
  const grup = new Map<string, ParsedRow[]>()

  rows.forEach((row) => {
    const nilai = String(row[kunciGrup] ?? "").trim()
    // Prefiks "k:" vs "b:" menjaga baris tanpa kunci tetap berdiri sendiri
    // tanpa pernah bertabrakan dengan nilai kunci yang kebetulan sama.
    const kunci = nilai === "" ? `b:${row.baris}` : `k:${nilai}`
    const isi = grup.get(kunci)
    if (isi) isi.push(row)
    else grup.set(kunci, [row])
  })

  const hasil: ParsedRow[][] = []
  let berjalan: ParsedRow[] = []

  grup.forEach((anggota) => {
    if (berjalan.length > 0 && berjalan.length + anggota.length > ukuran) {
      hasil.push(berjalan)
      berjalan = []
    }
    berjalan = berjalan.concat(anggota)
  })

  if (berjalan.length > 0) hasil.push(berjalan)

  return hasil
}

/**
 * Sheet induk diindeks per nilai kunci.
 *
 * Dulu seluruh sheet induk dititipkan utuh di tiap permintaan. Itu jalan selama
 * induknya sedikit, tapi runtuh pada file besar: sheet Kuitansi berisi ribuan
 * baris membuat setiap permintaan menembus batas jumlah baris di server, dan
 * biaya kirimnya tumbuh kuadratik karena tiap batch mengulang seluruh induk.
 */
export function indeksInduk(
  barisInduk: ParsedRow[],
  kunciGrup?: string,
): { perKunci: Map<string, ParsedRow[]>; tanpaKunci: ParsedRow[] } {
  const perKunci = new Map<string, ParsedRow[]>()
  const tanpaKunci: ParsedRow[] = []

  if (!kunciGrup) return { perKunci, tanpaKunci }

  barisInduk.forEach((row) => {
    const kunci = String(row[kunciGrup] ?? "").trim()

    if (kunci === "") {
      tanpaKunci.push(row)

      return
    }

    const isi = perKunci.get(kunci)
    if (isi) isi.push(row)
    else perKunci.set(kunci, [row])
  })

  return { perKunci, tanpaKunci }
}

/** Induk yang DIRUJUK satu potongan baris. */
export function indukUntuk(
  potongan: ParsedRow[],
  indeks: { perKunci: Map<string, ParsedRow[]>; tanpaKunci: ParsedRow[] },
  kunciGrup: string,
  batchPertama: boolean,
): ParsedRow[] {
  const kunci = [...new Set(potongan.map((r) => String(r[kunciGrup] ?? "").trim()))]

  return [
    // Baris induk tanpa nilai kunci tidak bisa dicocokkan ke rincian mana pun
    // tapi tetap salah, jadi dititipkan sekali — pada batch pertama.
    ...(batchPertama ? indeks.tanpaKunci : []),
    ...kunci.filter((k) => k !== "").flatMap((k) => indeks.perKunci.get(k) ?? []),
  ]
}

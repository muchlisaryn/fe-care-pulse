// Fork SheetJS yang bisa MENULIS gaya sel — `xlsx` biasa hanya menulis dua fill
// bawaan sehingga baris header tidak bisa dibedakan dari isi.
import * as XLSX from "xlsx-js-style"

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "1F2937" } },
  fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "D1D5DB" } },
    bottom: { style: "thin", color: { rgb: "D1D5DB" } },
    left: { style: "thin", color: { rgb: "D1D5DB" } },
    right: { style: "thin", color: { rgb: "D1D5DB" } },
  },
} as const

/**
 * Unduh data tabel sebagai .xlsx: baris pertama = header (tebal, latar abu), sisanya
 * isi. Nilai `null`/`undefined` jadi sel kosong. Lebar kolom mengikuti isi terpanjang
 * (dibatasi 40 karakter) supaya tidak perlu diatur manual saat dibuka.
 */
export function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: readonly string[],
  rows: readonly (string | number | null | undefined)[][],
): void {
  const body = rows.map((row) => row.map((cell) => cell ?? ""))
  const sheet = XLSX.utils.aoa_to_sheet([[...headers], ...body])

  headers.forEach((_, i) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: i })]
    if (cell) cell.s = HEADER_STYLE
  })

  sheet["!cols"] = headers.map((header, i) => {
    const longest = body.reduce((max, row) => Math.max(max, String(row[i] ?? "").length), header.length)
    return { wch: Math.min(longest + 2, 40) }
  })

  const wb = XLSX.utils.book_new()
  // Nama sheet Excel maksimum 31 karakter.
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}

/** Judul laporan (baris pertama): tebal & besar, ditengahkan selebar tabel. */
const REPORT_TITLE_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: "111827" } },
  alignment: { horizontal: "center", vertical: "center" },
} as const

/** Baris keterangan di bawah judul (nama instansi, rentang tanggal). */
const REPORT_SUBTITLE_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "374151" } },
  alignment: { horizontal: "center", vertical: "center" },
} as const

/**
 * Nama kelompok (mis. nama ruangan): tebal di atas latar biru muda, digabung
 * selebar tabel supaya jelas terbaca sebagai pemisah antar kelompok.
 */
const GROUP_TITLE_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "075489" } },
  fill: { patternType: "solid", fgColor: { rgb: "DCE7F1" } },
  alignment: { horizontal: "left", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "9FBBD4" } },
    bottom: { style: "thin", color: { rgb: "9FBBD4" } },
    left: { style: "thin", color: { rgb: "9FBBD4" } },
    right: { style: "thin", color: { rgb: "9FBBD4" } },
  },
} as const

/** Sel yang isinya ditengahkan (mis. kolom nomor urut). */
const CENTER_STYLE = { alignment: { horizontal: "center", vertical: "center" } } as const

/** Satu kelompok baris di bawah satu judul (mis. satu ruangan beserta isinya). */
export type XlsxGroup = {
  title: string
  rows: readonly (string | number | null | undefined)[][]
}

/**
 * Unduh laporan REKAPAN berkelompok sebagai .xlsx dengan susunan:
 *
 * ```
 * JUDUL LAPORAN            ← titles[0]  (tebal besar, ditengahkan)
 * NAMA INSTANSI            ← titles[1..]
 * TANGGAL ... SAMPAI ...
 *
 * No | Nama Barang | QTY   ← baris header tabel
 *
 * NAMA RUANGAN
 *
 * 1  | ...        | 3      ← baris kelompok (penomoran dimulai ulang tiap kelompok)
 * 2  | ...        | 5
 *
 * NAMA RUANGAN BERIKUTNYA
 * ...
 * ```
 *
 * Baris kosong sengaja disisipkan sebagai pemisah supaya rekapan tetap terbaca saat
 * dicetak — kelompoknya berdiri sendiri, tidak diulang di tiap baris.
 */
export function downloadXlsxReport(
  filename: string,
  sheetName: string,
  titles: readonly string[],
  headers: readonly string[],
  groups: readonly XlsxGroup[],
  /** Indeks kolom yang isinya ditengahkan (mis. `[0]` untuk kolom "No"). */
  centerColumns: readonly number[] = [],
): void {
  const blank = () => headers.map(() => "")
  const aoa: (string | number | null | undefined)[][] = []
  const groupTitleRows: number[] = []

  titles.forEach((t) => aoa.push([t, ...headers.slice(1).map(() => "")]))
  aoa.push(blank())

  const headerRow = aoa.length
  aoa.push([...headers])

  groups.forEach((g) => {
    aoa.push(blank())
    groupTitleRows.push(aoa.length)
    aoa.push([g.title, ...headers.slice(1).map(() => "")])
    aoa.push(blank())
    g.rows.forEach((row) => aoa.push(row.map((cell) => cell ?? "")))
  })

  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  const lastCol = Math.max(0, headers.length - 1)

  // Judul, keterangan, DAN nama kelompok digabung selebar tabel: judul agar
  // benar-benar berada di tengah, nama kelompok agar latar warnanya memenuhi baris.
  sheet["!merges"] = [...titles.map((_, r) => r), ...groupTitleRows].map((r) => ({
    s: { r, c: 0 },
    e: { r, c: lastCol },
  }))

  titles.forEach((_, r) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: 0 })]
    if (cell) cell.s = r === 0 ? REPORT_TITLE_STYLE : REPORT_SUBTITLE_STYLE
  })

  headers.forEach((_, c) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })]
    if (cell) cell.s = HEADER_STYLE
  })

  // Sel gabungan mengambil gaya dari sel kiri-atasnya, tapi sel lain di baris itu
  // tetap diberi gaya yang sama supaya latar & garisnya tidak terpotong di sebagian
  // pembaca spreadsheet (mis. LibreOffice / Google Sheets).
  groupTitleRows.forEach((r) => {
    headers.forEach((_, c) => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (cell) cell.s = GROUP_TITLE_STYLE
    })
  })

  // Kolom bernomor (mis. "No") ditengahkan pada seluruh baris isinya.
  if (centerColumns.length > 0) {
    for (let r = headerRow + 1; r < aoa.length; r++) {
      if (groupTitleRows.includes(r)) continue
      centerColumns.forEach((c) => {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })]
        if (cell) cell.s = CENTER_STYLE
      })
    }
  }

  // Lebar kolom mengikuti isi TERPANJANG di kolom itu — termasuk baris judul
  // kelompok, sehingga nama ruangan sepanjang apa pun tetap tampil penuh. Baris
  // judul laporan tidak ikut karena sudah digabung selebar tabel.
  sheet["!cols"] = headers.map((header, i) => {
    const longest = aoa
      .slice(headerRow)
      .reduce((max, row) => Math.max(max, String(row[i] ?? "").length), header.length)
    const widest = groupTitleRows.reduce(
      (max, r) => (i === 0 ? Math.max(max, String(aoa[r]?.[0] ?? "").length) : max),
      longest,
    )
    // Minimal 6 karakter supaya kolom pendek (mis. "No"/"QTY") tidak terlalu sempit.
    return { wch: Math.max(6, widest + 2) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}


/** Nomor rupiah yang tetap berupa ANGKA di Excel, hanya tampilannya berformat. */
const RUPIAH_FORMAT = '"Rp"\\ #,##0.00'

/** Garis tipis di keempat sisi — dipakai sel isi tabel bersekat. */
const BORDER_THIN = {
  top: { style: "thin", color: { rgb: "D1D5DB" } },
  bottom: { style: "thin", color: { rgb: "D1D5DB" } },
  left: { style: "thin", color: { rgb: "D1D5DB" } },
  right: { style: "thin", color: { rgb: "D1D5DB" } },
} as const

/** Judul satu seksi (mis. "PEMBAYARAN TRANSFER - NAFSUL APRIL 2026"). */
const SECTION_TITLE_STYLE = {
  font: { bold: true, sz: 12, color: { rgb: "111827" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: BORDER_THIN,
} as const

/**
 * Baris nama kolom pada lembar rekap: hijau muda, sama dengan lembar yang
 * dipakai Binroh selama ini — arsip lama dan keluaran aplikasi berdampingan di
 * folder yang sama, dan perbedaan warna membuat keduanya terbaca sebagai dua
 * dokumen yang berbeda.
 */
const SECTION_HEADER_STYLE = {
  font: { bold: true, color: { rgb: "1F2937" } },
  fill: { patternType: "solid", fgColor: { rgb: "D9EAD3" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: BORDER_THIN,
} as const

/** Sel yang isinya ANGKA rupiah (bukan teks berformat), bersekat seperti isi tabel. */
const MONEY_CELL_STYLE = {
  alignment: { horizontal: "right", vertical: "center" },
  border: BORDER_THIN,
  numFmt: RUPIAH_FORMAT,
} as const

const TEXT_CELL_STYLE = { alignment: { vertical: "center" }, border: BORDER_THIN } as const
const CENTER_CELL_STYLE = {
  alignment: { horizontal: "center", vertical: "center" },
  border: BORDER_THIN,
} as const

export type XlsxCell = string | number | null | undefined

/**
 * Satu seksi laporan: judul, header kolomnya sendiri, lalu baris isi.
 *
 * `headers` ikut per seksi, bukan sekali di atas: tiap seksi berdiri di tab
 * sendiri, dan tab tanpa nama kolom tidak bisa dibaca sama sekali.
 */
export type XlsxSection = {
  /** Nama TAB-nya di dalam berkas, mis. "Transfer". Dipotong 31 huruf (batas Excel). */
  sheetName: string
  title: string
  headers: readonly string[]
  rows: readonly XlsxCell[][]
}

/**
 * Unduh laporan BERSEKSI sebagai .xlsx — SATU TAB PER SEKSI, susunan yang sama
 * dengan lembar yang dipakai Binroh selama ini:
 *
 * ```
 * ┌ tab "Transfer" ──────────────────────────────────────────────┐
 * │ PEMBAYARAN TRANSFER - NAFSUL APRIL 2026   ← judul (digabung)  │
 * │ NO | TANGGAL | NO PEMBAYARAN | ...        ← nama kolom (hijau)│
 * │ 1  | 1/4/2026 | 2604010004   | ...                            │
 * │ 2  |          |              | ...        ← kolom kuitansi    │
 * │ ...                                          sengaja kosong   │
 * └───────────────────────────────────────────────────────────────┘
 * ┌ tab "Tunai" ─ sama bentuknya, angkanya sendiri ───────────────┐
 * ```
 *
 * Tiap cara bayar berdiri sebagai TAB sendiri, bukan ditumpuk di satu lembar —
 * bentuk arsip Binroh yang sudah berjalan, dan bentuk yang membuat tiap blok
 * bisa diurutkan atau difilter di Excel tanpa mengganggu blok lain.
 *
 * Nominal ditulis sebagai ANGKA dengan format tampilan rupiah, bukan sebagai
 * teks "Rp 84.000,00": begitu masuk Excel ia harus bisa dijumlah dan diurutkan,
 * dan teks yang kebetulan berisi digit tidak bisa keduanya.
 *
 * `moneyColumns` menyebut kolom mana yang bernominal supaya fungsinya tidak
 * perlu menebak dari isi sel — angka yang kebetulan ada di kolom lain (mis. no.
 * anggota) tidak boleh ikut berubah jadi rupiah.
 */
export function downloadXlsxSections(
  filename: string,
  sections: readonly XlsxSection[],
  /** Indeks kolom bernominal (diformat rupiah & dirata-kanankan). */
  moneyColumns: readonly number[] = [],
  /** Indeks kolom yang isinya ditengahkan (mis. "NO", "TRANSAKSI"). */
  centerColumns: readonly number[] = [],
): void {
  const wb = XLSX.utils.book_new()
  const terpakai = new Set<string>()

  sections.forEach((section, i) => {
    XLSX.utils.book_append_sheet(
      wb,
      lembarSeksi(section, moneyColumns, centerColumns),
      namaTab(section.sheetName, i, terpakai),
    )
  })

  XLSX.writeFile(wb, filename)
}

/**
 * Nama tab yang pasti diterima Excel: maksimal 31 huruf, tanpa `[]:*?/\`, dan
 * tidak boleh kembar.
 *
 * Nama kembar bukan soal teoretis — dua seksi bisa saja berjudul sama setelah
 * dipotong 31 huruf, dan `book_append_sheet` melempar galat untuk itu, yang
 * artinya seluruh unduhan gagal hanya karena nama tab.
 */
function namaTab(nama: string, urutan: number, terpakai: Set<string>): string {
  const bersih = (nama || `Sheet${urutan + 1}`).replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim()
  let hasil = bersih || `Sheet${urutan + 1}`

  for (let n = 2; terpakai.has(hasil.toLowerCase()); n++) {
    hasil = `${bersih.slice(0, 28)} (${n})`
  }

  terpakai.add(hasil.toLowerCase())
  return hasil
}

/** Satu seksi → satu worksheet: judul, nama kolom, lalu baris isi. */
function lembarSeksi(
  section: XlsxSection,
  moneyColumns: readonly number[],
  centerColumns: readonly number[],
): XLSX.WorkSheet {
  const lebar = Math.max(
    section.headers.length,
    ...section.rows.map((r) => r.length),
  )
  const kosong = () => Array.from({ length: lebar }, () => "" as XlsxCell)

  const aoa: XlsxCell[][] = []
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = []

  aoa.push([section.title, ...kosong().slice(1)])
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lebar - 1 } })

  const barisHeader = aoa.length
  aoa.push([...section.headers, ...kosong().slice(section.headers.length)])

  const barisIsi: number[] = []
  section.rows.forEach((row) => {
    barisIsi.push(aoa.length)
    aoa.push([...row.map((c) => c ?? ""), ...kosong().slice(row.length)])
  })

  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet["!merges"] = merges

  const sel = (r: number, c: number) => sheet[XLSX.utils.encode_cell({ r, c })]

  // Sel gabungan mengambil gaya dari sel kiri-atasnya, tapi sel lain di baris
  // itu tetap diberi gaya yang sama supaya sekatnya tidak terpotong di sebagian
  // pembaca spreadsheet (mis. LibreOffice / Google Sheets).
  for (let c = 0; c < lebar; c++) {
    const judul = sel(0, c)
    if (judul) judul.s = SECTION_TITLE_STYLE
    const header = sel(barisHeader, c)
    if (header) header.s = SECTION_HEADER_STYLE
  }

  barisIsi.forEach((r) => {
    for (let c = 0; c < lebar; c++) {
      const cell = sel(r, c)
      if (!cell) continue
      cell.s = moneyColumns.includes(c)
        ? MONEY_CELL_STYLE
        : centerColumns.includes(c)
          ? CENTER_CELL_STYLE
          : TEXT_CELL_STYLE
    }
  })

  // Lebar kolom mengikuti isi terpanjang di kolom itu, TANPA menghitung baris
  // judul: itu sel gabungan selebar tabel, dan panjangnya akan meregangkan
  // kolom pertama jauh melebihi isinya sendiri.
  const abaikan = new Set([0])
  sheet["!cols"] = Array.from({ length: lebar }, (_, c) => {
    const terpanjang = aoa.reduce(
      (max, row, r) => (abaikan.has(r) ? max : Math.max(max, String(row[c] ?? "").length)),
      0,
    )
    // Kolom nominal diberi ruang tetap: angkanya baru berformat "Rp …,00" saat
    // ditampilkan, sehingga panjang teks mentahnya selalu lebih pendek dari
    // yang akan terlihat.
    const minimum = moneyColumns.includes(c) ? 16 : 6
    return { wch: Math.max(minimum, Math.min(terpanjang + 2, 40)) }
  })

  return sheet
}

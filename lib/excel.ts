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


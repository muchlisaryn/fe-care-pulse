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

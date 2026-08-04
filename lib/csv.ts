/**
 * Unduh data tabel sebagai CSV. Nilai `null`/`undefined` jadi sel kosong.
 *
 * BOM (`﻿`) di depan berkas WAJIB: tanpa itu Excel di Windows membaca file
 * sebagai ANSI sehingga huruf beraksen & simbol rusak.
 */
export function downloadCsv(
  filename: string,
  headers: readonly string[],
  rows: readonly (string | number | null | undefined)[][],
): void {
  const escape = (value: string | number | null | undefined) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`

  const csv = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ].join("\n")

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

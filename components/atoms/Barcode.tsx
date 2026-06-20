"use client"

import { useMemo } from "react"

// Tabel pola Code 128 (indeks 0..106). Tiap entri = lebar modul bar/spasi
// bergantian (mulai dari bar). Indeks 106 = pola STOP (7 modul).
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]

// Encode teks ASCII (32..126) → deretan lebar modul Code 128 set B (+ checksum + stop).
function buildCode128B(text: string): number[] {
  const codes: number[] = [104] // START B
  for (const ch of text) {
    const v = ch.charCodeAt(0) - 32
    codes.push(v >= 0 && v < 95 ? v : 0)
  }
  // Checksum: (start + Σ value_i × posisi_i) mod 103, posisi mulai 1.
  let sum = 104
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i
  codes.push(sum % 103)
  codes.push(106) // STOP

  const widths: number[] = []
  for (const c of codes) {
    for (const d of CODE128_PATTERNS[c]) widths.push(Number(d))
  }
  return widths
}

type BarcodeProps = {
  value: string
  id?: string
  moduleWidth?: number
  height?: number
  /** Lebar zona kosong (modul) di kiri & kanan agar mudah dipindai. */
  quietModules?: number
  className?: string
}

/** Barcode Code 128 (set B) sebagai SVG — tanpa dependensi eksternal. */
export function Barcode({
  value,
  id,
  moduleWidth = 2,
  height = 64,
  quietModules = 10,
  className,
}: BarcodeProps) {
  const { bars, width } = useMemo(() => {
    const widths = buildCode128B(value)
    const out: { x: number; w: number }[] = []
    const quiet = quietModules * moduleWidth
    let x = quiet // sisakan zona kosong di kiri
    widths.forEach((w, i) => {
      const ww = w * moduleWidth
      if (i % 2 === 0) out.push({ x, w: ww }) // indeks genap = bar (hitam)
      x += ww
    })
    return { bars: out, width: x + quiet } // + zona kosong di kanan
  }, [value, moduleWidth, quietModules])

  return (
    <svg
      id={id}
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000000" />
      ))}
    </svg>
  )
}

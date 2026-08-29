"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { CHART_PRIMARY } from "@/lib/chartPalette"

export type TrendPoint = {
  /** Label sumbu X (nama bulan, tanggal). */
  label: string
  value: number
  /** Keterangan tambahan di tooltip — mis. "3 kuitansi". */
  hint?: string
}

type TrendChartProps = {
  data: TrendPoint[]
  /** Batang untuk periode diskret (bulan), garis untuk deret harian yang rapat. */
  variant?: "bar" | "line"
  color?: string
  /** Pemformat nilai di tooltip — sumbu memakai `formatAxis`. */
  formatValue?: (n: number) => string
  formatAxis?: (n: number) => string
  emptyLabel?: string
  /** Tinggi bidang gambar dalam piksel. */
  height?: number
  className?: string
}

const PAD = { top: 16, right: 14, bottom: 30, left: 62 }

/** Tinggi bawaan — cukup untuk empat garis bantu tanpa mendominasi kartunya. */
const TINGGI_BAWAAN = 260

/** Lebar sementara sebelum wadahnya sempat diukur. */
const LEBAR_AWAL = 800

/** Banyaknya garis bantu horizontal, termasuk garis dasar. */
const GRID_LINES = 4

/**
 * Grafik tren satu seri — batang atau garis.
 *
 * Sengaja satu komponen untuk dua bentuk: sumbu, garis bantu, aturan pelabelan,
 * dan tooltip-nya harus identik di seluruh dashboard. Kalau dipisah jadi dua
 * komponen, keduanya pasti pelan-pelan menyimpang.
 *
 * Satu seri → TANPA legenda; judul kartunyalah yang menamai datanya. Nilai tidak
 * dicetak di setiap titik, hanya muncul di tooltip saat kursor diarahkan.
 *
 * KOORDINATNYA PIKSEL, BUKAN SATUAN YANG DISKALAKAN. Lebar wadahnya diukur dan
 * dipakai apa adanya sebagai lebar viewBox. Versi sebelumnya memakai viewBox
 * tetap yang diregangkan mengikuti lebar kartu, dan akibatnya ukuran huruf ikut
 * melar: grafik di kolom sempit label sumbunya menyusut jadi ~8px sementara
 * grafik selebar halaman jadi ~13px — dua grafik bersebelahan tidak pernah
 * terlihat berasal dari satu sistem. Tingginya pun ikut membengkak di layar
 * lebar. Dengan pemetaan 1:1, 11px selalu 11px dan garis 2px selalu 2px.
 */
export function TrendChart({
  data,
  variant = "bar",
  color = CHART_PRIMARY,
  formatValue = (n) => String(n),
  formatAxis,
  emptyLabel,
  height = TINGGI_BAWAAN,
  className,
}: TrendChartProps) {
  const [aktif, setAktif] = useState<number | null>(null)
  const wadah = useRef<HTMLDivElement>(null)
  const [lebarUkur, setLebarUkur] = useState(0)

  // Diukur lewat ResizeObserver, bukan sekali saat mount: kartunya ikut melebar
  // saat sidebar dilipat atau jendela diubah ukurannya, dan grafik yang tidak
  // ikut menyesuaikan akan tergunting atau menyisakan ruang kosong.
  useEffect(() => {
    const el = wadah.current
    if (!el) return

    const ro = new ResizeObserver(([entry]) => {
      setLebarUkur(Math.round(entry.contentRect.width))
    })
    ro.observe(el)

    return () => ro.disconnect()
  }, [])

  const W = lebarUkur || LEBAR_AWAL
  const H = height
  const PLOT_W = Math.max(0, W - PAD.left - PAD.right)
  const PLOT_H = H - PAD.top - PAD.bottom

  const axis = formatAxis ?? formatValue
  const maks = Math.max(0, ...data.map((d) => d.value))
  const kosong = data.length === 0 || maks === 0

  // Skala selalu berangkat dari NOL. Sumbu yang dipotong membuat selisih kecil
  // terlihat dramatis — pada angka uang & jumlah pinjam itu menyesatkan.
  // Batas atas dibulatkan ke angka "bulat" terdekat supaya label sumbunya rapi.
  const batasAtas = kosong ? 1 : batasRapi(maks)

  const lebarPita = PLOT_W / Math.max(data.length, 1)
  const x = (i: number) => PAD.left + lebarPita * (i + 0.5)
  const y = (v: number) => PAD.top + PLOT_H - (v / batasAtas) * PLOT_H

  // Batang tipis: 62% pita, dibatasi 34px agar deret pendek (mis. 3 bulan) tidak
  // berubah jadi balok raksasa. Sisa pita jadi jarak antar batang.
  const lebarBatang = Math.min(lebarPita * 0.62, 34)

  // Label sumbu X dijarangkan agar tidak pernah bertumpuk. Jaraknya dihitung
  // dari LEBAR NYATA, bukan jumlah titik: 31 label muat di grafik selebar
  // halaman, tapi tidak di kolom sepertiga. Satu label butuh sekitar 34px.
  const muat = Math.max(1, Math.floor(PLOT_W / 34))
  const langkahLabel = Math.max(1, Math.ceil(data.length / muat))

  const titik = aktif !== null ? data[aktif] : null

  return (
    <div ref={wadah} className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        role="img"
        aria-label={emptyLabel && kosong ? emptyLabel : undefined}
      >
        {/* Garis bantu + label sumbu Y. Sengaja tipis dan abu muda: ini latar
            pembacaan, bukan data — ia tidak boleh bersaing dengan batangnya. */}
        {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
          const nilaiGaris = (batasAtas / GRID_LINES) * i
          const posisi = y(nilaiGaris)
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={posisi}
                y2={posisi}
                stroke={i === 0 ? "#e2e8f0" : "#f1f5f9"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 10}
                y={posisi + 4}
                textAnchor="end"
                className="fill-gray-400"
                style={{ fontSize: 11 }}
              >
                {kosong && i > 0 ? "" : axis(nilaiGaris)}
              </text>
            </g>
          )
        })}

        {/* Label sumbu X */}
        {data.map((d, i) =>
          i % langkahLabel === 0 ? (
            <text
              key={`x-${i}`}
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
              className={cn(aktif === i ? "fill-gray-700" : "fill-gray-400")}
              style={{ fontSize: 11, fontWeight: aktif === i ? 600 : 400 }}
            >
              {d.label}
            </text>
          ) : null,
        )}

        {!kosong &&
          variant === "bar" &&
          data.map((d, i) => {
            const tinggi = Math.max(0, PAD.top + PLOT_H - y(d.value))
            if (tinggi <= 0) return null
            return (
              <rect
                key={`bar-${i}`}
                x={x(i) - lebarBatang / 2}
                y={y(d.value)}
                width={lebarBatang}
                height={tinggi}
                // Ujung data membulat 4px, pangkalnya tetap menempel garis dasar.
                rx={4}
                fill={color}
                opacity={aktif === null || aktif === i ? 1 : 0.35}
              />
            )
          })}

        {!kosong && variant === "line" && (
          <>
            <defs>
              <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path
              d={`M ${x(0)} ${PAD.top + PLOT_H} ${data
                .map((d, i) => `L ${x(i)} ${y(d.value)}`)
                .join(" ")} L ${x(data.length - 1)} ${PAD.top + PLOT_H} Z`}
              fill="url(#trend-area)"
            />
            <path
              d={data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Penanda titik aktif. Cincin putih 2px memisahkan titik dari garis di
            bawahnya, sehingga tetap terbaca saat keduanya bertumpuk. */}
        {!kosong && titik && aktif !== null && (
          <>
            <line
              x1={x(aktif)}
              x2={x(aktif)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {variant === "line" && (
              <circle cx={x(aktif)} cy={y(titik.value)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
            )}
          </>
        )}

        {/* Bidang tangkap kursor selebar pita penuh — target sentuhnya jauh lebih
            besar dari batangnya sendiri, jadi tidak perlu membidik. */}
        {data.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={PAD.left + lebarPita * i}
            y={PAD.top}
            width={lebarPita}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setAktif(i)}
            onMouseLeave={() => setAktif(null)}
          />
        ))}
      </svg>

      {kosong && emptyLabel && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-gray-400">{emptyLabel}</span>
        </div>
      )}

      {titik && aktif !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-3 py-2 text-center shadow-lg"
          // Koordinatnya sudah piksel, jadi dipakai apa adanya.
          style={{ left: x(aktif), top: y(titik.value) - 10 }}
        >
          <p className="text-[11px] whitespace-nowrap text-gray-300">{titik.label}</p>
          <p className="text-sm font-semibold whitespace-nowrap text-white">{formatValue(titik.value)}</p>
          {titik.hint && <p className="text-[11px] whitespace-nowrap text-gray-300">{titik.hint}</p>}
        </div>
      )}
    </div>
  )
}

/**
 * Batas atas sumbu yang "bulat": 1/2/5 × pangkat sepuluh tepat di atas nilai
 * tertinggi. Tanpa ini label sumbu jadi angka acak seperti "1.949.988 / 3" dan
 * grafiknya sulit dibaca sekilas.
 */
function batasRapi(maks: number): number {
  const pangkat = Math.pow(10, Math.floor(Math.log10(maks)))
  const rasio = maks / pangkat
  const pengali = rasio <= 1 ? 1 : rasio <= 2 ? 2 : rasio <= 5 ? 5 : 10
  return pengali * pangkat
}

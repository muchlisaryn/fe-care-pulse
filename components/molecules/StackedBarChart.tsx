"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { CHART_OTHER, CHART_SERIES } from "@/lib/chartPalette"

export type StackedSeries = {
  /** Kunci nilai pada tiap titik — dipakai juga sebagai identitas warna. */
  key: string
  name: string
}

export type StackedPoint = {
  /** Label sumbu X (tanggal, nama bulan). */
  label: string
  /** Keterangan lengkap di judul tooltip — mis. tanggal utuh. */
  title?: string
  values: Record<string, number>
}

type StackedBarChartProps = {
  series: StackedSeries[]
  data: StackedPoint[]
  /** Kunci seri penampung sisa — dicat abu netral, bukan warna kategori. */
  otherKey?: string
  formatValue?: (n: number) => string
  formatAxis?: (n: number) => string
  emptyLabel?: string
  totalLabel?: string
  height?: number
  className?: string
}

const PAD = { top: 16, right: 14, bottom: 30, left: 62 }

/** Tinggi bawaan — sama dengan TrendChart agar dua kartu bersebelahan sejajar. */
const TINGGI_BAWAAN = 260

/** Lebar sementara sebelum wadahnya sempat diukur. */
const LEBAR_AWAL = 800

/** Banyaknya garis bantu horizontal, termasuk garis dasar. */
const GRID_LINES = 4

/** Jarak antar potongan tumpukan, dalam piksel warna kartu. */
const CELAH = 2

/**
 * Grafik batang BERTUMPUK — satu batang per periode, dipecah per entitas.
 *
 * Dipakai untuk pertanyaan bertingkat: "berapa per hari" DAN "dari ruangan
 * mana". Tumpukan, bukan batang berdampingan: dengan 31 hari × beberapa ruangan,
 * batang berdampingan menjadi terlalu tipis untuk diarahkan kursor, dan total
 * hariannya — yang tetap jadi bacaan pertama — tidak lagi terbaca sebagai satu
 * tinggi.
 *
 * Aturan gambar sengaja disamakan dengan [TrendChart]: koordinat PIKSEL (bukan
 * viewBox yang diregangkan, supaya 11px selalu 11px), sumbu berangkat dari nol,
 * batas atas dibulatkan, label sumbu X dijarangkan menurut lebar nyata, dan
 * bidang tangkap kursor selebar pita penuh. Dua grafik di halaman yang sama
 * harus terlihat berasal dari satu sistem.
 *
 * WARNA MENGIKUTI URUTAN SERI yang diberikan pemanggil (backend), bukan urutan
 * nilai pada hari tertentu — kalau warna digilir mengikuti data, satu ruangan
 * bisa berganti warna di tengah grafik.
 */
export function StackedBarChart({
  series,
  data,
  otherKey,
  formatValue = (n) => String(n),
  formatAxis,
  emptyLabel,
  totalLabel,
  height = TINGGI_BAWAAN,
  className,
}: StackedBarChartProps) {
  const [aktif, setAktif] = useState<number | null>(null)
  const wadah = useRef<HTMLDivElement>(null)
  const [lebarUkur, setLebarUkur] = useState(0)

  // Diukur lewat ResizeObserver: kartunya ikut melebar saat sidebar dilipat.
  useEffect(() => {
    const el = wadah.current
    if (!el) return

    const ro = new ResizeObserver(([entry]) => {
      setLebarUkur(Math.round(entry.contentRect.width))
    })
    ro.observe(el)

    return () => ro.disconnect()
  }, [])

  const warna = useMemo(() => {
    // Seri "Lainnya" tidak menghabiskan jatah warna kategori — ia dilewati saat
    // membagikan warna, jadi ruangan tetap dapat warna yang sama meski posisi
    // "Lainnya" bergeser.
    const map: Record<string, string> = {}
    let i = 0
    for (const s of series) {
      if (s.key === otherKey) {
        map[s.key] = CHART_OTHER
        continue
      }
      map[s.key] = CHART_SERIES[i % CHART_SERIES.length]
      i++
    }
    return map
  }, [series, otherKey])

  const total = useMemo(
    () => data.map((d) => series.reduce((s, k) => s + (d.values[k.key] ?? 0), 0)),
    [data, series],
  )

  const W = lebarUkur || LEBAR_AWAL
  const H = height
  const PLOT_W = Math.max(0, W - PAD.left - PAD.right)
  const PLOT_H = H - PAD.top - PAD.bottom

  const axis = formatAxis ?? formatValue
  const maks = Math.max(0, ...total)
  const kosong = data.length === 0 || maks === 0
  const batasAtas = kosong ? 1 : batasRapi(maks)

  const lebarPita = PLOT_W / Math.max(data.length, 1)
  const x = (i: number) => PAD.left + lebarPita * (i + 0.5)
  const y = (v: number) => PAD.top + PLOT_H - (v / batasAtas) * PLOT_H
  const lebarBatang = Math.min(lebarPita * 0.62, 34)

  const muat = Math.max(1, Math.floor(PLOT_W / 34))
  const langkahLabel = Math.max(1, Math.ceil(data.length / muat))

  const titik = aktif !== null ? data[aktif] : null

  return (
    <div className={cn("w-full", className)}>
      {/* Legenda SELALU ada begitu serinya lebih dari satu: identitas tidak boleh
          bergantung pada warna saja bagi pembaca yang tak bisa membedakannya. */}
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: warna[s.key] }}
                aria-hidden
              />
              {/* Tulisan tetap memakai warna teks biasa — bukan warna serinya. */}
              <span className="text-xs text-gray-600">{s.name}</span>
            </li>
          ))}
        </ul>
      )}

      <div ref={wadah} className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block"
          role="img"
          aria-label={emptyLabel && kosong ? emptyLabel : undefined}
        >
          {/* Garis bantu + label sumbu Y — latar pembacaan, bukan data. */}
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
            data.map((d, i) => {
              // Potongan disusun dulu (dari dasar ke atas, mengikuti urutan seri),
              // baru digambar — supaya "mana yang paling atas" diketahui sebelum
              // menentukan sudut membulatnya.
              const potongan: { key: string; bawah: number; atas: number }[] = []
              let dasar = 0
              for (const s of series) {
                const nilai = d.values[s.key] ?? 0
                if (nilai <= 0) continue
                potongan.push({ key: s.key, bawah: dasar, atas: dasar + nilai })
                dasar += nilai
              }

              return potongan.map((p, urut) => {
                const yAtas = y(p.atas)
                // Celah 2px berwarna kartu memisahkan potongan yang bersentuhan —
                // tanpa itu dua warna gelap berdempet terbaca sebagai satu blok.
                // Potongan paling bawah tetap menempel garis dasar.
                const celah = urut === 0 ? 0 : CELAH
                const tinggi = Math.max(1, y(p.bawah) - yAtas - celah)

                return (
                  <rect
                    key={`${i}-${p.key}`}
                    x={x(i) - lebarBatang / 2}
                    y={yAtas}
                    width={lebarBatang}
                    height={tinggi}
                    // Hanya ujung data (potongan teratas) yang membulat 4px.
                    rx={urut === potongan.length - 1 ? 4 : 0}
                    fill={warna[p.key]}
                    opacity={aktif === null || aktif === i ? 1 : 0.35}
                  />
                )
              })
            })}

          {/* Penanda kolom aktif */}
          {!kosong && aktif !== null && (
            <line
              x1={x(aktif)}
              x2={x(aktif)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {/* Bidang tangkap kursor selebar pita penuh — tidak perlu membidik. */}
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

        {/* Tooltip merinci SELURUH seri hari itu, bukan cuma potongan yang
            disentuh: pertanyaannya "hari ini dari ruangan mana saja". Seri
            bernilai nol dilewati agar daftarnya tidak jadi kolom angka nol. */}
        {titik && aktif !== null && (
          <div
            className={cn(
              "pointer-events-none absolute z-10 -translate-y-full rounded-lg bg-gray-900 px-3 py-2 shadow-lg",
              // Tooltip dijepit di dalam kartu: pada kolom pertama & terakhir,
              // penempatan tengah membuatnya terpotong tepi kartu.
              aktif < data.length / 2 ? "translate-x-0" : "-translate-x-full",
            )}
            style={{ left: x(aktif), top: y(total[aktif]) - 10 }}
          >
            <p className="text-[11px] whitespace-nowrap text-gray-300">{titik.title ?? titik.label}</p>
            <p className="text-sm font-semibold whitespace-nowrap text-white">
              {formatValue(total[aktif])}
              {totalLabel && <span className="ml-1 text-[11px] font-normal text-gray-300">{totalLabel}</span>}
            </p>
            <ul className="mt-1 space-y-0.5">
              {series
                .filter((s) => (titik.values[s.key] ?? 0) > 0)
                .map((s) => (
                  <li key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: warna[s.key] }}
                      aria-hidden
                    />
                    <span className="text-[11px] text-gray-300">{s.name}</span>
                    <span className="ml-auto pl-2 text-[11px] font-medium text-white">
                      {formatValue(titik.values[s.key] ?? 0)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Batas atas sumbu yang "bulat": 1/2/5 × pangkat sepuluh tepat di atas nilai
 * tertinggi — aturan yang sama dengan TrendChart.
 */
function batasRapi(maks: number): number {
  const pangkat = Math.pow(10, Math.floor(Math.log10(maks)))
  const rasio = maks / pangkat
  const pengali = rasio <= 1 ? 1 : rasio <= 2 ? 2 : rasio <= 5 ? 5 : 10
  return pengali * pangkat
}

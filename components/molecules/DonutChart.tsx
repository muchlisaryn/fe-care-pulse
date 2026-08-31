"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export type DonutSlice = {
  /** Kunci ENTITAS — penentu warna, bukan urutan tampil. */
  key: string
  label: string
  value: number
  percent: number
  color: string
}

type DonutChartProps = {
  data: DonutSlice[]
  /** Angka besar di tengah cincin — jawaban utama layar ini. */
  centerValue: string
  centerLabel: string
  formatValue?: (n: number) => string
  emptyLabel?: string
  className?: string
}

const SIZE = 180
const R_LUAR = 80
const R_DALAM = 54
const PUSAT = SIZE / 2

/** Celah antar potongan (derajat) — pemisah setipis latar, bukan garis warna. */
const CELAH = 2

/**
 * Komposisi satu himpunan — dipakai untuk cara bayar.
 *
 * Cincin, bukan pie penuh: lubang tengahnya menampung ANGKA UTAMA, sehingga
 * jawaban "tunai berapa persen" terbaca tanpa perlu membandingkan luas juring.
 *
 * Tiap potongan selalu punya baris legenda bertuliskan label + persen, jadi
 * identitasnya tidak pernah bergantung pada warna saja.
 */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  formatValue = (n) => String(n),
  emptyLabel,
  className,
}: DonutChartProps) {
  const [aktif, setAktif] = useState<string | null>(null)

  const total = data.reduce((a, d) => a + d.value, 0)
  const kosong = total <= 0

  const terisi = data.filter((d) => d.value > 0)

  // Sudut awal tiap juring dihitung dari jumlah nilai SEBELUMNYA, bukan dari
  // penampung yang ditimpa di tiap putaran: penampung semacam itu bertahan
  // melewati render dan hasilnya bisa berbeda antar render.
  const juring = terisi.map((d, i) => {
    const sebelumnya = terisi.slice(0, i).reduce((a, x) => a + x.value, 0)
    const mulai = -90 + (sebelumnya / total) * 360 // -90 = mulai dari jam 12.
    const sapuan = (d.value / total) * 360
    // Celah hanya dipakai kalau juringnya cukup lebar; potongan 1% tidak boleh
    // ikut menyusut sampai lenyap.
    const gap = sapuan > CELAH * 2 ? CELAH : 0

    return { ...d, mulai: mulai + gap / 2, akhir: mulai + sapuan - gap / 2 }
  })

  return (
    // Cincin DI ATAS legenda, tidak pernah berdampingan. Panel ini menempati
    // kolom sepertiga; disandingkan, legendanya tersisa ~110px dan nama sependek
    // "Tunai" pun terpotong jadi "T…" — persis identitas yang harus terbaca.
    // Ditumpuk, legendanya mendapat lebar kartu penuh.
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <div className="relative shrink-0">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-[180px] w-[180px]" role="img">
          {kosong ? (
            <circle cx={PUSAT} cy={PUSAT} r={(R_LUAR + R_DALAM) / 2} fill="none" stroke="#f1f5f9" strokeWidth={R_LUAR - R_DALAM} />
          ) : juring.length === 1 ? (
            // Satu kategori 100%: busurnya berawal dan berakhir di titik yang
            // sama, sehingga `A` tidak menggambar apa pun. Digambar sebagai
            // lingkaran penuh — kasus ini justru sering (semua setoran tunai).
            <circle
              cx={PUSAT}
              cy={PUSAT}
              r={(R_LUAR + R_DALAM) / 2}
              fill="none"
              stroke={juring[0].color}
              strokeWidth={R_LUAR - R_DALAM}
            />
          ) : (
            juring.map((s) => (
              <path
                key={s.key}
                d={jalurCincin(s.mulai, s.akhir)}
                fill={s.color}
                opacity={aktif === null || aktif === s.key ? 1 : 0.3}
                onMouseEnter={() => setAktif(s.key)}
                onMouseLeave={() => setAktif(null)}
              />
            ))
          )}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{kosong ? "—" : centerValue}</span>
          <span className="mt-0.5 text-[11px] text-gray-500">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {data.map((d) => (
          <li
            key={d.key}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors",
              aktif === d.key && "bg-gray-50",
            )}
            onMouseEnter={() => setAktif(d.key)}
            onMouseLeave={() => setAktif(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="truncate text-sm text-gray-600">{d.label}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold text-gray-900">
                {d.percent.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
              </span>
              <span className="block text-[11px] text-gray-400">{formatValue(d.value)}</span>
            </span>
          </li>
        ))}
      </ul>

      {kosong && emptyLabel && <span className="sr-only">{emptyLabel}</span>}
    </div>
  )
}

/** Satu potongan cincin sebagai path: busur luar, lalu busur dalam balik arah. */
function jalurCincin(mulaiDeg: number, akhirDeg: number): string {
  const besar = akhirDeg - mulaiDeg > 180 ? 1 : 0
  const l1 = titik(R_LUAR, mulaiDeg)
  const l2 = titik(R_LUAR, akhirDeg)
  const d1 = titik(R_DALAM, akhirDeg)
  const d2 = titik(R_DALAM, mulaiDeg)

  return [
    `M ${l1.x} ${l1.y}`,
    `A ${R_LUAR} ${R_LUAR} 0 ${besar} 1 ${l2.x} ${l2.y}`,
    `L ${d1.x} ${d1.y}`,
    `A ${R_DALAM} ${R_DALAM} 0 ${besar} 0 ${d2.x} ${d2.y}`,
    "Z",
  ].join(" ")
}

function titik(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: PUSAT + r * Math.cos(rad), y: PUSAT + r * Math.sin(rad) }
}

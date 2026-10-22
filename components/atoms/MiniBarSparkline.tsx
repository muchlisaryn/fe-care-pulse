import { cn } from "@/lib/utils"

type MiniBarSparklineProps = {
  /** Nilai tiap batang, urut dari kiri ke kanan. */
  data: number[]
  color?: string
  height?: number
  className?: string
}

/**
 * Sparkline batang untuk kartu angka kecil — bukan grafik yang dibaca detail.
 *
 * Tujuannya hanya memberi bentuk naik-turun pada kartu, jadi sumbu, label, dan
 * tooltip sengaja tidak ada. Grafik yang punya pertanyaan sungguhan tetap
 * memakai `TrendChart`; komponen ini tidak boleh dipakai untuk menggantikannya.
 */
export function MiniBarSparkline({
  data,
  color = "#0d8b7d",
  height = 30,
  className,
}: MiniBarSparklineProps) {
  // Deret kosong tetap tampil sebagai deretan batang tipis: kartu tidak boleh
  // berubah tinggi hanya karena belum ada data.
  const nilai = data.length > 0 ? data : Array.from({ length: 12 }, () => 0)
  const maks = Math.max(...nilai, 1)

  return (
    <div
      className={cn("flex w-full items-end gap-[3px]", className)}
      style={{ height }}
      aria-hidden
    >
      {nilai.map((v, i) => (
        <span
          key={i}
          className="min-w-0 flex-1 rounded-[2px]"
          style={{
            height: `${Math.max((v / maks) * 100, v > 0 ? 8 : 3)}%`,
            backgroundColor: color,
            opacity: v > 0 ? 1 : 0.18,
          }}
        />
      ))}
    </div>
  )
}

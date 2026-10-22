import { cn } from "@/lib/utils"

type MiniProgressProps = {
  /** Persentase 0–100. Nilai di luar rentang dijepit. */
  value: number
  color?: string
  className?: string
}

/** Bilah kemajuan tipis untuk kartu angka kecil. */
export function MiniProgress({ value, color = "#0d8b7d", className }: MiniProgressProps) {
  const lebar = Math.min(100, Math.max(0, value))

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-gray-100", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(lebar)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${lebar}%`, backgroundColor: color }}
      />
    </div>
  )
}

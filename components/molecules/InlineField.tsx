import { Label } from "@/components/atoms/Label"
import type { ReactNode } from "react"

type InlineFieldProps = {
  label: string
  children: ReactNode
  /** Tandai wajib diisi — memberi tanda bintang di sebelah label. */
  wajib?: boolean
}

/**
 * Baris "Label : kontrol" ala lembar asesmen rekam medis — label di kiri,
 * titik dua, lalu satu atau beberapa kontrol berjajar di kanan.
 *
 * Label sejajar baris pertama kontrol, jadi tetap rapi untuk textarea yang
 * tinggi. Di layar kecil label turun ke atas kontrol dan titik duanya hilang.
 */
export function InlineField({ label, children, wajib }: InlineFieldProps) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[200px_12px_1fr] sm:gap-2">
      <Label className="sm:pt-2">
        {label}
        {wajib && (
          <span className="ml-0.5 text-red-500" title="Wajib diisi">
            *
          </span>
        )}
      </Label>
      <span className="hidden pt-2 text-sm text-gray-500 sm:block">:</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

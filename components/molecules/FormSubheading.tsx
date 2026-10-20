import type { ReactNode } from "react"

/** Judul kelompok kecil di dalam satu bagian form, mis. "Pemeriksaan Lain". */
export function FormSubheading({ children }: { children: ReactNode }) {
  return <h4 className="text-sm font-semibold text-gray-900">{children}</h4>
}

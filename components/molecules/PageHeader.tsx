import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type PageHeaderProps = {
  title: string
  subtitle?: string
  /**
   * Tombol aksi di sisi kanan judul, mis. "+ Tambah" atau "Import Excel".
   * Tanpa prop ini, header tetap tampil seperti sebelumnya.
   */
  action?: ReactNode
  /** Jarak bawah dll. — halaman yang tidak memakai container ber-`space-y`. */
  className?: string
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn(action && "flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

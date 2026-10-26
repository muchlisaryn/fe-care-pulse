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
    // Di layar sempit tombol aksi turun ke bawah judul supaya judul tidak terjepit;
    // mulai `sm` berdampingan di kanan.
    <div
      className={cn(
        action && "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

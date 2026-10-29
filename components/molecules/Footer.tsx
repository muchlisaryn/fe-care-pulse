"use client"

import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type FooterProps = {
  className?: string
  variant?: "light" | "dark"
}

const COPYRIGHT_HOLDERS = ["Tri Aji Bagaskara", "Muchlis Aryana", "Maulana Haryanto"]

/** Baris hak cipta di bagian bawah halaman. */
export function Footer({ className, variant = "light" }: FooterProps) {
  const t = useT()

  return (
    <footer
      className={cn(
        "shrink-0 px-4 py-2 text-center text-xs",
        variant === "light" ? "text-gray-400" : "text-white/60",
        className
      )}
    >
      {t("common.copyright", {
        year: new Date().getFullYear(),
        name: COPYRIGHT_HOLDERS.join(", "),
      })}
    </footer>
  )
}

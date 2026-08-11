"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, type LucideIcon } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { cn } from "@/lib/utils"

export type DropdownItem = {
  label: string
  onClick: () => void
  icon?: LucideIcon
  disabled?: boolean
  /** Keterangan kecil di bawah label — untuk menjelaskan isi tiap pilihan. */
  description?: string
}

type DropdownMenuProps = {
  /** Teks tombol pemicu. */
  label: string
  items: DropdownItem[]
  icon?: LucideIcon
  disabled?: boolean
  /** Sisi panel yang disejajarkan dengan tombol (default kanan). */
  align?: "left" | "right"
  className?: string
}

/**
 * Tombol dengan daftar pilihan (menu tarik-turun). Dipakai saat satu tombol punya
 * beberapa aksi sejenis — mis. beberapa bentuk export laporan — agar baris aksi
 * tidak penuh oleh tombol yang mirip.
 *
 * Menutup sendiri saat pilihan dipilih, saat diklik di luar panel, dan saat Escape.
 */
export function DropdownMenu({
  label,
  items,
  icon: Icon,
  disabled = false,
  align = "right",
  className = "",
}: DropdownMenuProps) {
  const [expanded, setExpanded] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // Menu ikut tertutup begitu tombolnya dinonaktifkan (mis. proses sedang berjalan) —
  // diturunkan dari props, bukan disetel lewat efek.
  const open = expanded && !disabled

  // Klik di luar panel & tombol Escape menutup menu.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setExpanded(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setExpanded((v) => !v)}
        className="w-full justify-center sm:w-auto"
      >
        {Icon && <Icon className="h-4 w-4" />}
        {label}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-1 w-full min-w-[16rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg sm:w-auto",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => {
            const ItemIcon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setExpanded(false)
                  item.onClick()
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
              >
                {ItemIcon && <ItemIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
                <span className="min-w-0">
                  <span className="block whitespace-nowrap">{item.label}</span>
                  {item.description && (
                    <span className="block text-xs text-gray-400">{item.description}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

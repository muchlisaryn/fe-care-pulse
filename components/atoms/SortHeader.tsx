"use client"

import { ArrowDown, ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"

export type SortDirection = "asc" | "desc" | null

type SortHeaderProps = {
  label: string
  /** Arah aktif kolom ini; null = kolom tidak sedang dipakai mengurutkan. */
  direction: SortDirection
  /** Dipanggil dengan arah BERIKUTNYA: null → asc → desc → null. */
  onChange: (next: SortDirection) => void
  className?: string
}

const nextDirection: Record<string, SortDirection> = {
  null: "asc",
  asc: "desc",
  desc: null,
}

/**
 * Judul kolom tabel yang bisa diklik untuk mengurutkan. Kedua panah (naik = terkecil
 * dulu, turun = terbesar dulu) dijajar mendatar dan selalu terlihat supaya kolom ini
 * kelihatan bisa diurutkan walau sedang tidak aktif — panah yang sedang berlaku
 * dipekatkan, sisanya dibuat samar.
 */
export function SortHeader({ label, direction, onChange, className }: SortHeaderProps) {
  const active = direction !== null

  return (
    <button
      type="button"
      onClick={() => onChange(nextDirection[String(direction)])}
      title={
        direction === "asc"
          ? `${label}: terkecil dulu — klik untuk terbesar dulu`
          : direction === "desc"
            ? `${label}: terbesar dulu — klik untuk hapus urutan`
            : `Urutkan berdasarkan ${label}`
      }
      className={cn(
        "group inline-flex items-center gap-1 uppercase tracking-wide transition-colors",
        active ? "text-[#075489]" : "text-gray-400 hover:text-gray-600",
        className
      )}
    >
      {label}
      <span className="flex items-center gap-0.5">
        <ArrowUp
          className={cn("h-3 w-3", direction === "asc" ? "text-[#075489]" : "text-gray-300")}
        />
        <ArrowDown
          className={cn("h-3 w-3", direction === "desc" ? "text-[#075489]" : "text-gray-300")}
        />
      </span>
    </button>
  )
}

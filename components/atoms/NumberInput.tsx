"use client"

import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

type NumberInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Nilai mentah — hanya digit, tanpa pemisah ribuan. */
  value: string
  onValueChange: (nilai: string) => void
  /** Tanda di dalam kotak, mis. "Rp". */
  prefix?: string
  /** Tampilkan pemisah ribuan saat tidak sedang diketik. */
  grouped?: boolean
  error?: boolean
}

/**
 * Isian angka yang benar-benar hanya menerima angka.
 *
 * Sengaja `type="text"` + `inputMode="numeric"`, bukan `type="number"`:
 *
 * - `type="number"` memunculkan panah naik/turun yang gampang tersenggol
 *   scroll dan mengubah nominal tanpa disadari;
 * - kolom itu juga tetap menerima "e", "+", "-", dan "." (notasi ilmiah),
 *   lalu melaporkan value kosong saat isinya tidak sah — jadi salah ketik
 *   terbaca sebagai "belum diisi", bukan sebagai kesalahan;
 * - `inputMode="numeric"` tetap memunculkan papan tombol angka di ponsel.
 *
 * Penyaringan dilakukan di `onChange`, jadi karakter selain digit tidak pernah
 * masuk ke state sama sekali.
 */
export function NumberInput({
  className,
  value,
  onValueChange,
  prefix,
  grouped = true,
  error,
  ...props
}: NumberInputProps) {
  const tampil =
    grouped && value !== "" ? Number(value).toLocaleString("id-ID") : value

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-medium text-slate-400">
          {prefix}
        </span>
      )}
      <input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={tampil}
        onChange={(e) => onValueChange(e.target.value.replace(/\D/g, ""))}
        className={cn(
          "w-full rounded-lg border py-2 text-sm tabular-nums outline-none transition-colors",
          "border-gray-300 bg-white placeholder:text-gray-400 text-gray-900",
          "focus:border-[#075489] focus:ring-2 focus:ring-[#075489]/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          prefix ? "pl-10 pr-4" : "px-4",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
          className
        )}
      />
    </div>
  )
}

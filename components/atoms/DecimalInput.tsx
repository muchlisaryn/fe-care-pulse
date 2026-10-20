"use client"

import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

type DecimalInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Nilai mentah — digit dengan paling banyak satu titik desimal. */
  value: string
  onValueChange: (nilai: string) => void
  /** Satuan di sisi kanan kotak, mis. "kg" atau "mmHg". */
  suffix?: string
  error?: boolean
  /** Kelas pembungkus — mis. lebar tetap saat dijajarkan dalam satu baris. */
  wrapperClassName?: string
}

/**
 * Isian angka yang boleh berkoma, mis. suhu 36,5 atau berat badan 60,2.
 *
 * Alasan tidak memakai `type="number"` sama dengan `NumberInput`; bedanya,
 * di sini satu pemisah desimal diizinkan. Koma diubah jadi titik supaya
 * nilainya tetap bisa dibaca `Number()`.
 */
export function DecimalInput({
  className,
  value,
  onValueChange,
  suffix,
  error,
  wrapperClassName,
  ...props
}: DecimalInputProps) {
  function handleChange(raw: string) {
    const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "")
    const [whole, ...rest] = cleaned.split(".")
    onValueChange(rest.length ? `${whole}.${rest.join("")}` : whole)
  }

  return (
    <div className={cn("relative", wrapperClassName)}>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          "w-full rounded-lg border px-4 py-2 text-sm tabular-nums outline-none transition-colors",
          "border-gray-300 bg-white placeholder:text-gray-400 text-gray-900",
          "focus:border-[#075489] focus:ring-2 focus:ring-[#075489]/20",
          "disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-gray-50",
          suffix && "pr-16",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
          className
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  )
}

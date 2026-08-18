"use client"

import { Minus, Plus } from "lucide-react"
import { useT } from "@/lib/i18n"

/**
 * Stepper jumlah: tombol −/+ dengan kotak isian yang BOLEH dikosongkan sementara
 * (hanya menerima digit). Nilai kosong sengaja dibiarkan agar petugas bisa menghapus
 * isinya lalu mengetik angka baru — validasi minimalnya dilakukan saat simpan.
 */
export function QtyStepper({
  value,
  onChange,
  min = 1,
}: {
  value: string
  onChange: (value: string) => void
  min?: number
}) {
  const t = useT()
  const num = Number(value)
  const current = Number.isFinite(num) && value !== "" ? num : min

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(min, current - 1)))}
        className="px-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
        aria-label={t("common.decrease")}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (v === "" || /^\d+$/.test(v)) onChange(v)
        }}
        className="w-14 border-x border-gray-300 py-1.5 text-center text-sm outline-none focus:ring-2 focus:ring-[#4ba69d]/30"
      />
      <button
        type="button"
        onClick={() => onChange(String((value === "" ? min - 1 : current) + 1))}
        className="px-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
        aria-label={t("common.increase")}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

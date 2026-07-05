"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

export type SelectSearchOption = {
  value: string
  label: string
}

type DropdownPos = {
  left: number
  width: number
  // Salah satu dari top/bottom yang dipakai (koordinat viewport, position: fixed).
  top?: number
  bottom?: number
  // Tinggi maksimum dropdown agar tetap muat di viewport (list scroll di dalamnya).
  maxHeight: number
  // true = dropdown dibuka ke atas trigger (ruang bawah kurang).
  openUp: boolean
}

type SelectSearchProps = {
  options: SelectSearchOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  error?: boolean
  className?: string
  /** Kelas tambahan untuk tombol pemicu (mis. samakan tinggi/padding dengan tombol lain). */
  triggerClassName?: string
}

export function SelectSearch({
  options,
  value,
  onChange,
  placeholder = "-- Pilih --",
  searchPlaceholder = "Cari...",
  disabled = false,
  error = false,
  className,
  triggerClassName,
}: SelectSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pos, setPos] = useState<DropdownPos | null>(null)
  // Portal hanya boleh dirender setelah mount di client agar hasil render awal
  // sama dengan server (cegah hydration mismatch).
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const selected = options.find((o) => o.value === value)
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  // Hitung posisi + arah buka (atas/bawah) berdasarkan ruang yang tersedia di
  // viewport, plus tinggi maksimum agar daftar opsi selalu muat & bisa di-scroll.
  function computePos(): DropdownPos | null {
    if (!triggerRef.current) return null
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 4
    const margin = 8 // jarak aman ke tepi layar
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
    // Buka ke atas hanya bila ruang bawah sempit DAN ruang atas lebih lega.
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
    const maxHeight = Math.max(160, Math.min(360, openUp ? spaceAbove : spaceBelow))

    return {
      left: rect.left,
      width: rect.width,
      maxHeight,
      openUp,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    }
  }

  function openDropdown() {
    const next = computePos()
    if (!next) return
    setPos(next)
    setQuery("")
    setOpen(true)
  }

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClose(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    // Reposisi mengikuti trigger saat halaman/kontainer di-scroll atau viewport berubah.
    function reposition() {
      setPos(computePos())
    }
    document.addEventListener("mousedown", handleClose)
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      document.removeEventListener("mousedown", handleClose)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleSelect(optionValue: string) {
    onChange(optionValue)
    setOpen(false)
  }

  const dropdown = open && pos ? (
    <div
      style={{
        position: "fixed",
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
      }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        style={{ maxHeight: pos.maxHeight }}
      >
        <div className="shrink-0 border-b border-gray-100 p-2">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-[#075489] focus:ring-1 focus:ring-[#075489]/20 placeholder:text-gray-400"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400 text-center">Tidak ditemukan.</li>
          ) : (
            filtered.map((option) => (
              <li
                key={option.value}
                onMouseDown={() => handleSelect(option.value)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm transition-colors",
                  option.value === value
                    ? "bg-[#075489]/8 text-[#075489] font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  ) : null

  return (
    <div className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        // `disabled` bergantung pada state loading data (di-fetch di client) sehingga
        // nilainya bisa beda antara HTML SSR dan render pertama client. Nilai client
        // langsung dipakai setelah hydration — cegah warning mismatch di sini.
        disabled={disabled}
        suppressHydrationWarning
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm outline-none transition-colors bg-white text-left",
          "border-gray-300",
          open
            ? "border-[#075489] ring-2 ring-[#075489]/20"
            : "hover:border-gray-400",
          error && "border-red-500 ring-2 ring-red-500/20",
          disabled && "cursor-not-allowed opacity-50",
          triggerClassName
        )}
      >
        <span className={cn("truncate", selected ? "text-gray-900" : "text-gray-400")}>
          {selected ? selected.label : placeholder}
        </span>
        <span className={cn("ml-2 shrink-0 text-gray-400 transition-transform duration-200", open && "rotate-180")}>
          ▾
        </span>
      </button>

      {mounted && createPortal(dropdown, document.body)}
    </div>
  )
}

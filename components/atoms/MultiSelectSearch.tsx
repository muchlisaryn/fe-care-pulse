"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type MultiSelectSearchOption = {
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
  openUp: boolean
}

type MultiSelectSearchProps = {
  options: MultiSelectSearchOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  /** Batas jumlah opsi yang boleh dipilih; opsi lain dikunci saat batas tercapai. */
  max?: number
  disabled?: boolean
  error?: boolean
  loading?: boolean
  className?: string
}

/**
 * Dropdown pilih-banyak dengan kotak pencarian. Opsi terpilih tampil sebagai chip
 * di trigger dan bisa dilepas satu per satu. Dipakai saat satu baris permintaan
 * butuh beberapa barang sekaligus (mis. order 3 unit alat yang sama).
 */
export function MultiSelectSearch({
  options,
  value,
  onChange,
  placeholder = "-- Pilih --",
  searchPlaceholder = "Cari...",
  max,
  disabled = false,
  error = false,
  loading = false,
  className,
}: MultiSelectSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pos, setPos] = useState<DropdownPos | null>(null)
  // Portal hanya boleh dirender setelah mount di client (cegah hydration mismatch).
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const selected = options.filter((o) => value.includes(o.value))
  // Opsi yang sudah dipilih dikeluarkan dari daftar (sudah tampil sebagai baris terpilih).
  const available = options.filter((o) => !value.includes(o.value))
  const filtered = query
    ? available.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : available
  const full = max !== undefined && value.length >= max

  function computePos(): DropdownPos | null {
    if (!triggerRef.current) return null
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 4
    const margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
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

  // Pilihan terakhir memenuhi jumlah → tutup dropdown, select ikut terkunci.
  useEffect(() => {
    if (full) setOpen(false)
  }, [full])

  useEffect(() => {
    if (!open) return
    function handleClose(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
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

  function toggle(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
      return
    }
    if (full) return
    onChange([...value, optionValue])
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
          {loading ? (
            <li className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat opsi...
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400 text-center">
              {available.length === 0 ? "Tidak ada pilihan lain." : "Tidak ditemukan."}
            </li>
          ) : (
            filtered.map((option) => (
              <li
                key={option.value}
                onMouseDown={() => toggle(option.value)}
                className="cursor-pointer px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
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
      {/* Daftar terpilih dipisah DI ATAS kotak select — bukan di dalamnya — agar
          tombol hapus (×) tetap mudah ditekan di layar kecil. */}
      {selected.length > 0 && (
        <ul className={cn("space-y-1.5", !full && "mb-2")}>
          {selected.map((option) => (
            <li
              key={option.value}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#075489]/20 bg-[#075489]/[0.06] px-3 py-2"
            >
              <span className="min-w-0 flex-1 break-words text-sm font-medium text-[#075489]">
                {option.label}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v !== option.value))}
                aria-label={`Hapus ${option.label}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#075489] transition-colors hover:bg-[#075489]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Select disembunyikan begitu jumlah yang diminta terpenuhi — untuk mengganti
          pilihan, hapus dulu salah satu lewat tombol × di daftar terpilih. */}
      {!full && (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          suppressHydrationWarning
          onClick={() => (open ? setOpen(false) : openDropdown())}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm outline-none transition-colors bg-white text-left",
            "border-gray-300",
            open ? "border-[#075489] ring-2 ring-[#075489]/20" : "hover:border-gray-400",
            error && "border-red-500 ring-2 ring-red-500/20",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <span className="truncate text-gray-400">
            {loading ? "Memuat opsi..." : placeholder}
          </span>
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          ) : (
            <span
              className={cn(
                "shrink-0 text-gray-400 transition-transform duration-200",
                open && "rotate-180"
              )}
            >
              ▾
            </span>
          )}
        </button>
      )}

      {mounted && createPortal(dropdown, document.body)}
    </div>
  )
}

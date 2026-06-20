"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

export type SelectSearchOption = {
  value: string
  label: string
}

type DropdownPos = { top: number; left: number; width: number }

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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function openDropdown() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    })
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
    function handleScroll() {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPos((prev) => prev && ({
        ...prev,
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      }))
    }
    document.addEventListener("mousedown", handleClose)
    window.addEventListener("scroll", handleScroll, true)
    return () => {
      document.removeEventListener("mousedown", handleClose)
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [open])

  function handleSelect(optionValue: string) {
    onChange(optionValue)
    setOpen(false)
  }

  const dropdown = open && pos ? (
    <div
      style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
    >
      <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
        <div className="border-b border-gray-100 p-2">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-[#075489] focus:ring-1 focus:ring-[#075489]/20 placeholder:text-gray-400"
          />
        </div>
        <ul className="max-h-52 overflow-y-auto py-1">
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
        disabled={disabled}
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

      {typeof window !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  )
}

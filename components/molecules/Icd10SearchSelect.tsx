"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import api from "@/lib/axios"

// Diagnosa terpilih (subset kolom ICD 10 yang dipakai untuk tampilan + id).
export type Icd10Option = { id: number; code: string; display: string }

type DropdownPos = { top: number; left: number; width: number }

type Props = {
  value: Icd10Option | null
  onChange: (icd: Icd10Option) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
}

// Pemilih diagnosa dari master ICD 10 dengan pencarian ke server (debounce),
// karena datanya sangat banyak (puluhan ribu) sehingga tidak bisa dimuat sekaligus.
export function Icd10SearchSelect({
  value,
  onChange,
  placeholder = "-- Pilih diagnosa (ICD 10) --",
  disabled = false,
  error = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Icd10Option[]>([])
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState<DropdownPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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

  // Cari ke server saat dropdown terbuka (debounce). Query kosong = halaman pertama.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await api.get("/master/icd10", {
          params: { search: query.trim() || undefined },
        })
        const rows = res.data.data.data as { id: number; code: string; display: string }[]
        setResults(rows.map((r) => ({ id: r.id, code: r.code, display: r.display })))
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    function handleClose(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function handleScroll() {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPos((prev) => prev && { ...prev, top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
    }
    document.addEventListener("mousedown", handleClose)
    window.addEventListener("scroll", handleScroll, true)
    return () => {
      document.removeEventListener("mousedown", handleClose)
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [open])

  function handleSelect(icd: Icd10Option) {
    onChange(icd)
    setOpen(false)
  }

  const dropdown =
    open && pos ? (
      <div style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}>
        <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari code atau diagnosa..."
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-[#075489] focus:ring-1 focus:ring-[#075489]/20 placeholder:text-gray-400"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {loading ? (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">Mencari...</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">Tidak ditemukan.</li>
            ) : (
              results.map((icd) => (
                <li
                  key={icd.id}
                  onMouseDown={() => handleSelect(icd)}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm transition-colors",
                    icd.id === value?.id
                      ? "bg-[#075489]/8 text-[#075489] font-medium"
                      : "text-gray-700 hover:bg-gray-50",
                  )}
                >
                  <span className="font-mono text-xs font-semibold text-[#4ba69d]">{icd.code}</span>
                  <span className="ml-2">{icd.display}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    ) : null

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm outline-none transition-colors bg-white text-left",
          "border-gray-300",
          open ? "border-[#075489] ring-2 ring-[#075489]/20" : "hover:border-gray-400",
          error && "border-red-500 ring-2 ring-red-500/20",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className={cn("truncate", value ? "text-gray-900" : "text-gray-400")}>
          {value ? (
            <>
              <span className="font-mono text-xs font-semibold text-[#4ba69d]">{value.code}</span>
              <span className="ml-2">{value.display}</span>
            </>
          ) : (
            placeholder
          )}
        </span>
        <span className={cn("ml-2 shrink-0 text-gray-400 transition-transform duration-200", open && "rotate-180")}>
          ▾
        </span>
      </button>

      {typeof window !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  )
}

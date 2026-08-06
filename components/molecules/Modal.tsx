"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "sm" | "md" | "lg" | "xl" | "fit"
  // Sembunyikan bar judul — untuk dialog yang isinya sudah punya judul sendiri
  // (mis. ResultDialog). Menutup tetap bisa lewat Escape, klik backdrop, atau
  // tombol di dalam isinya.
  hideHeader?: boolean
  // Penyesuaian tampilan kartu dan area isi — dipakai dialog yang butuh sudut
  // atau jarak berbeda dari standar (mis. ResultDialog).
  panelClassName?: string
  bodyClassName?: string
}

// Ukuran modal: kecil (sm) / sedang (md) / besar (lg) / sangat besar (xl) — lebar
// tetap (max-width), atau `fit` yang lebarnya MENGIKUTI isi konten (dibatasi 95vw).
const sizeClass = {
  sm: "w-full max-w-sm", // kecil — konfirmasi / daftar ringkas
  md: "w-full max-w-lg", // sedang — form biasa
  lg: "w-full max-w-2xl", // besar — tabel / rincian panjang
  xl: "w-full max-w-5xl", // sangat besar — daftar unit + aksi per baris
  fit: "w-auto max-w-[95vw]", // menyesuaikan lebar dengan isi konten
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  hideHeader = false,
  panelClassName,
  bodyClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          "relative rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]",
          sizeClass[size],
          panelClassName
        )}
      >
        {/* Header */}
        {!hideHeader && (
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        )}

        {/* Body */}
        <div className={cn("flex-1 overflow-y-auto px-4 py-5 sm:px-6", bodyClassName)}>
          {children}
        </div>

        {/* Footer — di mobile tombol menumpuk & full-width (aksi utama di bawah,
            mudah dijangkau ibu jari); di desktop sejajar rata kanan. */}
        {footer && (
          <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-4 sm:px-6 sm:flex-row sm:justify-end sm:gap-3 [&>button]:w-full sm:[&>button]:w-auto shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

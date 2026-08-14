"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { LANGUAGES, useLanguage } from "@/lib/i18n"

/**
 * Pemilih bahasa (Inggris / Indonesia) — tempatnya di header, bersebelahan dengan
 * tombol profil. Bentuknya tombol ringkas berisi kode bahasa aktif ("EN"/"ID");
 * daftar pilihannya baru muncul saat diklik supaya tidak memakan lebar header di
 * layar sempit.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const active = LANGUAGES.find((l) => l.value === lang) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("header.switchLanguage")}
        aria-label={t("header.switchLanguage")}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800",
          open && "bg-gray-100 text-gray-800",
        )}
      >
        <Globe className="h-4 w-4 shrink-0" />
        <span className="font-semibold">{active.short}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg"
        >
          <p className="px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("header.language")}
          </p>
          {LANGUAGES.map((l) => {
            const selected = l.value === lang
            return (
              <button
                key={l.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setLang(l.value)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  selected
                    ? "bg-[#075489]/8 font-semibold text-[#075489]"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {l.flag}
                </span>
                <span className="flex-1 text-left">{l.label}</span>
                {selected && <Check className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

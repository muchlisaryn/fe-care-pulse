"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { dictionary } from "./dictionary"
import { translateName, type Lang } from "./glossary"

export type { Lang } from "./glossary"
export { translateName } from "./glossary"

/** Bahasa bawaan aplikasi. */
export const DEFAULT_LANG: Lang = "en"

/** Kunci localStorage — pilihan bahasa bertahan setelah halaman dimuat ulang. */
const STORAGE_KEY = "care-pulse-lang"

/**
 * Locale Intl untuk bahasa aktif — dipakai `toLocaleDateString`/`toLocaleTimeString`
 * agar nama hari & bulan ikut bahasa yang sedang dipilih. en-GB, bukan en-US,
 * supaya urutannya tetap hari-bulan-tahun seperti kebiasaan di sini.
 */
export function localeOf(lang: Lang): string {
  return lang === "id" ? "id-ID" : "en-GB"
}

export const LANGUAGES: { value: Lang; label: string; short: string; flag: string }[] = [
  { value: "en", label: "English", short: "EN", flag: "🇬🇧" },
  { value: "id", label: "Indonesia", short: "ID", flag: "🇮🇩" },
]

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Teks antarmuka tetap, dibaca dengan kunci bertitik: t("common.search"). */
  t: (key: string, vars?: Record<string, string | number>) => string
  /** Nama dari DATABASE (menu, judul seksi) — lewat glosarium, bukan kamus. */
  tn: (text: string | null | undefined) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

/** Telusuri kunci bertitik di dalam objek kamus. */
function lookup(source: unknown, key: string): string | undefined {
  let node: unknown = source
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : undefined
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Selalu mulai dari bahasa bawaan supaya HTML dari server dan render pertama di
  // browser sama persis; pilihan tersimpan baru dipakai setelah itu (lihat efek di
  // bawah). Membaca localStorage langsung di sini membuat hidrasi tidak cocok.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "en" || saved === "id") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved !== DEFAULT_LANG) setLangState(saved)
    }
  }, [])

  // Atribut lang di <html> ikut berubah — dipakai pembaca layar & terjemahan bawaan
  // peramban untuk tahu halaman ini sedang berbahasa apa.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      // Bahasa aktif dulu, lalu bahasa bawaan sebagai cadangan; kalau dua-duanya
      // tidak punya, kuncinya sendiri yang ditampilkan. Layar tidak pernah kosong,
      // dan kunci yang belum diterjemahkan langsung kelihatan saat ditinjau.
      const raw = lookup(dictionary[lang], key) ?? lookup(dictionary[DEFAULT_LANG], key) ?? key
      if (!vars) return raw
      return raw.replace(/\{(\w+)\}/g, (m, name) => String(vars[name] ?? m))
    },
    [lang],
  )

  const tn = useCallback((text: string | null | undefined) => translateName(text, lang), [lang])

  const value = useMemo<LanguageContextValue>(() => ({ lang, setLang, t, tn }), [lang, setLang, t, tn])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/**
 * Akses bahasa aktif + penerjemah. Sengaja tidak melempar error saat dipakai di
 * luar provider: komponen yang sama juga dirender di halaman monitor/login yang
 * berdiri sendiri, dan lebih baik tampil dalam bahasa bawaan daripada layar putih.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (ctx) return ctx
  return {
    lang: DEFAULT_LANG,
    setLang: () => {},
    t: (key, vars) => {
      const raw = lookup(dictionary[DEFAULT_LANG], key) ?? key
      return vars ? raw.replace(/\{(\w+)\}/g, (m, n) => String(vars[n] ?? m)) : raw
    },
    tn: (text) => translateName(text, DEFAULT_LANG),
  }
}

/** Pintasan yang paling sering dipakai di halaman: const t = useT(). */
export function useT() {
  return useLanguage().t
}

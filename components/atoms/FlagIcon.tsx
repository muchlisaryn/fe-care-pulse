"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"
import type { Lang } from "@/lib/i18n"

/**
 * Bendera negara sebagai SVG, bukan emoji.
 *
 * Emoji bendera (🇬🇧 / 🇮🇩) TIDAK dirender di Windows — font bawaannya tidak punya
 * glif itu, sehingga yang muncul justru huruf "GB"/"ID". Karena aplikasi ini banyak
 * dipakai dari komputer rumah sakit, benderanya digambar sendiri agar tampil sama
 * di semua sistem operasi (sekaligus mengikuti aturan "tanpa emoji sebagai ikon").
 */
export function FlagIcon({ lang, className }: { lang: Lang; className?: string }) {
  // Union Jack memakai clipPath; id-nya harus unik per instance supaya bendera
  // kedua tidak ikut memakai kliping milik bendera pertama.
  const uid = useId().replace(/[:]/g, "")

  // Bingkai tipis: sisi putih bendera Indonesia menyatu dengan latar terang.
  const frame = cn("block shrink-0 rounded-[2px] ring-1 ring-black/10", className)

  if (lang === "id") {
    return (
      <svg viewBox="0 0 60 40" className={frame} aria-hidden focusable="false">
        <rect width="60" height="20" fill="#CE1126" />
        <rect y="20" width="60" height="20" fill="#FFFFFF" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 60 40" className={frame} aria-hidden focusable="false">
      <clipPath id={`flag-${uid}`}>
        {/* Setengah tiap diagonal — supaya garis merah St Patrick miring berlawanan
            di tiap kuadran, seperti Union Jack sungguhan. */}
        <path d="M30,20 h30 v20 z v20 h-30 z h-30 v-20 z v-20 h30 z" />
      </clipPath>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#FFFFFF" strokeWidth="8" />
      <path
        d="M0,0 L60,40 M60,0 L0,40"
        clipPath={`url(#flag-${uid})`}
        stroke="#C8102E"
        strokeWidth="5"
      />
      <path d="M30,0 v40 M0,20 h60" stroke="#FFFFFF" strokeWidth="13" />
      <path d="M30,0 v40 M0,20 h60" stroke="#C8102E" strokeWidth="8" />
    </svg>
  )
}

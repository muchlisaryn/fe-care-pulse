"use client"

import { CalendarClock } from "lucide-react"
import { localeOf, useLanguage, type Lang } from "@/lib/i18n"

/**
 * Penanda masa kedaluwarsa steril. Unit yang sudah masuk masa peringatan (H-7) atau
 * sudah lewat TIDAK cukup ditandai tanggalnya saja — ditampilkan sebagai kartu merah
 * berisi tanggal + sisa harinya, mis. "Kedaluwarsa 09 Agu 2026 · 5 hari lagi",
 * supaya petugas tak perlu menghitung sendiri dari tanggal hari ini.
 *
 * Unit yang masih aman tampil apa adanya (tanggal abu-abu) agar kartu merah benar-benar
 * hanya muncul untuk yang perlu perhatian.
 */
type ExpiryCardProps = {
  date: string | null
  /** Sisa hari sampai kedaluwarsa dari server; negatif = sudah lewat. */
  daysToExpiry: number | null
  /** Sudah lewat tanggal kedaluwarsa. */
  expired?: boolean
  /** Masuk masa peringatan (H-7) — termasuk yang sudah lewat. */
  alert?: boolean
  className?: string
}

function formatDate(value: string | null, locale: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(localeOf(locale), { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Keterangan sisa hari: "5 hari lagi" / "hari ini" / "lewat 3 hari".
 * Yang dikembalikan KUNCI kamus + variabelnya, diterjemahkan saat dirender.
 */
function remainingKey(
  daysToExpiry: number | null,
  expired: boolean,
): { key: string; vars?: Record<string, number> } | null {
  if (daysToExpiry === null) return null
  if (expired || daysToExpiry < 0) {
    return { key: "expiryCard.daysOverdue", vars: { n: Math.abs(daysToExpiry) } }
  }
  if (daysToExpiry === 0) return { key: "expiryCard.today" }
  return { key: "expiryCard.daysLeft", vars: { n: daysToExpiry } }
}

export function ExpiryCard({
  date,
  daysToExpiry,
  expired = false,
  alert = false,
  className = "",
}: ExpiryCardProps) {
  // Selalu mengikuti bahasa yang dipilih di header.
  const { t, lang } = useLanguage()

  // Belum perlu perhatian → cukup tanggalnya, tanpa kartu.
  if (!alert && !expired) {
    return (
      <span className={"text-xs text-gray-500 " + className}>
        {date ? formatDate(date, lang) : <span className="text-gray-400">—</span>}
      </span>
    )
  }

  const remaining = remainingKey(daysToExpiry, expired)

  return (
    <span
      title={expired ? t("expiryCard.titleExpired") : t("expiryCard.titleSoon")}
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 " +
        className
      }
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">
        {t("expiryCard.expiresPrefix")} {formatDate(date, lang)}
      </span>
      {remaining && <span className="text-red-500">({t(remaining.key, remaining.vars)})</span>}
    </span>
  )
}

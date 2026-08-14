"use client"

import { CalendarClock } from "lucide-react"
import { useLanguage } from "@/lib/i18n"

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
  /** Bahasa teks & format tanggal — halaman berbahasa Inggris mengirim "en". */
  locale?: "id" | "en"
}

function formatDate(value: string | null, locale: "id" | "en") {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const tag = locale === "en" ? "en-GB" : "id-ID"
  return d.toLocaleDateString(tag, { day: "2-digit", month: "short", year: "numeric" })
}

/** Keterangan sisa hari: "5 hari lagi" / "hari ini" / "lewat 3 hari". */
function remainingLabel(
  daysToExpiry: number | null,
  expired: boolean,
  locale: "id" | "en",
): string | null {
  if (daysToExpiry === null) return null
  if (expired || daysToExpiry < 0) {
    const n = Math.abs(daysToExpiry)
    return locale === "en" ? `${n} days overdue` : `lewat ${n} hari`
  }
  if (daysToExpiry === 0) return locale === "en" ? "today" : "hari ini"
  return locale === "en" ? `${daysToExpiry} days left` : `${daysToExpiry} hari lagi`
}

export function ExpiryCard({
  date,
  daysToExpiry,
  expired = false,
  alert = false,
  className = "",
  locale,
}: ExpiryCardProps) {
  // Tanpa prop `locale`, kartu mengikuti bahasa yang sedang dipilih di header.
  const { lang } = useLanguage()
  locale ??= lang
  // Belum perlu perhatian → cukup tanggalnya, tanpa kartu.
  if (!alert && !expired) {
    return (
      <span className={"text-xs text-gray-500 " + className}>
        {date ? formatDate(date, locale) : <span className="text-gray-400">—</span>}
      </span>
    )
  }

  const remaining = remainingLabel(daysToExpiry, expired, locale)

  return (
    <span
      title={
        locale === "en"
          ? expired
            ? "Already expired"
            : "Expiring soon"
          : expired
            ? "Sudah kedaluwarsa"
            : "Mendekati kedaluwarsa"
      }
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 " +
        className
      }
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">
        {locale === "en" ? "Expires" : "Kedaluwarsa"} {formatDate(date, locale)}
      </span>
      {remaining && <span className="text-red-500">({remaining})</span>}
    </span>
  )
}

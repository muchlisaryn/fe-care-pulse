import { CalendarClock } from "lucide-react"

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

function formatDate(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

/** Keterangan sisa hari: "5 hari lagi" / "hari ini" / "lewat 3 hari". */
function remainingLabel(daysToExpiry: number | null, expired: boolean): string | null {
  if (daysToExpiry === null) return null
  if (expired || daysToExpiry < 0) return `lewat ${Math.abs(daysToExpiry)} hari`
  return daysToExpiry === 0 ? "hari ini" : `${daysToExpiry} hari lagi`
}

export function ExpiryCard({
  date,
  daysToExpiry,
  expired = false,
  alert = false,
  className = "",
}: ExpiryCardProps) {
  // Belum perlu perhatian → cukup tanggalnya, tanpa kartu.
  if (!alert && !expired) {
    return (
      <span className={"text-xs text-gray-500 " + className}>
        {date ? formatDate(date) : <span className="text-gray-400">—</span>}
      </span>
    )
  }

  const remaining = remainingLabel(daysToExpiry, expired)

  return (
    <span
      title={expired ? "Sudah kedaluwarsa" : "Mendekati kedaluwarsa"}
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 " +
        className
      }
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">Kedaluwarsa {formatDate(date)}</span>
      {remaining && <span className="text-red-500">({remaining})</span>}
    </span>
  )
}

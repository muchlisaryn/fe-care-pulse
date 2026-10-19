"use client"

import { Input } from "@/components/atoms/Input"
import { useT } from "@/lib/i18n"
import { geserTanggal, jumlahHari } from "@/lib/dateRange"

type DateRangeFieldsProps = {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  fromLabel?: string
  toLabel?: string
  /** Panjang rentang maksimal (hari, inklusif). Ujung lainnya ikut digeser bila terlampaui. */
  maxDays?: number
}

/**
 * Sepasang input tanggal (awal & akhir) untuk filter rentang. Dirender sebagai
 * fragment — dua kolom terpisah — supaya langsung menempati sel grid filter
 * pemanggilnya tanpa wrapper tambahan.
 *
 * Batas silang (`max`/`min`) mencegah rentang terbalik sebelum request dikirim.
 */
export function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
  fromLabel,
  toLabel,
  maxDays,
}: DateRangeFieldsProps) {
  const t = useT()

  function changeFrom(value: string) {
    onFromChange(value)
    if (maxDays && value && to && jumlahHari(value, to) > maxDays) onToChange(geserTanggal(value, maxDays - 1))
  }

  function changeTo(value: string) {
    onToChange(value)
    if (maxDays && value && from && jumlahHari(from, value) > maxDays) onFromChange(geserTanggal(value, -(maxDays - 1)))
  }

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{fromLabel ?? t("common.dateFrom")}</label>
        <Input type="date" value={from} max={to || undefined} onChange={(e) => changeFrom(e.target.value)} />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{toLabel ?? t("common.dateTo")}</label>
        <Input type="date" value={to} min={from || undefined} onChange={(e) => changeTo(e.target.value)} />
      </div>
    </>
  )
}

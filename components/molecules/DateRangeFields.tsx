"use client"

import { Input } from "@/components/atoms/Input"

type DateRangeFieldsProps = {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  fromLabel?: string
  toLabel?: string
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
  fromLabel = "Tanggal Awal",
  toLabel = "Tanggal Akhir",
}: DateRangeFieldsProps) {
  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{fromLabel}</label>
        <Input type="date" value={from} max={to || undefined} onChange={(e) => onFromChange(e.target.value)} />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{toLabel}</label>
        <Input type="date" value={to} min={from || undefined} onChange={(e) => onToChange(e.target.value)} />
      </div>
    </>
  )
}

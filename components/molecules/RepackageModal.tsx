"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Loader2, MapPin, PackageOpen } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Checkbox } from "@/components/atoms/Checkbox"
import { Modal } from "@/components/molecules/Modal"
import {
  fetchSterileExpiryLabels,
  repackageSterileExpiry,
  type RepackageResult,
  type SterileExpiryBatch,
  type SterileExpiryLabel,
} from "@/lib/store/slices/sterileExpirySlice"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Props = {
  /** Batch yang diklik; `null` = dialog tertutup. */
  batch: SterileExpiryBatch | null
  /** Ambang hari yang sedang aktif di halaman — dipakai agar isinya sama dengan barisnya. */
  days: number
  onClose: () => void
  onDone: (result: RepackageResult) => void
}

/**
 * Dialog "Packaging Ulang" — memilih BUNGKUS kedaluwarsa sebuah batch steril untuk
 * ditarik dari rak dan dikemas ulang.
 *
 * Satuan pilihannya LABEL, bukan instrumen: sterilitas melekat pada bungkus, jadi
 * menarik satu instrumen dari sebuah set berarti bungkusnya sudah dibuka. Server
 * menegakkan aturan yang sama dengan memperluas pilihan ke seluruh isi label, jadi
 * dialog ini tidak perlu (dan tidak boleh) menawarkan pilihan per instrumen.
 *
 * Label yang BELUM kedaluwarsa tetap ditampilkan — halaman ini juga memuat yang
 * "akan" kedaluwarsa — tapi tidak bisa dicentang, supaya petugas melihat isi utuh
 * batchnya tanpa bisa menarik barang yang masih layak pakai.
 */
export function RepackageModal({ batch, days, onClose, onDone }: Props) {
  const t = useT()
  const [labels, setLabels] = useState<SterileExpiryLabel[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const batchId = batch?.id ?? null

  const load = useCallback(async () => {
    if (batchId === null) return
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchSterileExpiryLabels(batchId, days)
      setLabels(rows)
      // Yang kedaluwarsa langsung tercentang: itu maksud petugas membuka dialog ini.
      // Tetap bisa dilepas satu-satu kalau sebagian bungkus mau ditinggal dulu.
      setPicked(rows.filter((r) => r.expired).map((r) => r.key))
    } catch (x: any) {
      setError(x.response?.data?.message ?? t("expiry.repackErrLoad"))
      setLabels([])
      setPicked([])
    } finally {
      setLoading(false)
    }
  }, [batchId, days, t])

  useEffect(() => {
    if (batchId === null) return
    void load()
  }, [batchId, load])

  // Stabil antar render: Modal memasang listener Escape dengan onClose sebagai
  // dependensi, jadi fungsi baru tiap render berarti listener dipasang ulang terus.
  const handleClose = useCallback(() => {
    if (!saving) onClose()
  }, [saving, onClose])

  if (!batch) return null

  const selectable = labels.filter((r) => r.expired)
  const allPicked = selectable.length > 0 && picked.length === selectable.length
  const pickedRows = labels.filter((r) => picked.includes(r.key))
  const pickedUnits = pickedRows.reduce((n, r) => n + r.unit_count, 0)

  function toggle(key: string) {
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function toggleAll() {
    setPicked(allPicked ? [] : selectable.map((r) => r.key))
  }

  async function submit() {
    if (batchId === null || pickedRows.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const result = await repackageSterileExpiry(
        batchId,
        pickedRows.flatMap((r) => r.storage_ids),
      )
      onDone(result)
    } catch (x: any) {
      setError(x.response?.data?.message ?? t("expiry.repackErrSave"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={handleClose}
      title={t("expiry.repackTitle", { code: batch.code ?? "—" })}
      size="lg"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">
            {pickedRows.length > 0
              ? t("expiry.repackSelected", { labels: pickedRows.length, units: pickedUnits })
              : t("expiry.repackSelectNone")}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={submit}
              disabled={saving || loading || pickedRows.length === 0}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("expiry.repackSaving")}
                </span>
              ) : (
                t("expiry.repackConfirm")
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          {t("expiry.repackHint")}
        </p>

        {error && (
          <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : labels.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">{t("expiry.repackEmpty")}</div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-2 border-b border-gray-100 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Checkbox
                checked={allPicked}
                indeterminate={picked.length > 0 && !allPicked}
                onChange={toggleAll}
                disabled={selectable.length === 0}
              />
              {t("expiry.repackSelectAll", { n: selectable.length })}
            </label>

            {labels.map((row) => (
              <label
                key={row.key}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  row.expired
                    ? "cursor-pointer border-gray-200 hover:bg-gray-50"
                    : "cursor-not-allowed border-gray-100 bg-gray-50/60 opacity-60",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={picked.includes(row.key)}
                  onChange={() => toggle(row.key)}
                  disabled={!row.expired}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{row.name}</span>
                    <Badge variant={row.type === "paket" ? "info" : "default"}>
                      {row.type === "paket"
                        ? t("expiry.repackSet", { n: row.unit_count })
                        : t("expiry.repackSingle")}
                    </Badge>
                    {row.expired ? (
                      <Badge variant="danger">{t("expiry.repackExpired")}</Badge>
                    ) : (
                      <Badge variant="warning">{t("expiry.repackStillValid")}</Badge>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {row.barcode_no && (
                      <span className="font-mono text-[#075489]">{row.barcode_no}</span>
                    )}
                    {row.rack_code && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {row.rack_code}
                      </span>
                    )}
                    {row.expiry_date && <span>{row.expiry_date}</span>}
                  </span>
                  {/* Isi set dijabarkan supaya petugas tahu persis apa yang ikut
                      ditarik — seluruh isi bungkus, bukan hanya satu instrumen. */}
                  {row.units.length > 1 && (
                    <span className="mt-1 block text-xs text-gray-400">
                      {row.units.map((u) => u.code ?? u.name).join(", ")}
                    </span>
                  )}
                </span>
                <PackageOpen className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

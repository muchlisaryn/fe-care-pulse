"use client"

import type { ReactNode } from "react"
import { Info, TriangleAlert } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/molecules/Modal"
import { useT } from "@/lib/i18n"

type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  description?: ReactNode
  loading?: boolean
  // Teks tombol konfirmasi — default "Hapus" (untuk aksi hapus).
  confirmLabel?: string
  loadingLabel?: string
  // Teks tombol batal — default "Batal" (halaman berbahasa Inggris mengirim "Cancel").
  cancelLabel?: string
  // Ukuran modal — default "sm". "md"/"lg" untuk daftar panjang; "fit" = lebar mengikuti isi.
  size?: "sm" | "md" | "lg" | "fit"
  /**
   * Nada dialog. Default `danger` — merah + segitiga peringatan, untuk aksi yang
   * membuang data. Pakai `primary` untuk konfirmasi yang PERLU ditegaskan tapi
   * tidak merusak (mis. memvalidasi kuitansi): tombol merah dan ikon peringatan
   * di situ salah pesan, seolah-olah penggunanya akan menghapus sesuatu.
   */
  tone?: "danger" | "primary"
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  loading = false,
  confirmLabel,
  loadingLabel,
  cancelLabel,
  size = "sm",
  tone = "danger",
}: ConfirmDialogProps) {
  // Teks bawaan mengikuti BAHASA AKTIF, bukan lagi tetap bahasa Indonesia. Halaman
  // yang mengirim `labels` sendiri tetap menang — propnya hanya jadi penimpa.
  const t = useT()
  title ??= t("common.confirmDelete")
  description ??= t("common.confirmDeleteDesc")
  // Teks bawaan pun ikut nadanya: "Hapus"/"Menghapus..." hanya benar untuk
  // dialog hapus, dan jadi menyesatkan pada konfirmasi lain.
  const bahaya = tone === "danger"
  confirmLabel ??= bahaya ? t("common.delete") : t("common.confirm")
  loadingLabel ??= bahaya ? t("common.deleting") : t("common.saving")
  cancelLabel ??= t("common.cancel")

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      size={size}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={
              bahaya
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-[#075489] hover:bg-[#075489]/90 text-white"
            }
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 items-start">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            bahaya ? "bg-red-50" : "bg-[#075489]/10"
          }`}
        >
          {bahaya ? (
            <TriangleAlert className="h-5 w-5 text-red-600" />
          ) : (
            <Info className="h-5 w-5 text-[#075489]" />
          )}
        </div>
        <p className="text-sm text-gray-600 leading-relaxed pt-1.5">{description}</p>
      </div>
    </Modal>
  )
}

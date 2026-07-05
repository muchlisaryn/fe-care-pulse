"use client"

import type { ReactNode } from "react"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/molecules/Modal"

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
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Hapus Data",
  description = "Apakah Anda yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.",
  loading = false,
  confirmLabel = "Hapus",
  loadingLabel = "Menghapus...",
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
          <TriangleAlert className="h-5 w-5 text-red-600" />
        </div>
        <p className="text-sm text-gray-600 leading-relaxed pt-1.5">{description}</p>
      </div>
    </Modal>
  )
}

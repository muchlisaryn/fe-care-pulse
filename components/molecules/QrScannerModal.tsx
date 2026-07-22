"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Modal } from "@/components/molecules/Modal"

type QrScannerModalProps = {
  open: boolean
  onClose: () => void
  /** Dipanggil sekali saat QR/barcode berhasil dibaca (scanner otomatis berhenti). */
  onScan: (text: string) => void
  title?: string
  hint?: string
}

/**
 * Modal pemindai QR/barcode via KAMERA (html5-qrcode). Dipakai di HP/tablet yang
 * tak punya scanner fisik. Kamera dimulai saat modal dibuka & dihentikan saat
 * ditutup / setelah satu pindaian berhasil.
 *
 * Catatan: akses kamera butuh secure context (https atau localhost). Di jaringan
 * lewat http IP biasa, browser memblokir getUserMedia — jalankan `npm run dev:https`.
 */
export function QrScannerModal({ open, onClose, onScan, title = "Scan QR", hint }: QrScannerModalProps) {
  // Id unik & stabil per instance untuk elemen target html5-qrcode.
  const regionId = "qr-region-" + useId().replace(/[:]/g, "")
  const [error, setError] = useState<string | null>(null)
  // Simpan callback terbaru tanpa memicu ulang start kamera.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!open) return

    let scanner: import("html5-qrcode").Html5Qrcode | null = null
    let stopped = false

    // Import dinamis agar tak dibundel di SSR & hanya jalan di browser.
    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (stopped) return
        setError(null)
        scanner = new Html5Qrcode(regionId, /* verbose */ false)
        return scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            if (stopped) return
            stopped = true
            onScanRef.current(decodedText)
            // Hentikan kamera lalu tutup modal.
            scanner?.stop().catch(() => {}).finally(() => onClose())
          },
          // Error per-frame (tidak menemukan kode) — abaikan, ini normal.
          () => {},
        )
      })
      .catch((e: unknown) => {
        if (stopped) return
        const msg =
          (e as { message?: string })?.message ??
          "Tidak bisa mengakses kamera. Pastikan izin kamera aktif & memakai https/localhost."
        setError(msg)
      })

    return () => {
      stopped = true
      // Hentikan kamera saat modal ditutup / komponen unmount.
      if (scanner) {
        scanner.stop().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, regionId])

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-3">
        <div
          id={regionId}
          className="mx-auto w-full max-w-sm overflow-hidden rounded-lg bg-black [&_video]:h-auto [&_video]:w-full"
        />
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <p className="text-center text-xs text-gray-500">
            {hint ?? "Arahkan kamera ke QR code."}
          </p>
        )}
      </div>
    </Modal>
  )
}

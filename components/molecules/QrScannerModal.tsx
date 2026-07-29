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
 * Cari kamera BELAKANG dari daftar kamera perangkat lewat labelnya. Label kamera
 * berbeda-beda per browser/bahasa ("back", "rear", "environment", "belakang", …),
 * jadi dicocokkan dengan beberapa kata kunci sekaligus. Bila tidak ada yang cocok,
 * kamera TERAKHIR dipakai — di Android urutannya depan lalu belakang.
 */
function pickBackCamera(cameras: { id: string; label: string }[]): string | null {
  if (cameras.length === 0) return null
  const back = cameras.find((c) => /back|rear|environment|belakang|trás|traseira|arrière|背面|후면/i.test(c.label))
  return (back ?? cameras[cameras.length - 1]).id
}

/**
 * Modal pemindai QR/barcode via KAMERA (html5-qrcode). Dipakai di HP/tablet yang
 * tak punya scanner fisik. Kamera dimulai saat modal dibuka & dihentikan saat
 * ditutup / setelah satu pindaian berhasil. Kamera yang dipakai selalu yang
 * BELAKANG (lihat urutan percobaan di dalam efek).
 *
 * Catatan: akses kamera butuh secure context (https atau localhost). Bila halaman
 * dibuka lewat http biasa (IP LAN / domain produksi tanpa TLS), `mediaDevices`
 * tidak ada sama sekali — saat pengembangan pakai `npm run dev:https`, di server
 * pasang sertifikat di web server-nya.
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

    // Halaman non-secure (http selain localhost): `mediaDevices` tidak ada sama
    // sekali, jadi pemindainya tak perlu dimuat. Penyebabnya disampaikan lewat
    // rantai promise yang sama agar pesannya tetap satu jalur.
    // typeof, bukan sekadar cek truthy: tipe bawaan TS menganggap `mediaDevices`
    // selalu ada, padahal di halaman non-secure objeknya memang tidak dibuat.
    const start = typeof navigator.mediaDevices?.getUserMedia === "function"
      ? // Import dinamis agar tak dibundel di SSR & hanya jalan di browser.
        import("html5-qrcode").then(async ({ Html5Qrcode }) => {
          if (stopped) return
          setError(null)
          scanner = new Html5Qrcode(regionId, /* verbose */ false)
          const config = { fps: 10, qrbox: { width: 240, height: 240 } }
          const onDecoded = (decodedText: string) => {
            if (stopped) return
            stopped = true
            onScanRef.current(decodedText)
            // Hentikan kamera lalu tutup modal.
            scanner?.stop().catch(() => {}).finally(() => onClose())
          }
          // Error per-frame (tidak menemukan kode) — abaikan, ini normal.
          const onFrameError = () => {}

          /**
           * Nyalakan kamera tertentu. `true` bila berhasil. Bila modal keburu ditutup
           * saat kamera masih menyala, kameranya langsung dimatikan lagi (cleanup efek
           * sudah lewat sebelum start selesai).
           */
          const tryStart = async (camera: string | MediaTrackConstraints) => {
            await scanner!.start(camera, config, onDecoded, onFrameError)
            if (stopped) await scanner!.stop().catch(() => {})
            return true
          }

          // Urutan percobaan agar kamera BELAKANG yang terpakai — bukan kamera depan:
          // 1) `exact: "environment"` → browser WAJIB memakai kamera belakang;
          // 2) pilih deviceId kamera belakang dari daftar kamera (lewat labelnya);
          // 3) `facingMode: "environment"` biasa — sekadar preferensi, jalan terakhir
          //    untuk perangkat berkamera tunggal (mis. laptop).
          try {
            if (await tryStart({ facingMode: { exact: "environment" } })) return
          } catch {
            if (stopped) return
          }

          try {
            const backId = pickBackCamera(await Html5Qrcode.getCameras())
            if (stopped) return
            if (backId && (await tryStart(backId))) return
          } catch {
            if (stopped) return
          }

          await tryStart({ facingMode: "environment" })
        })
      : Promise.reject(
          new Error(
            "Kamera tidak tersedia karena halaman ini dibuka lewat http. Buka lewat https (atau localhost) agar kamera bisa dipakai.",
          ),
        )

    start.catch((e: unknown) => {
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

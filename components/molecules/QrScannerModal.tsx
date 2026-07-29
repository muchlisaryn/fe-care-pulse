"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ImageUp, Loader2 } from "lucide-react"
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
 * Modal pemindai QR/barcode. Punya DUA jalur, karena jalur pertama tidak selalu
 * tersedia:
 *
 *  1. PINDAI LANGSUNG (html5-qrcode + `getUserMedia`) — kamera menyala di dalam
 *     modal dan membaca terus-menerus. Kamera yang dipakai selalu yang BELAKANG
 *     (lihat urutan percobaan di dalam efek). Hanya bisa pada secure context.
 *  2. AMBIL FOTO (`<input type="file" capture="environment">` → `scanFile`) —
 *     membuka aplikasi kamera bawaan perangkat, lalu QR dibaca dari fotonya.
 *
 * Jalur 2 penting karena `getUserMedia` HANYA ada di secure context (https atau
 * localhost): di halaman http biasa — IP LAN, domain produksi tanpa TLS —
 * `navigator.mediaDevices` tidak dibuat sama sekali, jadi jalur 1 mustahil dan
 * tidak ada JavaScript yang bisa menyiasatinya. File input tidak kena aturan itu
 * sehingga tetap berfungsi. Jalur 2 juga jadi penyelamat saat izin kamera
 * diblokir untuk situs ini, atau saat pemindaian langsung susah fokus.
 *
 * Jalur 1 tetap yang utama bila tersedia — memindai terus-menerus jauh lebih
 * cepat daripada memotret satu per satu. Pasang TLS di server (lihat
 * `deploy/apache/README.md`) agar operator dapat jalur yang cepat itu.
 */
export function QrScannerModal({ open, ...props }: QrScannerModalProps) {
  // Isi modal hanya dirender saat terbuka → state internal (galat/mode/foto) selalu
  // segar tiap kali dibuka, tanpa perlu efek reset. Sekaligus menjamin pemeriksaan
  // `mediaDevices` di bawah hanya jalan di browser, bukan saat SSR.
  if (!open) return null
  return <QrScanner {...props} />
}

function QrScanner({ onClose, onScan, title = "Scan QR", hint }: Omit<QrScannerModalProps, "open">) {
  // Id unik & stabil per instance untuk elemen target html5-qrcode.
  const regionId = "qr-region-" + useId().replace(/[:]/g, "")
  const [error, setError] = useState<string | null>(null)
  // Kamera langsung tak bisa dipakai → hanya jalur foto yang ditawarkan.
  // typeof, bukan sekadar cek truthy: tipe bawaan TS menganggap `mediaDevices`
  // selalu ada, padahal di halaman non-secure objeknya memang tidak dibuat.
  const [photoOnly] = useState(() => typeof navigator.mediaDevices?.getUserMedia !== "function")
  // Foto sedang dibaca (dekode bisa memakan waktu pada foto beresolusi besar).
  const [reading, setReading] = useState(false)
  // Simpan callback terbaru tanpa memicu ulang start kamera.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    // Halaman non-secure: pemindai langsungnya tak perlu dimuat sama sekali —
    // hanya jalur foto yang ditawarkan.
    if (photoOnly) return

    let scanner: import("html5-qrcode").Html5Qrcode | null = null
    let stopped = false
    let stopping: Promise<void> | null = null

    /**
     * Matikan kamera — cukup sekali. Pemanggil berikutnya ikut promise yang sama
     * supaya penutupan modal & keberhasilan pindaian tidak saling menimpa dengan
     * dua `stop()` yang berjalan bersamaan.
     */
    const stopCamera = () => (stopping ??= scanner ? scanner.stop().catch(() => {}) : Promise.resolve())

    // Import dinamis agar tak dibundel di SSR & hanya jalan di browser.
    const start = import("html5-qrcode").then(async ({ Html5Qrcode }) => {
      if (stopped) return
      scanner = new Html5Qrcode(regionId, /* verbose */ false)
      const config = { fps: 10, qrbox: { width: 240, height: 240 } }
      const onDecoded = (decodedText: string) => {
        if (stopped) return
        stopped = true
        onScanRef.current(decodedText)
        // Hentikan kamera lalu tutup modal.
        stopCamera().finally(() => onClose())
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
        if (stopped) await stopCamera()
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
      //
      // Menunggu `start` selesai dulu, bukan langsung stop(): saat modal ditutup
      // selagi kamera masih dinyalakan, html5-qrcode MENOLAK stop() karena
      // pemindainya belum berstatus SCANNING. Galatnya tertelan, start() tetap
      // lanjut, dan kameranya menyala setelah itu tanpa ada yang mematikan —
      // lampu kamera terus hidup sampai halaman dimuat ulang dan pemindai
      // berikutnya gagal dengan "camera in use". Menunggu di sini membuat
      // stop()-nya selalu kena pada saat pemindai benar-benar sudah jalan.
      start.catch(() => {}).finally(stopCamera)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoOnly, regionId])

  /**
   * Baca QR dari FOTO. Dipakai di halaman http (kamera langsung tak ada) dan
   * sebagai penyelamat saat pemindaian langsung gagal.
   *
   * `scanFile` butuh instance sendiri dan elemen wadah yang ada di DOM; instance
   * live (kalau ada) sedang memegang elemen itu, jadi dipakai wadah terpisah
   * khusus foto.
   */
  async function readFile(file: File) {
    setReading(true)
    setError(null)
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const reader = new Html5Qrcode(regionId + "-file", /* verbose */ false)
      try {
        // showImage=false: fotonya tidak perlu ditampilkan ulang di modal.
        const text = await reader.scanFile(file, /* showImage */ false)
        onScanRef.current(text)
        onClose()
      } finally {
        reader.clear()
      }
    } catch {
      setError(
        "QR tidak terbaca dari foto itu. Pastikan seluruh kode masuk ke dalam bingkai, cukup terang, dan tidak buram — lalu potret lagi.",
      )
    } finally {
      setReading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={title} size="md">
      <div className="space-y-3">
        {/* Wadah pemindai langsung — disembunyikan saat hanya jalur foto yang ada. */}
        <div
          id={regionId}
          className={
            "mx-auto w-full max-w-sm overflow-hidden rounded-lg [&_video]:h-auto [&_video]:w-full " +
            (photoOnly ? "hidden" : "bg-black")
          }
        />
        {/* Wadah khusus scanFile — html5-qrcode butuh elemen nyata di DOM. */}
        <div id={regionId + "-file"} className="hidden" />

        {photoOnly && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            Halaman ini dibuka lewat http, jadi kamera tidak bisa menyala langsung di
            dalam halaman — aturan browser, bukan soal izin di HP. Pakai tombol di bawah:
            potret label raknya, QR akan dibaca dari foto itu.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Ambil foto — selalu tersedia. Di http ini satu-satunya jalan; di https
            berguna saat pemindaian langsung susah fokus. `capture="environment"`
            meminta kamera belakang perangkat. */}
        <label
          className={
            "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:border-[#075489] hover:bg-[#075489]/5 " +
            (reading ? "pointer-events-none opacity-60" : "")
          }
        >
          {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
          {reading ? "Membaca foto..." : photoOnly ? "Ambil Foto QR" : "Susah terbaca? Ambil foto saja"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={reading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Reset nilainya supaya memilih foto yang SAMA dua kali tetap memicu onChange.
              e.target.value = ""
              if (file) void readFile(file)
            }}
          />
        </label>

        {!photoOnly && !error && (
          <p className="text-center text-xs text-gray-500">{hint ?? "Arahkan kamera ke QR code."}</p>
        )}
      </div>
    </Modal>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { Camera, CameraOff, Check, List, Loader2, ScanLine, Search } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Modal } from "@/components/molecules/Modal"
import { QrScannerModal } from "@/components/molecules/QrScannerModal"
import { cn } from "@/lib/utils"

export type RackOption = { id: number; name: string }

/**
 * Hasil pembacaan izin kamera: `unavailable` = kamera tak bisa dipakai sama
 * sekali (bukan secure context), `denied` = diblokir untuk situs ini, `ok` =
 * boleh dipakai / izin masih akan ditanyakan saat kamera dinyalakan.
 */
type CameraPermission = "ok" | "denied" | "unavailable"

/** Baca status izin kamera browser TANPA menyentuh state React. */
async function readCameraPermission(): Promise<CameraPermission> {
  // Kamera hanya tersedia di secure context (https / localhost).
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unavailable"
  // Permissions API tidak ada di semua browser (mis. Safari) — anggap boleh,
  // izinnya akan diminta saat kamera dinyalakan.
  if (!navigator.permissions?.query) return "ok"
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName })
    return status.state === "denied" ? "denied" : "ok"
  } catch {
    return "ok"
  }
}

/** Panduan mengaktifkan izin kamera: nama perangkat/browser + langkahnya. */
type CameraGuide = {
  /** Judul panduan, mis. "Chrome (Android)". */
  device: string
  /** Langkah berurutan — ditampilkan sebagai daftar bernomor. */
  steps: string[]
  /** Catatan tambahan, mis. izin tingkat sistem operasi. */
  note?: string
}

/**
 * Panduan izin kamera SESUAI browser & perangkat. Sengaja berupa langkah manual:
 * halaman setelan internal browser (chrome://, edge://, about:) tidak boleh
 * dibuka lewat skrip, jadi pengguna harus menempuhnya sendiri.
 */
function cameraGuide(): CameraGuide {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isSamsung = /SamsungBrowser/i.test(ua)
  const isEdge = /Edg[A-Z]?\//.test(ua)
  const isFirefox = /Firefox\/|FxiOS/i.test(ua)
  const isChromeIOS = /CriOS/i.test(ua)
  const reload = "Muat ulang halaman ini, lalu coba scan lagi."

  // ——— iOS: izin kamera diatur per APLIKASI di Setelan iOS ———
  if (isIOS) {
    if (isChromeIOS || isEdge || isFirefox) {
      const app = isChromeIOS ? "Chrome" : isEdge ? "Edge" : "Firefox"
      return {
        device: `${app} (iPhone/iPad)`,
        steps: [
          "Buka aplikasi Setelan (Settings) iPhone/iPad.",
          `Gulir ke bawah, ketuk ${app}.`,
          "Aktifkan sakelar Kamera.",
          reload,
        ],
      }
    }
    return {
      device: "Safari (iPhone/iPad)",
      steps: [
        'Ketuk ikon "aA" di sebelah kiri bilah alamat.',
        'Ketuk "Setelan Situs Web" (Website Settings).',
        'Ubah Kamera menjadi "Izinkan" (Allow).',
        reload,
      ],
      note: 'Bila Kamera tidak muncul di situ: Setelan iOS → Safari → Kamera → pilih "Tanya" atau "Izinkan".',
    }
  }

  // ——— Android: izin SITUS di browser + izin APLIKASI di Setelan Android ———
  if (isAndroid) {
    const app = isSamsung ? "Samsung Internet" : isEdge ? "Edge" : isFirefox ? "Firefox" : "Chrome"
    const osNote = `Bila masih gagal, aktifkan izin kamera aplikasinya: Setelan Android → Aplikasi → ${app} → Izin → Kamera → Izinkan.`

    if (isFirefox) {
      return {
        device: "Firefox (Android)",
        steps: [
          "Ketuk ikon gembok di sebelah kiri alamat situs.",
          'Ketuk "Izin" (Permissions) → Kamera.',
          'Pilih "Izinkan".',
          reload,
        ],
        note: osNote,
      }
    }
    if (isSamsung) {
      return {
        device: "Samsung Internet (Android)",
        steps: [
          "Ketuk ikon gembok di sebelah kiri alamat situs.",
          'Ketuk "Izin" → Kamera.',
          'Pilih "Izinkan".',
          reload,
        ],
        note: osNote,
      }
    }
    return {
      device: `${app} (Android)`,
      steps: [
        "Ketuk ikon gembok / ikon setelan (⚙) di sebelah kiri alamat situs.",
        'Ketuk "Izin" (Permissions), lalu pilih Kamera.',
        'Pilih "Izinkan".',
        reload,
      ],
      note: `${osNote} Lewat menu titik tiga (⋮) juga bisa: ⋮ → Setelan → Setelan situs → Kamera → cari situs ini → Izinkan.`,
    }
  }

  // ——— Desktop ———
  if (isEdge) {
    return {
      device: "Edge (Komputer)",
      steps: [
        "Klik ikon gembok di sebelah kiri alamat situs.",
        'Klik "Izin untuk situs ini".',
        'Ubah Kamera menjadi "Izinkan".',
        reload,
      ],
      note: "Lewat menu titik tiga (…) di kanan atas: … → Setelan → Cookie dan izin situs → Kamera → cari situs ini → Izinkan.",
    }
  }
  if (isFirefox) {
    return {
      device: "Firefox (Komputer)",
      steps: [
        "Klik ikon gembok di sebelah kiri alamat situs.",
        'Pada baris "Menggunakan Kamera — Diblokir", klik tanda silang (×) untuk menghapus blokirnya.',
        reload,
        "Saat Firefox bertanya, pilih Izinkan.",
      ],
      note: "Lewat menu garis tiga (☰) di kanan atas: ☰ → Pengaturan → Privasi & Keamanan → Izin → Kamera → Pengaturan → hapus situs ini dari daftar blokir.",
    }
  }
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    return {
      device: "Safari (Mac)",
      steps: [
        "Buka menu Safari → Pengaturan (Settings) di kiri atas layar.",
        'Pilih tab "Situs Web" (Websites), lalu pilih Kamera di daftar kiri.',
        'Setel situs ini menjadi "Izinkan" (Allow).',
        reload,
      ],
    }
  }
  return {
    device: "Chrome (Komputer)",
    steps: [
      "Klik ikon gembok / ikon penggeser (⚙) di sebelah kiri alamat situs.",
      'Klik "Setelan situs" (Site settings).',
      'Pada bagian Kamera, pilih "Izinkan".',
      reload,
    ],
    note: "Lewat menu titik tiga (⋮) di kanan atas: ⋮ → Setelan → Privasi dan keamanan → Setelan situs → Kamera → cari situs ini → Izinkan.",
  }
}

type RackPickerModalProps = {
  open: boolean
  onClose: () => void
  /** Daftar rak dari Master Rak. */
  racks: RackOption[]
  /** Animasi loading saat daftar rak masih dimuat. */
  loading?: boolean
  /** Rak yang sedang terpilih (ditandai centang pada daftar). */
  value?: string
  /** Konteks tujuan pengisian rak — mis. nama paket/instrumen. */
  target?: string | null
  /** Dipanggil dengan nama rak terpilih (hasil scan atau pilih manual). */
  onSelect: (rackName: string) => void
  title?: string
}

/**
 * Modal pemilih lokasi rak dengan dua cara: SCAN QR rak pakai kamera, atau PILIH
 * manual dari daftar Master Rak. Hasil scan dicocokkan (case-insensitive) ke nama
 * rak; bila tak dikenal, pesan kesalahan tampil dan pengguna bisa memilih manual.
 */
export function RackPickerModal({ open, ...props }: RackPickerModalProps) {
  // Isi modal hanya dirender saat terbuka → state internal (mode/pencarian/scanner)
  // selalu segar tiap kali dibuka, tanpa perlu efek reset.
  if (!open) return null
  return <RackPicker {...props} />
}

function RackPicker({
  onClose,
  racks,
  loading = false,
  value,
  target,
  onSelect,
  title = "Pilih Rak",
}: Omit<RackPickerModalProps, "open">) {
  // "menu" = dua pilihan cara; "list" = daftar rak untuk pilih manual.
  const [mode, setMode] = useState<"menu" | "list">("menu")
  const [scannerOpen, setScannerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  // Izin kamera browser: "checking" saat masih diperiksa, "blocked" bila ditolak
  // atau kamera tidak tersedia (halaman non-https) → opsi scan dimatikan.
  const [camera, setCamera] = useState<"checking" | "ready" | "blocked">("checking")
  const [cameraNote, setCameraNote] = useState<string | null>(null)
  // `denied` = izin DIBLOKIR permanen untuk situs ini. Pada keadaan ini browser
  // tidak akan memunculkan dialog izin lagi walau getUserMedia dipanggil, jadi
  // satu-satunya jalan adalah mengubahnya lewat setelan browser.
  const [denied, setDenied] = useState(false)
  const guide = cameraGuide()

  /** Terapkan hasil pembacaan izin ke tampilan. */
  const applyPermission = useCallback((state: CameraPermission) => {
    setDenied(state === "denied")
    setCamera(state === "ok" ? "ready" : "blocked")
    setCameraNote(
      state === "ok"
        ? null
        : state === "denied"
          ? "Izin kamera diblokir untuk situs ini."
          : "Kamera tidak tersedia di browser ini. Buka halaman lewat https atau localhost.",
    )
  }, [])

  // Periksa izin saat modal dibuka + ikuti perubahannya (pengguna bisa mengubah
  // izin dari setelan browser tanpa memuat ulang halaman).
  useEffect(() => {
    let alive = true
    let status: PermissionStatus | null = null

    void (async () => {
      const state = await readCameraPermission()
      if (!alive) return
      applyPermission(state)
      try {
        status = (await navigator.permissions?.query({ name: "camera" as PermissionName })) ?? null
        if (!alive || !status) return
        status.onchange = () => {
          void readCameraPermission().then((s) => alive && applyPermission(s))
        }
      } catch {
        // Browser tidak mendukung query 'camera' — cukup andalkan pemeriksaan awal.
      }
    })()

    return () => {
      alive = false
      if (status) status.onchange = null
    }
  }, [applyPermission])

  /**
   * Buka kamera pemindai. Izin diminta lebih dulu lewat getUserMedia supaya
   * penolakan izin ketahuan di sini (pesan jelas), bukan berupa kamera hitam.
   */
  async function openScanner() {
    setError(null)
    if (camera === "blocked") return
    await requestCamera()
  }

  /**
   * Minta izin kamera. Hanya berguna saat izinnya masih "prompt" (browser
   * memunculkan dialog izin). Bila sudah diblokir permanen, permintaan ditolak
   * seketika TANPA dialog — karena itu tombolnya disembunyikan pada keadaan itu.
   */
  async function requestCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      // Hentikan segera — pemindai akan membuka streamnya sendiri.
      stream.getTracks().forEach((t) => t.stop())
      setDenied(false)
      setCamera("ready")
      setCameraNote(null)
      setScannerOpen(true)
    } catch (e) {
      const name = (e as { name?: string })?.name
      setCamera("blocked")
      if (name === "NotAllowedError" || name === "SecurityError") {
        setDenied(true)
        setCameraNote("Izin kamera ditolak untuk situs ini.")
      } else if (name === "NotFoundError") {
        setDenied(false)
        setCameraNote("Kamera tidak ditemukan di perangkat ini. Pilih rak manual dari daftar.")
      } else {
        setDenied(false)
        setCameraNote("Kamera tidak bisa dibuka. Pilih rak manual dari daftar.")
      }
    }
  }

  const filtered = query
    ? racks.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    : racks

  function choose(name: string) {
    onSelect(name)
    onClose()
  }

  // Hasil baca QR → cocokkan ke nama rak di Master Rak.
  function handleScan(raw: string) {
    const text = raw.trim()
    if (!text) return
    const match = racks.find((r) => r.name.toLowerCase() === text.toLowerCase())
    if (!match) {
      setError(`Rak "${text}" tidak ditemukan di Master Rak. Pilih manual dari daftar.`)
      setMode("list")
      return
    }
    choose(match.name)
  }

  return (
    <>
      <Modal open onClose={onClose} title={title} size="md">
        <div className="space-y-3">
          {target && (
            <p className="text-sm text-gray-500">
              Rak untuk <span className="font-medium text-gray-800">{target}</span>
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}
          {/* Izin kamera belum aktif → alasan + langkah mengaktifkannya sesuai
              browser & perangkat yang sedang dipakai. */}
          {camera === "blocked" && cameraNote && (
            <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-medium text-amber-800">{cameraNote}</p>
              {denied && (
                <>
                  <p className="text-xs font-medium text-amber-800">
                    Cara mengaktifkan di {guide.device}:
                  </p>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-amber-700">
                    {guide.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {guide.note && <p className="text-xs text-amber-700">{guide.note}</p>}
                </>
              )}
              {/* Dialog izin hanya muncul bila izinnya belum diblokir permanen. */}
              {!denied && (
                <Button type="button" size="sm" variant="outline" onClick={requestCamera}>
                  <Camera className="h-4 w-4" />
                  Aktifkan Izin Kamera
                </Button>
              )}
            </div>
          )}

          {mode === "menu" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Scan hanya bisa dipakai bila izin kamera browser aktif. */}
              <button
                type="button"
                onClick={openScanner}
                disabled={camera !== "ready"}
                className={
                  "flex flex-col items-center gap-2 rounded-lg border px-4 py-6 text-center transition-colors " +
                  (camera === "ready"
                    ? "border-gray-200 hover:border-[#075489] hover:bg-[#075489]/5"
                    : "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60")
                }
              >
                {camera === "blocked" ? (
                  <CameraOff className="h-7 w-7 text-gray-400" />
                ) : (
                  <ScanLine className="h-7 w-7 text-[#075489]" />
                )}
                <span className="text-sm font-medium text-gray-800">Scan QR Rak</span>
                <span className="text-xs text-gray-500">
                  {camera === "checking"
                    ? "Memeriksa izin kamera..."
                    : camera === "blocked"
                      ? "Izin kamera belum aktif"
                      : "Arahkan kamera ke label rak"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setMode("list")
                }}
                className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 px-4 py-6 text-center transition-colors hover:border-[#075489] hover:bg-[#075489]/5"
              >
                <List className="h-7 w-7 text-[#075489]" />
                <span className="text-sm font-medium text-gray-800">Pilih dari Daftar</span>
                <span className="text-xs text-gray-500">Cari rak di Master Rak</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  autoFocus
                  placeholder="Cari rak..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {loading ? (
                  <li className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat data...
                  </li>
                ) : filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-gray-400">Rak tidak ditemukan.</li>
                ) : (
                  filtered.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => choose(r.name)}
                        className={cn(
                          "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors",
                          r.name === value
                            ? "bg-[#075489]/8 font-medium text-[#075489]"
                            : "text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        <span className="truncate">{r.name}</span>
                        {r.name === value && <Check className="h-4 w-4" />}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <button
                type="button"
                onClick={() => setMode("menu")}
                className="text-xs font-medium text-[#075489] hover:underline"
              >
                ← Kembali ke pilihan cara
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Kamera scan QR rak — dirender setelah modal pemilih agar tampil di atasnya. */}
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Scan QR Rak"
        hint="Arahkan kamera ke QR label rak."
      />
    </>
  )
}

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
  const reload = "Reload this page, then try scanning again."

  // ——— iOS: izin kamera diatur per APLIKASI di Setelan iOS ———
  if (isIOS) {
    if (isChromeIOS || isEdge || isFirefox) {
      const app = isChromeIOS ? "Chrome" : isEdge ? "Edge" : "Firefox"
      return {
        device: `${app} (iPhone/iPad)`,
        steps: [
          "Open the Settings app on your iPhone/iPad.",
          `Scroll down and tap ${app}.`,
          "Turn on the Camera switch.",
          reload,
        ],
      }
    }
    return {
      device: "Safari (iPhone/iPad)",
      steps: [
        'Tap the "aA" icon on the left of the address bar.',
        'Tap "Website Settings".',
        'Set Camera to "Allow".',
        reload,
      ],
      note: 'If Camera is not listed there: iOS Settings → Safari → Camera → choose "Ask" or "Allow".',
    }
  }

  // ——— Android: izin SITUS di browser + izin APLIKASI di Setelan Android ———
  if (isAndroid) {
    const app = isSamsung ? "Samsung Internet" : isEdge ? "Edge" : isFirefox ? "Firefox" : "Chrome"
    const osNote = `If it still fails, grant the app camera permission: Android Settings → Apps → ${app} → Permissions → Camera → Allow.`

    if (isFirefox) {
      return {
        device: "Firefox (Android)",
        steps: [
          "Tap the padlock icon on the left of the site address.",
          'Tap "Permissions" → Camera.',
          'Choose "Allow".',
          reload,
        ],
        note: osNote,
      }
    }
    if (isSamsung) {
      return {
        device: "Samsung Internet (Android)",
        steps: [
          "Tap the padlock icon on the left of the site address.",
          'Tap "Permissions" → Camera.',
          'Choose "Allow".',
          reload,
        ],
        note: osNote,
      }
    }
    return {
      device: `${app} (Android)`,
      steps: [
        "Tap the padlock / settings (⚙) icon on the left of the site address.",
        'Tap "Permissions", then choose Camera.',
        'Choose "Allow".',
        reload,
      ],
      note: `${osNote} You can also use the three-dot menu (⋮): ⋮ → Settings → Site settings → Camera → find this site → Allow.`,
    }
  }

  // ——— Desktop ———
  if (isEdge) {
    return {
      device: "Edge (Desktop)",
      steps: [
        "Click the padlock icon on the left of the site address.",
        'Click "Permissions for this site".',
        'Set Camera to "Allow".',
        reload,
      ],
      note: "Or use the three-dot menu (…) at the top right: … → Settings → Cookies and site permissions → Camera → find this site → Allow.",
    }
  }
  if (isFirefox) {
    return {
      device: "Firefox (Desktop)",
      steps: [
        "Click the padlock icon on the left of the site address.",
        'On the "Use the Camera — Blocked" row, click the cross (×) to clear the block.',
        reload,
        "When Firefox asks, choose Allow.",
      ],
      note: "Or use the hamburger menu (☰) at the top right: ☰ → Settings → Privacy & Security → Permissions → Camera → Settings → remove this site from the block list.",
    }
  }
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    return {
      device: "Safari (Mac)",
      steps: [
        "Open the Safari menu → Settings at the top left of the screen.",
        'Select the "Websites" tab, then choose Camera in the left list.',
        'Set this site to "Allow".',
        reload,
      ],
    }
  }
  return {
    device: "Chrome (Desktop)",
    steps: [
      "Click the padlock / sliders (⚙) icon on the left of the site address.",
      'Click "Site settings".',
      'Under Camera, choose "Allow".',
      reload,
    ],
    note: "Or use the three-dot menu (⋮) at the top right: ⋮ → Settings → Privacy and security → Site settings → Camera → find this site → Allow.",
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
  title = "Pick Rack",
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
  // Alasan kamera tak bisa dipakai — menentukan apa yang ditawarkan ke pengguna:
  //   denied      → izin DIBLOKIR permanen untuk situs ini; browser tak akan
  //                 memunculkan dialog izin lagi, jadi tampilkan panduan setelan.
  //   unavailable → halaman bukan secure context (http non-localhost), API kamera
  //                 tidak ada sama sekali. Tak ada yang bisa dilakukan dari sini.
  //   notfound    → tidak ada kamera di perangkat.
  //   error       → kegagalan lain; boleh dicoba ulang.
  const [blockReason, setBlockReason] = useState<"denied" | "unavailable" | "notfound" | "error" | null>(null)
  const guide = cameraGuide()

  /** Terapkan hasil pembacaan izin ke tampilan. */
  const applyPermission = useCallback((state: CameraPermission) => {
    setBlockReason(state === "ok" ? null : state)
    setCamera(state === "ok" ? "ready" : "blocked")
    setCameraNote(
      state === "ok"
        ? null
        : state === "denied"
          ? "Camera permission is blocked for this site."
          : "The camera is unavailable because this page was opened over http. Open it over https (or localhost) to use the camera — granting permission in your phone settings will not help.",
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
    // Di halaman non-secure `navigator.mediaDevices` tidak ada sama sekali —
    // memanggilnya melempar TypeError dan pesan penyebab aslinya (http) tertimpa
    // pesan galat umum. Hentikan di sini supaya diagnosisnya tetap benar.
    if (!navigator.mediaDevices?.getUserMedia) {
      applyPermission("unavailable")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      // Hentikan segera — pemindai akan membuka streamnya sendiri.
      stream.getTracks().forEach((t) => t.stop())
      setBlockReason(null)
      setCamera("ready")
      setCameraNote(null)
      setScannerOpen(true)
    } catch (e) {
      const name = (e as { name?: string })?.name
      setCamera("blocked")
      if (name === "NotAllowedError" || name === "SecurityError") {
        setBlockReason("denied")
        setCameraNote("Camera permission was denied for this site.")
      } else if (name === "NotFoundError") {
        setBlockReason("notfound")
        setCameraNote("No camera found on this device. Pick a rack manually from the list.")
      } else {
        setBlockReason("error")
        setCameraNote("The camera could not be opened. Pick a rack manually from the list.")
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
      setError(`Rack "${text}" was not found in Master Rack. Pick one manually from the list.`)
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
              Rack for <span className="font-medium text-gray-800">{target}</span>
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
              {blockReason === "denied" && (
                <>
                  <p className="text-xs font-medium text-amber-800">
                    How to enable it on {guide.device}:
                  </p>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-amber-700">
                    {guide.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  {guide.note && <p className="text-xs text-amber-700">{guide.note}</p>}
                </>
              )}
              {/* Tombol coba lagi HANYA untuk kegagalan yang memang bisa berubah.
                  Pada `denied` dialog izin tak akan muncul lagi, pada `unavailable`
                  API kameranya tidak ada, pada `notfound` perangkatnya tak punya
                  kamera — menawarkan tombol di situ cuma menyesatkan. */}
              {blockReason === "error" && (
                <Button type="button" size="sm" variant="outline" onClick={requestCamera}>
                  <Camera className="h-4 w-4" />
                  Try Again
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
                <span className="text-sm font-medium text-gray-800">Scan Rack QR</span>
                <span className="text-xs text-gray-500">
                  {camera === "checking"
                    ? "Checking camera permission..."
                    : camera === "blocked"
                      ? blockReason === "unavailable"
                        ? "Requires https"
                        : blockReason === "notfound"
                          ? "No camera"
                          : "Camera permission not granted"
                      : "Point the camera at the rack label"}
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
                <span className="text-sm font-medium text-gray-800">Choose from List</span>
                <span className="text-xs text-gray-500">Search racks in Master Rack</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  autoFocus
                  placeholder="Search rack..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                {loading ? (
                  <li className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading data...
                  </li>
                ) : filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-gray-400">No rack found.</li>
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
                ← Back to the options
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
        title="Scan Rack QR"
        hint="Point the camera at the rack label QR."
      />
    </>
  )
}

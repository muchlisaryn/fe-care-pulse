"use client"

import type { ReactNode } from "react"
import { Check, Sparkle, X } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/molecules/Modal"

type ResultVariant = "success" | "error"

type ResultDialogProps = {
  open: boolean
  onClose: () => void
  variant: ResultVariant
  title?: string
  description?: ReactNode
  // Teks tombol penutup — default "Selesai" (berhasil) / "Tutup" (gagal).
  actionLabel?: string
  /**
   * Detik sebelum dialog menutup sendiri. Default: 5 detik untuk hasil berhasil,
   * dan TIDAK menutup sendiri untuk hasil gagal (pesan error perlu dibaca dulu).
   * Isi 0 untuk mematikan tutup-otomatis.
   */
  autoCloseSeconds?: number
}

/**
 * Tampilan per hasil: judul & tombol default, warna lingkaran ikon (gradien),
 * lingkaran-lingkaran latar (halo), aksen hiasan, tombol, dan bilah waktu.
 */
const VARIANT: Record<
  ResultVariant,
  {
    title: string
    action: string
    icon: ReactNode
    badge: string
    halo: string
    haloSoft: string
    dot: string
    ring: string
    sparkle: string
    button: string
    timer: string
  }
> = {
  // Warna hasil berhasil memakai hijau/teal brand `#4ba69d` — warna yang sama
  // dengan avatar pengguna di Header. Semua nuansa di bawah diturunkan dari
  // warna itu (gradien sedikit lebih terang ke lebih gelap, sisanya transparansi).
  success: {
    title: "Berhasil",
    action: "Selesai",
    icon: <Check className="h-14 w-14 text-white" strokeWidth={3} />,
    badge: "bg-gradient-to-br from-[#5cb5ac] to-[#3f8f87] shadow-lg shadow-[#4ba69d]/35",
    halo: "bg-[#4ba69d]/15",
    haloSoft: "bg-[#4ba69d]/8",
    dot: "bg-[#4ba69d]/50",
    ring: "border-[#4ba69d]/30",
    sparkle: "text-[#4ba69d]/60",
    button: "bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white",
    timer: "bg-[#4ba69d]/50",
  },
  error: {
    title: "Gagal",
    action: "Tutup",
    icon: <X className="h-14 w-14 text-white" strokeWidth={3} />,
    badge: "bg-gradient-to-br from-rose-400 to-rose-600 shadow-lg shadow-rose-500/30",
    halo: "bg-rose-100/70",
    haloSoft: "bg-rose-50",
    dot: "bg-rose-400",
    ring: "border-rose-200",
    sparkle: "text-rose-400",
    button: "bg-rose-600 hover:bg-rose-700 text-white",
    timer: "bg-rose-500/50",
  },
}

/**
 * Popup hasil aksi (berhasil / gagal) — dipakai setelah simpan, hapus, atau aksi
 * lain yang memanggil API, agar pengguna tahu hasilnya dan tidak menebak-nebak.
 *
 * Bentuknya kartu bersudut besar: ilustrasi lingkaran bergradien dengan ikon
 * besar di tengah, judul tebal, penjelasan singkat, lalu satu tombol selebar
 * kartu. Bilah tipis di dasar kartu menunjukkan sisa waktu sebelum menutup
 * sendiri — dan berhenti selama kartu disorot, jadi pesannya bisa ditahan.
 */
export function ResultDialog({
  open,
  onClose,
  variant,
  title,
  description,
  actionLabel,
  autoCloseSeconds,
}: ResultDialogProps) {
  const v = VARIANT[variant]
  const heading = title ?? v.title
  const seconds = autoCloseSeconds ?? (variant === "success" ? 5 : 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading}
      size="sm"
      hideHeader
      panelClassName="rounded-3xl"
      bodyClassName="px-6 py-8 sm:px-8"
    >
      <div
        key={variant}
        className="group flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Ilustrasi: lingkaran ikon bergradien dengan halo dan hiasan kecil di
            sekelilingnya. Semua hiasan murni dekoratif — disembunyikan dari
            pembaca layar lewat aria-hidden pada pembungkusnya. */}
        <div aria-hidden className="relative flex h-44 w-44 items-center justify-center">
          <span
            className={"absolute left-2 top-3 h-28 w-28 rounded-full " + v.haloSoft}
          />
          <span
            className={"absolute bottom-5 right-1 h-24 w-24 rounded-full " + v.haloSoft}
          />
          <span className={"absolute h-32 w-32 rounded-full " + v.halo} />

          <span className={"absolute left-6 top-2 h-4 w-4 rounded-full " + v.haloSoft} />
          <span className={"absolute left-3 top-9 h-2 w-2 rounded-full " + v.dot} />
          <span className={"absolute bottom-9 left-4 h-3 w-3 rounded-full " + v.dot} />
          <span
            className={"absolute bottom-6 right-8 h-4 w-4 rounded-full border-2 " + v.ring}
          />
          <Sparkle className={"absolute right-5 top-6 h-6 w-6 " + v.sparkle} />

          <span
            className={
              "relative flex h-24 w-24 items-center justify-center rounded-full " + v.badge
            }
          >
            {v.icon}
          </span>
        </div>

        <p className="mt-2 text-2xl font-bold text-gray-900">{heading}</p>
        {description && (
          <p className="mt-2 max-w-xs text-sm text-gray-500">{description}</p>
        )}

        <Button
          onClick={onClose}
          className={"mt-7 h-12 w-full rounded-xl text-base font-semibold " + v.button}
        >
          {actionLabel ?? v.action}
        </Button>

        {/* Sisa waktu tutup-otomatis — berhenti saat kartu disorot / difokus,
            dan dialog menutup tepat saat bilahnya habis. */}
        {seconds > 0 && (
          <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={
                "h-full w-full animate-result-timer group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] " +
                v.timer
              }
              style={{ animationDuration: `${seconds}s` }}
              onAnimationEnd={onClose}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { localeOf, useLanguage } from "@/lib/i18n"

/**
 * Kalender pemilih periode: satu TANGGAL, atau satu BULAN penuh.
 *
 * Nilainya satu string dan panjangnya yang menentukan artinya — "2026-08"
 * berarti sebulan penuh, "2026-08-14" berarti satu hari itu saja. Dijadikan
 * satu isian, bukan dua (bulan + tanggal), karena keduanya menjawab pertanyaan
 * yang sama ("periode mana yang dilihat") dan dua isian yang bisa berselisih
 * hanya melahirkan keadaan tak masuk akal seperti bulan Agustus dengan tanggal
 * 3 September.
 *
 * Menggantikan `<input type="month">`, yang tampilannya ditentukan peramban
 * masing-masing: di Firefox ia cuma kotak teks "YYYY-MM" tanpa pemilih apa pun,
 * dan di Chrome pemilihnya kecil serta harus di-scroll setahun demi setahun.
 * Laporan yang datanya berjalan sejak 2014 dibaca dengan melompat antar tahun,
 * dan lompatan itu yang dibuat murah di sini.
 */

type PeriodPickerProps = {
  /** "" (belum dipilih), "YYYY-MM" (sebulan), atau "YYYY-MM-DD" (satu hari). */
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  className?: string
  placeholder?: string
}

type Pecahan = { tahun: number; bulan: number; hari: number | null }

/** "YYYY-MM" / "YYYY-MM-DD" → bagiannya, atau null bila bukan salah satunya. */
function pecah(value: string): Pecahan | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
  if (!m) return null
  const bulan = Number(m[2])
  if (bulan < 1 || bulan > 12) return null
  return { tahun: Number(m[1]), bulan, hari: m[3] ? Number(m[3]) : null }
}

const pad = (n: number) => String(n).padStart(2, "0")
const kunciBulan = (tahun: number, bulan: number) => `${tahun}-${pad(bulan)}`
const kunciHari = (tahun: number, bulan: number, hari: number) =>
  `${tahun}-${pad(bulan)}-${pad(hari)}`

/** Jumlah hari dalam sebulan (hari ke-0 bulan berikutnya = hari terakhir). */
function jumlahHari(tahun: number, bulan: number): number {
  return new Date(tahun, bulan, 0).getDate()
}

/**
 * Berapa kolom kosong sebelum tanggal 1 — pekan dimulai SENIN.
 *
 * `getDay()` menomori Minggu = 0; digeser agar Senin jatuh di kolom pertama,
 * mengikuti penanggalan yang dipakai di Indonesia.
 */
function geserAwal(tahun: number, bulan: number): number {
  return (new Date(tahun, bulan - 1, 1).getDay() + 6) % 7
}

export function PeriodPicker({
  value,
  onChange,
  id,
  disabled = false,
  className,
  placeholder,
}: PeriodPickerProps) {
  const { t, lang } = useLanguage()
  const locale = localeOf(lang)

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  // Bulan yang sedang DITAMPILKAN petaknya — belum tentu yang terpilih: menengok
  // bulan lain lewat panah tidak boleh mengubah nilai apa pun sebelum diklik.
  //
  // Berangkat kosong dan baru diisi saat dibuka, bukan dari `new Date()` di
  // render: nilai berbasis jam pada render pertama berbeda antara server dan
  // peramban, dan selisih itu merusak hidrasi.
  const [lihat, setLihat] = useState<{ tahun: number; bulan: number } | null>(null)
  // Petak bulan (untuk lompat antar bulan/tahun) menggantikan petak tanggal.
  const [pilihBulan, setPilihBulan] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const terpilih = pecah(value)

  const namaBulan = (bulan: number, panjang: "long" | "short") =>
    new Date(2000, bulan - 1, 1).toLocaleDateString(locale, { month: panjang })

  const label = !terpilih
    ? (placeholder ?? t("common.selectPeriod"))
    : terpilih.hari
      ? new Date(terpilih.tahun, terpilih.bulan - 1, terpilih.hari).toLocaleDateString(locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : `${namaBulan(terpilih.bulan, "long")} ${terpilih.tahun}`

  function hitungPos() {
    if (!triggerRef.current) return null
    const r = triggerRef.current.getBoundingClientRect()
    const lebar = Math.max(r.width, 280)
    const margin = 8
    return {
      top: r.bottom + 4,
      // Ditahan di dalam viewport: pada layar sempit, petak yang lebih lebar
      // dari pemicunya akan menggantung keluar layar bila dipatok ke kiri saja.
      left: Math.min(Math.max(margin, r.left), window.innerWidth - lebar - margin),
      width: lebar,
    }
  }

  function buka() {
    if (disabled) return
    const p = hitungPos()
    if (!p) return
    const kini = new Date()
    setPos(p)
    setLihat(
      terpilih
        ? { tahun: terpilih.tahun, bulan: terpilih.bulan }
        : { tahun: kini.getFullYear(), bulan: kini.getMonth() + 1 },
    )
    setPilihBulan(false)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return

    function tutupDiLuar(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (document.getElementById("period-picker-panel")?.contains(e.target as Node)) return
      setOpen(false)
    }
    function tombol(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    function reposisi() {
      setPos(hitungPos())
    }

    document.addEventListener("mousedown", tutupDiLuar)
    document.addEventListener("keydown", tombol)
    window.addEventListener("scroll", reposisi, true)
    window.addEventListener("resize", reposisi)
    return () => {
      document.removeEventListener("mousedown", tutupDiLuar)
      document.removeEventListener("keydown", tombol)
      window.removeEventListener("scroll", reposisi, true)
      window.removeEventListener("resize", reposisi)
    }
  }, [open])

  function terapkan(nilai: string) {
    onChange(nilai)
    setOpen(false)
  }

  /** Geser bulan yang ditampilkan, ikut berpindah tahun di Januari/Desember. */
  function geserBulan(arah: -1 | 1) {
    setLihat((v) => {
      if (!v) return v
      const bulan = v.bulan + arah
      if (bulan < 1) return { tahun: v.tahun - 1, bulan: 12 }
      if (bulan > 12) return { tahun: v.tahun + 1, bulan: 1 }
      return { tahun: v.tahun, bulan }
    })
  }

  // Nama hari diambil dari locale, bukan daftar yang ditulis sendiri, supaya
  // ikut berganti bersama bahasa. Pekan rujukannya sengaja dimulai Senin.
  const namaHari = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "narrow" }),
  )

  const kini = new Date()
  const hariIni = kunciHari(kini.getFullYear(), kini.getMonth() + 1, kini.getDate())

  const petak =
    open && pos && lihat ? (
      <div
        id="period-picker-panel"
        style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
      >
        <div className="flex items-center justify-between gap-1 px-1 pb-2">
          <button
            type="button"
            aria-label={pilihBulan ? t("common.prevYear") : t("common.prevMonth")}
            onClick={() =>
              pilihBulan ? setLihat((v) => v && { ...v, tahun: v.tahun - 1 }) : geserBulan(-1)
            }
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Judulnya sekaligus tombol: menekannya membuka petak bulan, jalan
              tercepat melompat ke tahun lain tanpa menekan panah berkali-kali. */}
          <button
            type="button"
            onClick={() => setPilihBulan((v) => !v)}
            className="flex-1 truncate rounded-md px-2 py-1 text-sm font-semibold capitalize text-gray-800 transition-colors hover:bg-gray-100"
          >
            {pilihBulan ? lihat.tahun : `${namaBulan(lihat.bulan, "long")} ${lihat.tahun}`}
          </button>

          <button
            type="button"
            aria-label={pilihBulan ? t("common.nextYear") : t("common.nextMonth")}
            onClick={() =>
              pilihBulan ? setLihat((v) => v && { ...v, tahun: v.tahun + 1 }) : geserBulan(1)
            }
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {pilihBulan ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((bulan) => {
              const aktif = terpilih?.tahun === lihat.tahun && terpilih.bulan === bulan
              return (
                <button
                  key={bulan}
                  type="button"
                  onClick={() => terapkan(kunciBulan(lihat.tahun, bulan))}
                  className={cn(
                    "rounded-md px-2 py-2 text-sm capitalize transition-colors",
                    aktif ? "bg-[#075489] font-medium text-white" : "text-gray-700 hover:bg-gray-100",
                  )}
                >
                  {namaBulan(bulan, "short")}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-0.5 pb-1">
              {namaHari.map((h, i) => (
                <span
                  key={i}
                  className="text-center text-[11px] font-semibold uppercase text-gray-400"
                >
                  {h}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: geserAwal(lihat.tahun, lihat.bulan) }, (_, i) => (
                <span key={`kosong-${i}`} />
              ))}

              {Array.from({ length: jumlahHari(lihat.tahun, lihat.bulan) }, (_, i) => {
                const hari = i + 1
                const kunci = kunciHari(lihat.tahun, lihat.bulan, hari)
                const aktif = value === kunci
                return (
                  <button
                    key={hari}
                    type="button"
                    onClick={() => terapkan(kunci)}
                    className={cn(
                      "rounded-md py-1.5 text-sm tabular-nums transition-colors",
                      aktif
                        ? "bg-[#075489] font-medium text-white"
                        : "text-gray-700 hover:bg-gray-100",
                      // Hari ini ditandai lingkaran tipis, bukan warna penuh —
                      // warna penuh sudah berarti "terpilih", dan dua arti pada
                      // satu tanda membuat keduanya tidak terbaca.
                      !aktif && kunci === hariIni && "ring-1 ring-[#4ba69d] ring-inset",
                    )}
                  >
                    {hari}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-2 flex gap-1">
          {/* Kembali ke sebulan penuh setelah sempat menyorot satu tanggal —
              tanpa ini, satu-satunya jalan pulang adalah petak bulan. */}
          <button
            type="button"
            onClick={() => terapkan(kunciBulan(lihat.tahun, lihat.bulan))}
            className="flex-1 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-800"
          >
            {t("common.wholeMonth")}
          </button>
          <button
            type="button"
            onClick={() => {
              const h = new Date()
              terapkan(kunciHari(h.getFullYear(), h.getMonth() + 1, h.getDate()))
            }}
            className="flex-1 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-800"
          >
            {t("common.today")}
          </button>
        </div>
      </div>
    ) : null

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : buka())}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm outline-none transition-colors",
          "focus:border-[#075489] focus:ring-2 focus:ring-[#075489]/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          terpilih ? "text-gray-900" : "text-gray-400",
          className,
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate capitalize">{label}</span>
      </button>

      {/* Tidak perlu penjaga "sudah mount": `open` hanya bisa menyala lewat klik,
          jadi petaknya tidak pernah ikut dirender di server dan tidak ada yang
          bisa berselisih saat hidrasi. */}
      {petak ? createPortal(petak, document.body) : null}
    </>
  )
}

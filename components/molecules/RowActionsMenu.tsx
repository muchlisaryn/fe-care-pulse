"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MoreVertical } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type RowActionItem = {
  label: string
  onClick: () => void
  icon?: React.ReactNode
  disabled?: boolean
  /** "danger" = merah, untuk aksi yang menghapus. */
  tone?: "default" | "danger"
}

/**
 * Aksi baris yang dilipat jadi satu tombol titik-tiga.
 *
 * Dipakai tabel yang aksinya lebih dari dua: deretan tombol per baris membuat
 * kolom Aksi lebih lebar daripada datanya sendiri, dan pada tabel yang sudah
 * bergeser mendatar tombolnya ikut terdorong keluar layar.
 *
 * Menunya dirender lewat PORTAL ke `document.body` dengan posisi `fixed`, bukan
 * absolut di dalam selnya: tabel dibungkus `overflow-x-auto`, dan panel yang
 * digambar di dalamnya akan terpotong di tepi bawah tabel.
 */
export function RowActionsMenu({
  items,
  disabled = false,
  align = "end",
}: {
  items: RowActionItem[]
  disabled?: boolean
  /** Sisi tombol yang dijadikan patokan tepi menu. */
  align?: "start" | "end"
}) {
  const t = useT()
  const [buka, setBuka] = useState(false)
  const [posisi, setPosisi] = useState<{ top: number; left: number } | null>(null)
  const tombolRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Posisi dihitung setelah menunya terpasang, jadi tingginya sudah terukur
  // saat menentukan buka ke atas atau ke bawah. Sampai hasilnya ada, menunya
  // `visibility: hidden` — bukan sempat digambar di pojok kiri atas.
  //
  // useEffect, bukan useLayoutEffect: yang kedua memicu peringatan React saat
  // halaman ini dirender di server, dan kedipannya sudah ditutup visibility.
  useEffect(() => {
    if (!buka) return

    function hitung() {
      const tombol = tombolRef.current
      if (!tombol) return
      const r = tombol.getBoundingClientRect()
      const tinggi = menuRef.current?.offsetHeight ?? 0
      const lebar = menuRef.current?.offsetWidth ?? 0
      const ruangBawah = window.innerHeight - r.bottom

      const top = ruangBawah < tinggi + 8 && r.top > tinggi + 8 ? r.top - tinggi - 4 : r.bottom + 4
      const kiri = align === "end" ? r.right - lebar : r.left
      // Jangan sampai keluar layar di sisi mana pun.
      const left = Math.min(Math.max(8, kiri), window.innerWidth - lebar - 8)

      setPosisi({ top, left })
    }

    hitung()

    // Menu berposisi `fixed`, jadi ia tidak ikut bergerak bersama halaman yang
    // digulung. Ditutup saja — mengejar posisinya sepanjang gulungan lebih
    // mahal dan tetap terasa meleset.
    function tutup() {
      setBuka(false)
    }
    window.addEventListener("scroll", tutup, true)
    window.addEventListener("resize", tutup)
    return () => {
      window.removeEventListener("scroll", tutup, true)
      window.removeEventListener("resize", tutup)
    }
  }, [buka, align])

  useEffect(() => {
    if (!buka) return

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBuka(false)
    }
    function onKlik(e: MouseEvent) {
      const sasaran = e.target as Node
      if (menuRef.current?.contains(sasaran) || tombolRef.current?.contains(sasaran)) return
      setBuka(false)
    }

    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onKlik)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onKlik)
    }
  }, [buka])

  if (items.length === 0) return null

  return (
    <>
      <Button
        ref={tombolRef}
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={buka}
        aria-label={t("common.actions")}
        title={t("common.actions")}
        onClick={() => setBuka((b) => !b)}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {buka &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              top: posisi?.top ?? 0,
              left: posisi?.left ?? 0,
              // Sebelum posisinya terhitung, menu disembunyikan — bukan
              // digambar di pojok kiri atas lebih dulu.
              visibility: posisi ? "visible" : "hidden",
            }}
            className="fixed z-50 min-w-[11rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setBuka(false)
                  item.onClick()
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  item.tone === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Printer, Settings, Circle, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppSelector } from "@/lib/store/hooks"

// Ikon untuk item sub-nav (dari kolom `icon` menu). Fallback: lingkaran kecil.
const ICON_MAP: Record<string, LucideIcon> = {
  printer: Printer,
  settings: Settings,
}
function iconFor(name?: string | null): LucideIcon {
  return (name && ICON_MAP[name]) || Circle
}

// Fallback bila menu belum termuat (mis. sebelum /auth/me selesai).
const FALLBACK_ITEMS = [{ name: "Master Printer", url: "/pengaturan/master-printer", icon: "printer" }]

export default function PengaturanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const menus = useAppSelector((s) => s.auth.menus)

  // Sidebar kedua dibangun dari ANAK menu "Pengaturan" (/pengaturan) di master —
  // jadi menambah/menghapus sub-halaman cukup lewat Master Menu (terintegrasi).
  const items = useMemo(() => {
    for (const section of menus ?? []) {
      for (const m of section.menus ?? []) {
        if (m.url === "/pengaturan" && m.menu && m.menu.length > 0) {
          return m.menu
            .filter((c) => !!c.url)
            .map((c) => ({ name: c.name, url: c.url as string, icon: c.icon ?? null }))
        }
      }
    }
    return FALLBACK_ITEMS
  }, [menus])

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Sidebar kedua: daftar menu Pengaturan — dipisah divider dari konten */}
      <aside className="w-full shrink-0 border-b border-gray-200 pb-4 lg:w-56 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
        <div className="lg:sticky lg:top-2">
          <p className="mb-2 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            <Settings className="h-3.5 w-3.5" />
            Pengaturan
          </p>
          <nav className="flex flex-col gap-1">
            {items.map((item) => {
              const active = pathname === item.url || pathname.startsWith(item.url + "/")
              const Icon = iconFor(item.icon)
              return (
                <Link
                  key={item.url}
                  href={item.url}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[#075489]/10 text-[#075489]"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Konten pengaturan terpilih */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

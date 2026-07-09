"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import {
  LayoutDashboard,
  Database,
  Shield,
  Menu as MenuIcon,
  Users,
  Settings,
  ClipboardList,
  List,
  Box,
  Activity,
  Monitor,
  Droplets,
  Warehouse,
  WashingMachine,
  Printer,
  ChevronRight,
  X,
  Circle,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Footer } from "@/components/molecules/Footer"
import { useAppSelector } from "@/lib/store/hooks"
import type { AuthMenuGroup } from "@/lib/store/slices/authSlice"

const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  database: Database,
  shield: Shield,
  menu: MenuIcon,
  users: Users,
  settings: Settings,
  "clipboard-list": ClipboardList,
  list: List,
  box: Box,
  activity: Activity,
  monitor: Monitor,
  droplets: Droplets,
  warehouse: Warehouse,
  "washing-machine": WashingMachine,
  printer: Printer,
}

function getIcon(name: string | null): LucideIcon {
  if (!name) return Circle
  return ICON_MAP[name] ?? Circle
}

// Some endpoints may return a section's `menus` as a single object instead of an
// array. Coerce to an array so the sidebar never crashes / blanks out.
function asArray<T>(v: T[] | T | null | undefined): T[] {
  if (Array.isArray(v)) return v
  if (v == null) return []
  return [v]
}

type SidebarProps = {
  className?: string
  collapsed?: boolean
  onExpand?: () => void
  onClose?: () => void
}

// URL menu yang menampilkan order masuk → tempat badge notifikasi.
const INCOMING_MENU_URL = "/cssd/monitoring"

function NotifBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function Sidebar({ className, collapsed = false, onExpand, onClose }: SidebarProps) {
  const pathname = usePathname()
  const rawMenus = useAppSelector((s) => s.auth.menus)
  const incomingCount = useAppSelector((s) => s.notif.incomingCount)

  // Badge untuk sebuah menu: bila menu (atau salah satu submenunya) mengarah ke
  // halaman order masuk, tampilkan jumlah order masuk.
  function menuBadge(menu: AuthMenuGroup): number {
    if (menu.url === INCOMING_MENU_URL) return incomingCount
    if (menu.menu?.some((sub) => sub.url === INCOMING_MENU_URL)) return incomingCount
    return 0
  }
  const sections = (Array.isArray(rawMenus) ? rawMenus : []).map((s) => ({
    ...s,
    menus: asArray(s.menus),
  }))

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})

  function isActivePath(path: string | null): boolean {
    if (!path) return false
    return pathname === path || pathname.startsWith(path + "/")
  }

  function isMenuActive(menu: AuthMenuGroup): boolean {
    return (
      isActivePath(menu.url) ||
      (menu.menu?.some((sub) => isActivePath(sub.url)) ?? false)
    )
  }

  useEffect(() => {
    const defaults: Record<string, boolean> = {}
    const activeKeys: string[] = []
    sections.forEach((section, i) => {
      const sectionKey = section.title_menu ?? `group-${i}`
      section.menus.forEach((menu) => {
        const key = `${sectionKey}::${menu.name}`
        // Seed default open state from is_open ("terbuka otomatis").
        defaults[key] = !!menu.is_open
        const active =
          isActivePath(menu.url) ||
          (menu.menu?.some((sub) => isActivePath(sub.url)) ?? false)
        if (active) activeKeys.push(key)
      })
    })
    setOpenMenus((prev) => {
      // Defaults fill any untouched menu; existing user toggles (prev) win;
      // the menu matching the current route is always forced open.
      const merged = { ...defaults, ...prev }
      activeKeys.forEach((k) => {
        merged[k] = true
      })
      return merged
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, rawMenus])

  // ── Collapsed tooltip ────────────────────────────────────────────────────────
  const [hoveredMenu, setHoveredMenu] = useState<AuthMenuGroup | null>(null)
  const [tooltipY, setTooltipY] = useState(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showTooltip(menu: AuthMenuGroup, e: React.MouseEvent<HTMLElement>) {
    if (!collapsed) return
    if (hideTimer.current) clearTimeout(hideTimer.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipY(rect.top)
    setHoveredMenu(menu)
  }

  function scheduleHide() {
    hideTimer.current = setTimeout(() => setHoveredMenu(null), 80)
  }

  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  function toggleMenu(key: string) {
    if (collapsed) {
      onExpand?.()
      return
    }
    setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Expanded rendering ───────────────────────────────────────────────────────
  function renderMenu(menu: AuthMenuGroup, sectionName: string) {
    const key = `${sectionName}::${menu.name}`
    const Icon = getIcon(menu.icon)
    // Menu induk yang punya URL sendiri tampil sebagai LINK langsung (anaknya
    // disembunyikan dari sidebar utama — dipakai untuk sidebar kedua, mis. Pengaturan).
    const hasSubs = !!(menu.menu && menu.menu.length > 0) && !menu.url
    const active = isMenuActive(menu)
    const isOpen = openMenus[key] ?? menu.is_open

    if (hasSubs) {
      return (
        <div key={key}>
          <button
            onClick={() => toggleMenu(key)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[#4ba69d]/15 text-[#4ba69d]"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <span className="flex items-center gap-3">
              <Icon className="h-5 w-5 shrink-0" />
              <span>{menu.name}</span>
            </span>
            <span className="flex items-center gap-2">
              {!isOpen && <NotifBadge count={menuBadge(menu)} />}
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  isOpen && "rotate-90"
                )}
              />
            </span>
          </button>

          {isOpen && (
            <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l-2 border-gray-100 pl-3">
              {menu.menu!.map((sub, subIdx) => {
                if (!sub.url) return null
                const subActive = isActivePath(sub.url)
                return (
                  <Link
                    key={`${key}::${sub.url}::${subIdx}`}
                    href={sub.url}
                    onClick={onClose}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      subActive
                        ? "text-[#075489] font-semibold"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <span>{sub.name}</span>
                    <NotifBadge count={sub.url === INCOMING_MENU_URL ? incomingCount : 0} />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    if (!menu.url) return null
    return (
      <Link
        key={key}
        href={menu.url}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-[#4ba69d]/15 text-[#4ba69d] font-semibold"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{menu.name}</span>
        <NotifBadge count={menuBadge(menu)} className="ml-auto" />
      </Link>
    )
  }

  // ── Collapsed rendering (icons only) ─────────────────────────────────────────
  function renderCollapsedMenu(menu: AuthMenuGroup, sectionName: string) {
    const key = `${sectionName}::${menu.name}`
    const Icon = getIcon(menu.icon)
    const hasSubs = !!(menu.menu && menu.menu.length > 0) && !menu.url
    const active = isMenuActive(menu)

    const iconClass = cn(
      "relative flex w-full items-center justify-center rounded-lg px-2.5 py-2.5 transition-colors",
      active
        ? "bg-[#075489] text-white"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    )
    const badge = menuBadge(menu)
    const collapsedBadge = badge > 0 && (
      <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
        {badge > 9 ? "9+" : badge}
      </span>
    )

    if (hasSubs) {
      return (
        <button
          key={key}
          onClick={onExpand}
          onMouseEnter={(e) => showTooltip(menu, e)}
          onMouseLeave={scheduleHide}
          className={iconClass}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {collapsedBadge}
        </button>
      )
    }

    if (!menu.url) return null
    return (
      <Link
        key={key}
        href={menu.url}
        onClick={onClose}
        onMouseEnter={(e) => showTooltip(menu, e)}
        onMouseLeave={scheduleHide}
        className={iconClass}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {collapsedBadge}
      </Link>
    )
  }

  const tooltip =
    collapsed && hoveredMenu
      ? createPortal(
          <div
            style={{ top: tooltipY, left: 64 }}
            className="fixed z-50 ml-1"
            onMouseEnter={cancelHide}
            onMouseLeave={() => setHoveredMenu(null)}
          >
            <div className="min-w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {hoveredMenu.name}
              </p>
              {hoveredMenu.menu?.map((sub, subIdx) => {
                if (!sub.url) return null
                const subActive = isActivePath(sub.url)
                return (
                  <Link
                    key={`${sub.url}::${subIdx}`}
                    href={sub.url}
                    onClick={() => {
                      setHoveredMenu(null)
                      onClose?.()
                    }}
                    className={cn(
                      "block px-3 py-2 text-sm font-medium transition-colors",
                      subActive
                        ? "text-[#075489] bg-[#075489]/10"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {sub.name}
                  </Link>
                )
              })}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60",
        className
      )}
    >
      {onClose && (
        <div className="mb-2 flex justify-end px-3">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-1 px-2">
          {sections.map((section, i) => {
            const sectionKey = section.title_menu ?? `group-${i}`
            return collapsed ? (
              <div key={sectionKey} className="flex flex-col gap-0.5">
                {i > 0 && <div className="my-1 border-t border-gray-100" />}
                {section.menus.map((menu) => renderCollapsedMenu(menu, sectionKey))}
              </div>
            ) : (
              <div key={sectionKey} className="mb-1">
                {section.title_menu && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {section.title_menu}
                  </p>
                )}
                <div className="flex flex-col gap-0.5">
                  {section.menus.map((menu) => renderMenu(menu, sectionKey))}
                </div>
              </div>
            )
          })}
        </div>
      </nav>

      {!collapsed && <Footer />}

      {tooltip}
    </aside>
  )
}

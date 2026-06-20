"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Menu, User, ShieldCheck, LogOut } from "lucide-react"
import Link from "next/link"
import { Logo } from "@/components/atoms/Logo"
import { cn } from "@/lib/utils"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { logout } from "@/lib/store/slices/authSlice"
import { clearAuth } from "@/lib/auth"
import api from "@/lib/axios"

type HeaderProps = {
  className?: string
  onToggleSidebar?: () => void
  onOpenMobileSidebar?: () => void
}

export function Header({ className, onToggleSidebar, onOpenMobileSidebar }: HeaderProps) {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const { name, username } = useAppSelector((s) => s.auth)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const displayName = name ?? username ?? "User"

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function handleLogout() {
    setOpen(false)
    try {
      await api.post("/auth/logout")
    } catch {}
    clearAuth()
    dispatch(logout())
    router.push("/login")
  }

  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          onClick={onOpenMobileSidebar}
          className="flex lg:hidden h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Logo width={120} height={36} />
      </div>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-800">{displayName}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4ba69d] text-sm font-semibold text-white shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-gray-100 bg-white shadow-lg z-50">
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#4ba69d] text-base font-semibold text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
                {username && name && (
                  <p className="truncate text-xs text-gray-400">@{username}</p>
                )}
              </div>
            </div>

            <div className="p-1.5">
              <Link
                href="/pengaturan/profil"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                  <User className="h-4 w-4 text-gray-600" />
                </span>
                Lihat Profil
              </Link>
              <Link
                href="/pengaturan/sesi"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                  <ShieldCheck className="h-4 w-4 text-gray-600" />
                </span>
                Sesi Aktif
              </Link>
            </div>

            <div className="border-t border-gray-100 p-1.5">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                  <LogOut className="h-4 w-4 text-red-500" />
                </span>
                Keluar
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

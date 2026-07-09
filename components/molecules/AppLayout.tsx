"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Header } from "@/components/molecules/Header"
import { Sidebar } from "@/components/molecules/Sidebar"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { setCredentials, fetchMe, setHydrated } from "@/lib/store/slices/authSlice"
import { fetchIncomingCount, fetchPendingTransferCount } from "@/lib/store/slices/notifSlice"
import { playNotifSound, primeNotifSound } from "@/lib/notifSound"
import { getEcho } from "@/lib/echo"
import { loadAuth } from "@/lib/auth"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch()
  const { hydrated, isAuthenticated } = useAppSelector((s) => s.auth)
  const menus = useAppSelector((s) => s.auth.menus)
  const { incomingCount, loaded: notifLoaded } = useAppSelector((s) => s.notif)
  const router = useRouter()
  const pathname = usePathname()
  const prevIncoming = useRef<number | null>(null)

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const didHydrate = useRef(false)

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved !== null) setCollapsed(saved === "true")
  }, [])

  // Auto-collapse sidebar utama berdasarkan flag `open_sidebar` pada menu aktif
  // (diatur di Master Menu). Menu dengan open_sidebar=false → sidebar ditutup saat
  // halaman dibuka. Preferensi collapse manual (localStorage) tidak diubah.
  useEffect(() => {
    // Kumpulkan semua menu ber-url (induk + submenu) beserta flag open_sidebar.
    const links: { url: string; openSidebar: boolean }[] = []
    for (const section of menus ?? []) {
      for (const m of section.menus ?? []) {
        if (m.url) links.push({ url: m.url, openSidebar: m.open_sidebar ?? true })
        for (const sub of m.menu ?? []) {
          if (sub.url) links.push({ url: sub.url, openSidebar: sub.open_sidebar ?? true })
        }
      }
    }
    // Cocokkan URL terpanjang yang menjadi prefix dari pathname aktif.
    let best: { url: string; openSidebar: boolean } | null = null
    for (const l of links) {
      if (pathname === l.url || pathname.startsWith(l.url + "/")) {
        if (!best || l.url.length > best.url.length) best = l
      }
    }
    if (best && !best.openSidebar) setCollapsed(true)
  }, [pathname, menus])

  // Rehydrate Redux from localStorage every time AppLayout mounts.
  // Using a ref (not the Redux hydrated flag) so this runs again when
  // AppLayout remounts after navigating back from the 404 page.
  useEffect(() => {
    if (didHydrate.current) return
    didHydrate.current = true
    const stored = loadAuth()
    if (!stored) {
      dispatch(setHydrated())
      return
    }
    dispatch(setCredentials({
      username: stored.username,
      token: stored.token,
      menus: stored.menus ?? [],
      name: stored.name,
      email: stored.email,
    }))
    dispatch(fetchMe())
  }, [dispatch])

  // Redirect to login when session is cleared (e.g. token expired)
  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/login")
    }
  }, [hydrated, isAuthenticated, router])

  // Ambil jumlah awal sekali saat mount (untuk badge). Pembaruan berikutnya
  // sepenuhnya datang real-time lewat event Pusher di bawah — tanpa polling.
  useEffect(() => {
    if (!isAuthenticated) return
    dispatch(fetchIncomingCount())
    dispatch(fetchPendingTransferCount())
  }, [isAuthenticated, dispatch])

  // Real-time: dengarkan event order baru & permintaan pinjam lewat Pusher. Saat
  // ada event masuk, langsung tarik ulang jumlahnya — kenaikan hitungan memicu
  // bunyi notifikasi di efek bawah (satu jalur, tidak dobel). Ini satu-satunya
  // sumber pembaruan badge (tanpa polling), jadi env Pusher wajib terisi.
  useEffect(() => {
    if (!isAuthenticated) return
    const echo = getEcho()
    if (!echo) return
    const channel = echo.channel("orders")
    channel.listen(".order.submitted", () => {
      dispatch(fetchIncomingCount())
    })
    // Permintaan pinjam-alih baru → perbarui badge "Permintaan Pinjam".
    const transferChannel = echo.channel("transfers")
    transferChannel.listen(".transfer.requested", () => {
      dispatch(fetchPendingTransferCount())
    })
    return () => {
      echo.leaveChannel("orders")
      echo.leaveChannel("transfers")
    }
  }, [isAuthenticated, dispatch])

  // Buka kunci autoplay audio pada gesture user pertama (klik / tekan tombol),
  // agar bunyi notifikasi yang dipicu otomatis nanti tidak diblokir browser.
  useEffect(() => {
    const prime = () => {
      primeNotifSound()
      window.removeEventListener("pointerdown", prime)
      window.removeEventListener("keydown", prime)
    }
    window.addEventListener("pointerdown", prime)
    window.addEventListener("keydown", prime)
    return () => {
      window.removeEventListener("pointerdown", prime)
      window.removeEventListener("keydown", prime)
    }
  }, [])

  // Bunyikan notifikasi saat jumlah order masuk bertambah (ada order baru).
  useEffect(() => {
    if (!notifLoaded) return
    if (prevIncoming.current !== null && incomingCount > prevIncoming.current) {
      playNotifSound()
    }
    prevIncoming.current = incomingCount
  }, [incomingCount, notifLoaded])

  function toggleSidebar() {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev))
      return !prev
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        onToggleSidebar={toggleSidebar}
        onOpenMobileSidebar={() => setMobileOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar collapsed={collapsed} onExpand={() => setCollapsed(false)} />
        </div>

        {/* Mobile sidebar */}
        <div
          className={`fixed inset-y-0 left-0 z-40 lg:hidden transition-transform duration-300 ease-in-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onClose={() => setMobileOpen(false)} />
        </div>

        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

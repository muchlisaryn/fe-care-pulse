"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { setCredentials } from "@/lib/store/slices/authSlice"
import { loadAuth } from "@/lib/auth"
import api from "@/lib/axios"

type BoardLine = { jenis: "Paket" | "Satuan"; name: string; qty: number }

// Order aktif lintas tahap pipeline (dari /master/monitoring/board).
type BoardOrder = {
  order_code: string
  no_transaction: string | null
  borrowed_by: string | null
  order_date: string | null
  order_time: string | null
  room_id: number | null
  room_name: string | null
  status: string
  lines: BoardLine[]
}

const REFRESH_MS = 20000 // auto-refresh tiap 20 detik

const STATUS_LABEL: Record<string, string> = {
  diajukan: "Diajukan",
  pencucian: "Pencucian",
  pengemasan: "Packaging",
  selesai: "Siap Steril",
  sterilisasi: "Sterilisasi",
  steril: "Steril",
  digudang: "Di Gudang",
  dipinjam: "Terdistribusi",
}
const STATUS_COLOR: Record<string, string> = {
  diajukan: "bg-amber-300 text-amber-950",
  pencucian: "bg-yellow-300 text-yellow-950",
  pengemasan: "bg-violet-300 text-violet-950",
  selesai: "bg-indigo-300 text-indigo-950",
  sterilisasi: "bg-sky-300 text-sky-950",
  steril: "bg-emerald-300 text-emerald-950",
  digudang: "bg-teal-300 text-teal-950",
  dipinjam: "bg-blue-200 text-blue-950",
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

const GRID = "grid grid-cols-[150px_160px_150px_130px_84px_1fr_80px] items-start gap-3 leading-tight"

export default function MonitorRuanganPage() {
  const dispatch = useAppDispatch()
  const token = useAppSelector((s) => s.auth.token)
  const params = useParams()
  const roomId = Number(params.ruangan_id)

  const [roomName, setRoomName] = useState<string | null>(null)
  const [orders, setOrders] = useState<BoardOrder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Hidrasi token dari localStorage (halaman di luar AppLayout).
  useEffect(() => {
    const stored = loadAuth()
    if (stored?.token) {
      dispatch(
        setCredentials({
          username: stored.username,
          token: stored.token,
          menus: stored.menus,
          name: stored.name,
          email: stored.email,
        })
      )
    } else {
      setLoaded(true)
    }
  }, [dispatch])

  // Jam berjalan.
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Nama ruangan (sekali) untuk judul.
  useEffect(() => {
    if (!token || !roomId) return
    let active = true
    api
      .get(`/master/rooms/${roomId}`)
      .then((res) => {
        if (active) setRoomName(res.data?.data?.name ?? null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [token, roomId])

  // Ambil order aktif lintas tahap, lalu saring untuk ruangan ini + auto-refresh.
  useEffect(() => {
    if (!token) return
    let active = true

    async function load() {
      try {
        const res = await api.get("/master/monitoring/board")
        const all = (res.data.data as BoardOrder[]) ?? []
        if (active) {
          setOrders(all.filter((o) => o.room_id === roomId))
          setError(null)
        }
      } catch {
        if (active) setError("Gagal memuat data monitoring.")
      } finally {
        if (active) setLoaded(true)
      }
    }

    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [token, roomId])

  // Nama ruangan: dari data board bila ada, jika tidak dari lookup master.
  const displayRoom = orders[0]?.room_name ?? roomName

  // Auto-scroll perlahan bila baris melebihi layar (loop atas-bawah).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let dir = 1
    const t = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight) return
      el.scrollTop += dir
      if (el.scrollTop + el.clientHeight >= el.scrollHeight) dir = -1
      else if (el.scrollTop <= 0) dir = 1
    }, 40)
    return () => clearInterval(t)
  }, [orders])

  const jam = now
    ? now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : ""
  const tanggal = now
    ? now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : ""

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a5bd6] px-6 py-5 text-white">
      {/* Header */}
      <div className="flex items-end justify-between border-b-2 border-white/30 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-4xl font-extrabold tracking-tight drop-shadow">
            {displayRoom ? `CSSD MONITOR — ${displayRoom}` : "CSSD MONITOR"}
          </h1>
          <Link href="/monitor" className="mt-1 inline-block text-sm text-white/80 underline hover:text-white">
            ← Pilih ruangan lain
          </Link>
        </div>
        <div className="text-right leading-tight">
          <div className="font-mono text-3xl font-bold tabular-nums">{jam}</div>
          <div className="text-sm text-white/80">{tanggal}</div>
        </div>
      </div>

      {/* Kolom header */}
      <div className={`${GRID} border-b border-white/25 py-2 text-sm font-bold uppercase tracking-wide text-white/80`}>
        <div>Date | Time</div>
        <div>Reservation</div>
        <div>Peminjam</div>
        <div>Status</div>
        <div>Jenis</div>
        <div>Instrument</div>
        <div className="text-right">Qty</div>
      </div>

      {/* Baris data */}
      <div ref={scrollRef} className="flex-1 overflow-hidden">
        {!loaded ? (
          <div className="flex h-full items-center justify-center text-2xl text-white/70">Memuat data…</div>
        ) : !token ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/80">
            <p className="text-2xl font-semibold">Belum login pada perangkat ini</p>
            <p className="text-sm">Login dulu di aplikasi pada browser TV ini, lalu buka kembali halaman ini.</p>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-2xl text-red-100">{error}</div>
        ) : orders.length === 0 ? (
          <div className="flex h-full items-center justify-center text-2xl text-white/70">
            Tidak ada order aktif untuk ruangan ini.
          </div>
        ) : (
          orders.map((g, gi) => (
            <div
              key={g.order_code}
              className={`border-t-2 border-white/20 ${gi % 2 === 1 ? "bg-white/[0.05]" : ""}`}
            >
              {(g.lines.length ? g.lines : [{ jenis: "Satuan" as const, name: "—", qty: 0 }]).map(
                (ln, li) => (
                  <div key={li} className={`${GRID} ${li === 0 ? "py-0.5 text-lg" : "py-0"}`}>
                    <div className="font-mono tabular-nums text-white/95">
                      {li === 0 ? (
                        <>
                          {formatDate(g.order_date)} <span className="text-white/60">|</span>{" "}
                          {g.order_time ?? "—"}
                        </>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-base font-bold tabular-nums">
                      {li === 0 ? g.no_transaction || g.order_code : null}
                    </div>
                    <div className="truncate text-white/90">{li === 0 ? g.borrowed_by ?? "—" : null}</div>
                    <div>
                      {li === 0 ? (
                        <span
                          className={
                            "rounded px-1.5 py-0.5 text-xs font-bold uppercase " +
                            (STATUS_COLOR[g.status] ?? "bg-white/20 text-white")
                          }
                        >
                          {STATUS_LABEL[g.status] ?? g.status}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold uppercase">
                        {ln.jenis}
                      </span>
                    </div>
                    <div className="truncate font-semibold uppercase">{ln.name}</div>
                    <div className="text-right text-lg font-bold tabular-nums">{ln.qty}</div>
                  </div>
                )
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { setCredentials } from "@/lib/store/slices/authSlice"
import { loadAuth } from "@/lib/auth"
import api from "@/lib/axios"

// Satu baris papan = order × instrumen (QTY sudah digabung di backend).
type BoardRow = {
  status: string
  date: string | null
  time: string | null
  reservation: string
  room_code: string | null
  room_name: string | null
  instrument_code: string
  instrument_name: string
  qty: number
  unit: string
}

const REFRESH_MS = 20000 // auto-refresh tiap 20 detik

// Label + warna status order (badge teks, bukan sekadar titik).
const statusBadge: Record<string, { label: string; cls: string }> = {
  diajukan: { label: "Diajukan", cls: "bg-amber-400/90 text-amber-950" },
  dipinjam: { label: "Dipinjam", cls: "bg-green-400/90 text-green-950" },
}

export default function MonitorPage() {
  const dispatch = useAppDispatch()
  const token = useAppSelector((s) => s.auth.token)

  const [rows, setRows] = useState<BoardRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Hidrasi token dari localStorage (halaman di luar AppLayout, tak ikut rehydrate).
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

  // Jam berjalan. Di-set hanya di klien (setelah mount) agar tak terjadi
  // hydration mismatch — waktu server ≠ waktu klien.
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Ambil data + auto-refresh berkala (setelah token siap).
  useEffect(() => {
    if (!token) return
    let active = true

    async function load() {
      try {
        const res = await api.get("/master/monitoring/board")
        if (active) {
          setRows(res.data.data)
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
  }, [token])

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
  }, [rows])

  const jam = now ? now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""
  const tanggal = now ? now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : ""

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a5bd6] px-6 py-5 text-white">
      {/* Header */}
      <div className="flex items-end justify-between border-b-2 border-white/30 pb-3">
        <h1 className="text-4xl font-extrabold tracking-tight drop-shadow">CSSD MONITOR for Warehouse</h1>
        <div className="text-right leading-tight">
          <div className="font-mono text-3xl font-bold tabular-nums">{jam}</div>
          <div className="text-sm text-white/80">{tanggal}</div>
        </div>
      </div>

      {/* Kolom header */}
      <div className="grid grid-cols-[120px_170px_150px_240px_1fr_120px] gap-3 border-b border-white/25 py-2 text-sm font-bold uppercase tracking-wide text-white/80">
        <div>Status</div>
        <div>Date | Time</div>
        <div>Reservation</div>
        <div>Location</div>
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
            <p className="text-sm">Login dulu di aplikasi pada browser TV ini, lalu buka kembali /monitor.</p>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-2xl text-red-100">{error}</div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-2xl text-white/70">
            Tidak ada order aktif saat ini.
          </div>
        ) : (
          rows.map((r, i) => {
            // Order yang sama tampil berurutan dari backend. Info header order
            // (status, tanggal, reservation, lokasi) cukup di baris pertama;
            // baris instrumen berikutnya hanya menampilkan instrumen + qty.
            const firstOfOrder = i === 0 || rows[i - 1].reservation !== r.reservation
            // Hitung indeks grup order untuk zebra striping per-order (bukan per-baris).
            let groupIndex = 0
            for (let k = 1; k <= i; k++) {
              if (rows[k].reservation !== rows[k - 1].reservation) groupIndex++
            }
            const badge = statusBadge[r.status]
            return (
            <div
              key={`${r.reservation}-${r.instrument_code}-${i}`}
              className={`grid grid-cols-[120px_170px_150px_240px_1fr_120px] items-center gap-3 py-2 text-lg ${
                groupIndex % 2 === 1 ? "bg-white/[0.05]" : ""
              } ${firstOfOrder ? "border-t-2 border-white/20" : ""}`}
            >
              <div>
                {firstOfOrder && (
                  <span className={`rounded px-2 py-0.5 text-sm font-bold ${badge?.cls ?? "bg-white/50 text-black"}`}>
                    {badge?.label ?? r.status}
                  </span>
                )}
              </div>
              <div className="font-mono tabular-nums text-white/95">
                {firstOfOrder && (
                  <>
                    {r.date} <span className="text-white/60">|</span> {r.time}
                  </>
                )}
              </div>
              <div className="font-mono text-xl font-bold tabular-nums">{firstOfOrder ? r.reservation : ""}</div>
              <div className="truncate">
                {firstOfOrder && (
                  <>
                    <span className="font-mono font-semibold">{r.room_code ?? "—"}</span>
                    {r.room_name && <span className="text-white/70"> | {r.room_name}</span>}
                  </>
                )}
              </div>
              <div className="truncate">
                <span className="font-mono text-white/60">{r.instrument_code}</span>
                <span className="mx-1.5 text-white/40">|</span>
                <span className="font-semibold uppercase">{r.instrument_name}</span>
              </div>
              <div className="text-right text-xl font-bold tabular-nums">
                {r.qty} <span className="text-base font-normal text-white/70">{r.unit}</span>
              </div>
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { setCredentials } from "@/lib/store/slices/authSlice"
import { loadAuth } from "@/lib/auth"
import api from "@/lib/axios"

// Satu instrumen yang sedang dipinjam di sebuah ruangan (qty digabung backend).
type RoomInstrument = {
  order_code: string
  code_transaction: string | null
  borrowed_by: string | null
  order_date: string | null
  order_time: string | null
  return_plan_date: string | null
  source: "satuan" | "paket"
  package_name: string | null
  instrument: { id: number; code: string; name: string }
  qty: number
}

type MonitoredRoom = {
  id: number
  code: string
  name: string
  borrowed_count: number
  instrument_count: number
  instruments: RoomInstrument[]
}

// Grup tampilan per order (peminjam) → paket (per nama paket) lalu satuan.
type OrderGroup = {
  order_code: string
  no_transaction: string | null
  borrowed_by: string | null
  order_date: string | null
  order_time: string | null
  paketGroups: { name: string; instruments: RoomInstrument[]; qty: number }[]
  satuan: RoomInstrument[]
}

const REFRESH_MS = 20000 // auto-refresh tiap 20 detik

function formatDate(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

// Kelompokkan instrumen ruangan: per order → paket (per nama) lalu satuan.
function buildOrderGroups(items: RoomInstrument[]): OrderGroup[] {
  const map = new Map<string, RoomInstrument[]>()
  for (const it of items) {
    const arr = map.get(it.order_code) ?? []
    arr.push(it)
    map.set(it.order_code, arr)
  }
  return [...map.entries()].map(([order_code, rows]) => {
    const first = rows[0]
    const paket = new Map<string, RoomInstrument[]>()
    const satuan: RoomInstrument[] = []
    for (const r of rows) {
      if (r.source === "paket") {
        const name = r.package_name ?? "Paket"
        const a = paket.get(name) ?? []
        a.push(r)
        paket.set(name, a)
      } else {
        satuan.push(r)
      }
    }
    return {
      order_code,
      no_transaction: first.code_transaction,
      borrowed_by: first.borrowed_by,
      order_date: first.order_date,
      order_time: first.order_time,
      paketGroups: [...paket.entries()].map(([name, instruments]) => ({
        name,
        instruments,
        qty: instruments.reduce((s, i) => s + i.qty, 0),
      })),
      satuan,
    }
  })
}

const GRID = "grid grid-cols-[160px_170px_170px_1fr_100px] items-start gap-3 leading-tight"

export default function MonitorRuanganPage() {
  const dispatch = useAppDispatch()
  const token = useAppSelector((s) => s.auth.token)
  const params = useParams()
  const roomId = Number(params.ruangan_id)

  const [room, setRoom] = useState<MonitoredRoom | null>(null)
  const [roomFound, setRoomFound] = useState<boolean | null>(null)
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

  // Jam berjalan (hanya di klien agar tak hydration mismatch).
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Ambil data ruangan terpilih + auto-refresh.
  useEffect(() => {
    if (!token) return
    let active = true

    async function load() {
      try {
        let found: MonitoredRoom | null = null
        let page = 1
        let last = 1
        do {
          const res = await api.get("/master/monitoring/rooms", { params: { page } })
          const p = res.data.data
          const hit = (p.data as MonitoredRoom[]).find((r) => r.id === roomId)
          if (hit) {
            found = hit
            break
          }
          last = p.last_page
          page++
        } while (page <= last)

        if (active) {
          setRoomFound(found !== null)
          setRoom(found)
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

  const orderGroups = useMemo(() => buildOrderGroups(room?.instruments ?? []), [room])

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
  }, [orderGroups])

  const jam = now ? now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""
  const tanggal = now ? now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : ""

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a5bd6] px-6 py-5 text-white">
      {/* Header */}
      <div className="flex items-end justify-between border-b-2 border-white/30 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-4xl font-extrabold tracking-tight drop-shadow">
            {room ? `CSSD MONITOR — ${room.name}` : "CSSD MONITOR for Warehouse"}
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
        ) : roomFound === false ? (
          <div className="flex h-full items-center justify-center text-2xl text-white/70">Ruangan tidak ditemukan.</div>
        ) : orderGroups.length === 0 ? (
          <div className="flex h-full items-center justify-center text-2xl text-white/70">
            Tidak ada order aktif di ruangan ini.
          </div>
        ) : (
          orderGroups.map((g, gi) => {
            // Ratakan order jadi daftar baris: header paket → instrumen paket → satuan.
            const lines: { paket?: string; code?: string; name: string; qty: number; indent?: boolean }[] = []
            for (const pk of g.paketGroups) {
              lines.push({ paket: pk.name, name: pk.name, qty: pk.qty })
              for (const it of pk.instruments) {
                lines.push({ code: it.instrument.code, name: it.instrument.name, qty: it.qty, indent: true })
              }
            }
            for (const it of g.satuan) {
              lines.push({ code: it.instrument.code, name: it.instrument.name, qty: it.qty })
            }

            return (
              <div
                key={g.order_code}
                className={`border-t-2 border-white/20 ${gi % 2 === 1 ? "bg-white/[0.05]" : ""}`}
              >
                {lines.map((ln, li) => (
                  <div key={li} className={`${GRID} ${li === 0 ? "py-0.5 text-lg" : "py-0"}`}>
                    {/* Date|Time, Reservation, Peminjam hanya di baris pertama order */}
                    <div className="font-mono tabular-nums text-white/95">
                      {li === 0 ? (
                        <>
                          {formatDate(g.order_date)} <span className="text-white/60">|</span> {g.order_time ?? "—"}
                        </>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-base font-bold tabular-nums">
                      {li === 0 ? g.no_transaction || g.order_code : null}
                    </div>
                    <div className="truncate text-white/90">{li === 0 ? g.borrowed_by ?? "—" : null}</div>
                    {/* Instrument / paket */}
                    {ln.paket !== undefined ? (
                      <div className="truncate font-semibold">
                        <span className="mr-2 rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold uppercase">
                          Paket
                        </span>
                        {ln.paket}
                      </div>
                    ) : (
                      <div className={"truncate " + (ln.indent ? "pl-10" : "")}>
                        <span className="font-mono text-white/60">{ln.code}</span>
                        <span className="mx-1.5 text-white/40">|</span>
                        <span className="font-semibold uppercase">{ln.name}</span>
                      </div>
                    )}
                    <div className="text-right text-lg font-bold tabular-nums">{ln.qty}</div>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

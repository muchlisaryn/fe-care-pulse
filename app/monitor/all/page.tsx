"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { setCredentials } from "@/lib/store/slices/authSlice"
import { loadAuth } from "@/lib/auth"
import api from "@/lib/axios"
import { useLanguage, localeOf, type Lang } from "@/lib/i18n"

type BoardLine = { jenis: "Paket" | "Satuan"; name: string; qty: number }

// Order aktif lintas tahap pipeline (dari /master/monitoring/board).
type BoardOrder = {
  order_code: string
  no_transaction: string | null
  borrowed_by: string | null
  order_date: string | null
  order_time: string | null
  room_name: string | null
  status: string
  lines: BoardLine[]
}

const REFRESH_MS = 20000 // auto-refresh tiap 20 detik

// Label & warna badge per tahap pipeline (untuk papan gelap).
const STATUS_LABEL_KEY: Record<string, string> = {
  diajukan: "monitorBoard.statusSubmitted",
  pencucian: "monitorBoard.statusCleaning",
  pengemasan: "monitorBoard.statusPackaging",
  selesai: "monitorBoard.statusReadySterile",
  sterilisasi: "monitorBoard.statusSterilizing",
  steril: "monitorBoard.statusSterile",
  digudang: "monitorBoard.statusInStorage",
  dipinjam: "monitorBoard.statusDistributed",
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

function formatDate(value: string | null, lang: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(localeOf(lang), { day: "2-digit", month: "short", year: "numeric" })
}

const GRID =
  // Kolom Qty dilebarkan dari 70px agar muat angka + satuannya ("set" / "unit").
  "grid grid-cols-[140px_150px_140px_130px_130px_84px_1fr_110px] items-start gap-3 leading-tight"

export default function MonitorAllPage() {
  const dispatch = useAppDispatch()
  const token = useAppSelector((s) => s.auth.token)
  const { t, lang } = useLanguage()

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

  // Jam berjalan (hanya di klien agar tak hydration mismatch).
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Ambil order aktif lintas tahap + auto-refresh.
  useEffect(() => {
    if (!token) return
    let active = true

    async function load() {
      try {
        const res = await api.get("/master/monitoring/board")
        if (active) {
          setOrders((res.data.data as BoardOrder[]) ?? [])
          setError(null)
        }
      } catch {
        if (active) setError("monitorBoard.loadFailed")
      } finally {
        if (active) setLoaded(true)
      }
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [token])

  // Auto-scroll perlahan bila baris melebihi layar (loop atas-bawah).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let dir = 1
    const timer = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight) return
      el.scrollTop += dir
      if (el.scrollTop + el.clientHeight >= el.scrollHeight) dir = -1
      else if (el.scrollTop <= 0) dir = 1
    }, 40)
    return () => clearInterval(timer)
  }, [orders])

  const jam = now
    ? now.toLocaleTimeString(localeOf(lang), { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : ""
  const tanggal = now
    ? now.toLocaleDateString(localeOf(lang), { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : ""

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a5bd6] px-6 py-5 text-white">
      {/* Header */}
      <div className="flex items-end justify-between border-b-2 border-white/30 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-4xl font-extrabold tracking-tight drop-shadow">
            {t("monitorBoard.titleAll")}
          </h1>
          <Link href="/monitor" className="mt-1 inline-block text-sm text-white/80 underline hover:text-white">
            {t("monitorBoard.pickRoom")}
          </Link>
        </div>
        <div className="text-right leading-tight">
          <div className="font-mono text-3xl font-bold tabular-nums">{jam}</div>
          <div className="text-sm text-white/80">{tanggal}</div>
        </div>
      </div>

      {/* Kolom header */}
      <div className={`${GRID} border-b border-white/25 py-2 text-sm font-bold uppercase tracking-wide text-white/80`}>
        <div>{t("monitorBoard.colDateTime")}</div>
        <div>{t("monitorBoard.colReservation")}</div>
        <div>{t("monitorBoard.colBorrower")}</div>
        <div>{t("monitorBoard.colLocation")}</div>
        <div>{t("common.status")}</div>
        <div>{t("monitorBoard.colType")}</div>
        <div>{t("monitorBoard.colInstrument")}</div>
        <div className="text-right">{t("monitorBoard.colQty")}</div>
      </div>

      {/* Baris data */}
      <div ref={scrollRef} className="flex-1 overflow-hidden">
        {!loaded ? (
          <div className="flex h-full items-center justify-center text-2xl text-white/70">{t("common.loading")}</div>
        ) : !token ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/80">
            <p className="text-2xl font-semibold">{t("monitorBoard.notLoggedIn")}</p>
            <p className="text-sm">{t("monitorBoard.notLoggedInHint")}</p>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-2xl text-red-100">{t(error)}</div>
        ) : orders.length === 0 ? (
          <div className="flex h-full items-center justify-center text-2xl text-white/70">
            {t("monitorBoard.emptyAll")}
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
                    {/* Date|Time, Reservation, Peminjam, Location, Status hanya di baris pertama */}
                    <div className="font-mono tabular-nums text-white/95">
                      {li === 0 ? (
                        <>
                          {formatDate(g.order_date, lang)} <span className="text-white/60">|</span>{" "}
                          {g.order_time ?? "—"}
                        </>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-base font-bold tabular-nums">
                      {li === 0 ? g.no_transaction || g.order_code : null}
                    </div>
                    <div className="truncate text-white/90">{li === 0 ? g.borrowed_by ?? "—" : null}</div>
                    <div className="truncate text-white/90">{li === 0 ? g.room_name ?? "—" : null}</div>
                    <div>
                      {li === 0 ? (
                        <span
                          className={
                            "rounded px-1.5 py-0.5 text-xs font-bold uppercase " +
                            (STATUS_COLOR[g.status] ?? "bg-white/20 text-white")
                          }
                        >
                          {STATUS_LABEL_KEY[g.status] ? t(STATUS_LABEL_KEY[g.status]) : g.status}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold uppercase">
                        {ln.jenis === "Paket" ? t("monitorBoard.typePackage") : t("monitorBoard.typeSingle")}
                      </span>
                    </div>
                    <div className="truncate font-semibold uppercase">{ln.name}</div>
                    {/* Paket dihitung per SET, instrumen lepas per UNIT fisik. */}
                    <div className="text-right text-lg font-bold tabular-nums">
                      {ln.qty}
                      <span className="ml-1 text-sm font-normal text-white/70">
                        {ln.jenis === "Paket" ? t("common.set") : t("common.unit")}
                      </span>
                    </div>
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

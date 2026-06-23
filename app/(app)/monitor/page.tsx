"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, DoorOpen, ChevronRight, LayoutGrid } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import api from "@/lib/axios"

type MonitoredRoom = {
  id: number
  code: string
  name: string
  borrowed_count: number
  transaction_count: number
  instrument_count: number
}

export default function MonitorRoomsPage() {
  const [rooms, setRooms] = useState<MonitoredRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const all: MonitoredRoom[] = []
        let page = 1
        let last = 1
        do {
          const res = await api.get("/master/monitoring/rooms", { params: { page } })
          const p = res.data.data
          all.push(...(p.data as MonitoredRoom[]))
          last = p.last_page
          page++
        } while (page <= last)
        if (active) {
          setRooms(
            all
              .filter((r) => r.borrowed_count > 0)
              .sort((a, b) => b.borrowed_count - a.borrowed_count),
          )
          setError(null)
        }
      } catch {
        if (active) setError("Gagal memuat data monitoring ruangan.")
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchQuery(searchInput.trim().toLowerCase())
  }

  const filtered = searchQuery
    ? rooms.filter((r) => r.name.toLowerCase().includes(searchQuery))
    : rooms

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitor Ruangan"
        subtitle="Pilih ruangan untuk menampilkan monitor instrumen yang sedang dipinjam"
      />

      <form onSubmit={handleSearch} className="flex gap-2 w-full">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Cari ruangan..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
          Cari
        </Button>
      </form>

      {loading ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">Memuat data...</p>
        </Card>
      ) : error ? (
        <Card>
          <p className="py-16 text-center text-sm text-red-500">{error}</p>
        </Card>
      ) : rooms.length === 0 ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">
            Belum ada ruangan yang sedang meminjam instrumen.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Kartu pintasan: monitor semua ruangan (putih) */}
          <Link href="/monitor/all" className="group block">
            <div className="relative h-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#075489]/10">
                  <LayoutGrid className="h-6 w-6 text-[#075489]" />
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-1" />
              </div>
              <p className="mt-4 truncate text-lg font-semibold">Semua Ruangan</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 px-2 py-3 text-center">
                  <div className="text-3xl font-extrabold leading-none text-[#075489]">{rooms.length}</div>
                  <div className="mt-1.5 text-xs text-gray-500">Ruangan</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-2 py-3 text-center">
                  <div className="text-3xl font-extrabold leading-none text-[#075489]">
                    {rooms.reduce((s, r) => s + r.borrowed_count, 0)}
                  </div>
                  <div className="mt-1.5 text-xs text-gray-500">Unit Dipinjam</div>
                </div>
              </div>
            </div>
          </Link>

          {filtered.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-gray-400">
              Tidak ada ruangan yang cocok dengan pencarian.
            </div>
          )}

          {filtered.map((room) => (
            <Link key={room.id} href={`/monitor/${room.id}`} className="group block">
              <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#075489] to-[#4ba69d] p-5 text-white shadow-sm ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
                {/* Ornamen lingkaran dekoratif */}
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

                <div className="relative flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                    <DoorOpen className="h-6 w-6" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/70 transition-transform group-hover:translate-x-1" />
                </div>

                <p className="relative mt-4 truncate text-lg font-semibold">{room.name}</p>
                <div className="relative mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/15 px-2 py-3 text-center">
                    <div className="text-3xl font-extrabold leading-none">{room.transaction_count}</div>
                    <div className="mt-1.5 text-xs text-white/80">Transaksi</div>
                  </div>
                  <div className="rounded-xl bg-white/15 px-2 py-3 text-center">
                    <div className="text-3xl font-extrabold leading-none">{room.borrowed_count}</div>
                    <div className="mt-1.5 text-xs text-white/80">Unit Dipinjam</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

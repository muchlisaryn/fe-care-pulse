"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"

// Satu peristiwa di timeline tracking order (dari endpoint scan / detail order).
export type TimelineEvent = {
  id: number
  type:
    // Siklus peminjaman
    | "dibuat" | "diterima" | "dipinjam" | "dikembalikan" | "dipindah" | "dibatalkan"
    // Pipeline CSSD (ditelusuri dari kode produksi): produksi → cleaning → steril → simpan rak
    | "produksi" | "diproses" | "selesai_cuci" | "gagal_cuci"
    | "disterilkan" | "steril" | "gagal_steril" | "disimpan" | "terdistribusi"
  room: string | null
  actor: string | null
  borrowed_by: string | null
  note: string | null
  created_at: string | null
}

function formatDateTime(value: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const TIMELINE_LABEL: Record<string, string> = {
  produksi: "Produksi",
  dibuat: "Order Dibuat",
  diterima: "Diterima CSSD",
  diproses: "Diproses",
  selesai_cuci: "Selesai Cuci",
  gagal_cuci: "Gagal Cuci",
  disterilkan: "Disterilkan",
  steril: "Steril / Siap Rilis",
  gagal_steril: "Gagal Steril",
  disimpan: "Di Gudang Steril",
  terdistribusi: "Terdistribusi / Digunakan",
  dipinjam: "Dipinjam",
  dipindah: "Dipinjam Unit Lain",
  dikembalikan: "Dikembalikan",
  dibatalkan: "Dibatalkan",
}
const TIMELINE_VARIANT: Record<string, "info" | "success" | "danger" | "warning" | "default"> = {
  produksi: "info",
  dibuat: "warning",
  diterima: "info",
  diproses: "info",
  selesai_cuci: "success",
  gagal_cuci: "danger",
  disterilkan: "info",
  steril: "success",
  gagal_steril: "danger",
  disimpan: "info",
  terdistribusi: "info",
  dipinjam: "info",
  dipindah: "default",
  dikembalikan: "success",
  dibatalkan: "danger",
}
// Label peran petugas sistem (actor = user yang login & mencatat event ini),
// dibedakan per tipe agar tidak rancu dengan nama orang di dalam `note`
// (mis. peminjam / yang mengembalikan).
const TIMELINE_ACTOR_LABEL: Record<string, string> = {
  produksi: "Diproduksi",
  dibuat: "Diajukan",
  diterima: "Diterima",
  selesai_cuci: "Dicuci",
  gagal_cuci: "Dicuci",
  steril: "Divalidasi",
  gagal_steril: "Divalidasi",
  disterilkan: "Disterilkan",
  disimpan: "Disimpan",
  dipinjam: "Diserahkan",
  dipindah: "Disetujui",
  dikembalikan: "Diterima",
  dibatalkan: "Dibatalkan",
}
const TIMELINE_DOT: Record<string, string> = {
  produksi: "bg-[#075489]",
  dibuat: "bg-amber-400",
  diterima: "bg-[#075489]",
  diproses: "bg-yellow-500",
  selesai_cuci: "bg-green-500",
  gagal_cuci: "bg-red-500",
  disterilkan: "bg-sky-500",
  steril: "bg-green-600",
  gagal_steril: "bg-red-500",
  disimpan: "bg-sky-600",
  terdistribusi: "bg-blue-500",
  dipinjam: "bg-[#4ba69d]",
  dipindah: "bg-purple-400",
  dikembalikan: "bg-green-500",
  dibatalkan: "bg-red-500",
}

// Satu baris event pada garis waktu (dot + garis penghubung + konten).
function TimelineItem({
  ev,
  showConnector,
  padBottom,
}: {
  ev: TimelineEvent
  showConnector: boolean
  padBottom: boolean
}) {
  return (
    <li className="flex gap-3">
      {/* Kolom penanda: dot + garis penghubung, keduanya rata tengah */}
      <div className="flex flex-col items-center self-stretch">
        <span
          className={
            "mt-1 h-3 w-3 shrink-0 rounded-full " + (TIMELINE_DOT[ev.type] ?? "bg-gray-400")
          }
        />
        {showConnector && <span className="w-0.5 flex-1 bg-gray-200" />}
      </div>
      <div className={padBottom ? "pb-4" : "pb-0"}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={TIMELINE_VARIANT[ev.type] ?? "default"}>
            {TIMELINE_LABEL[ev.type] ?? ev.type}
          </Badge>
          {ev.room && <span className="text-sm text-gray-700">{ev.room}</span>}
        </div>
        {ev.note && <p className="mt-0.5 text-xs text-gray-500">{ev.note}</p>}
        {/* Baris pelaku + waktu: "Disetujui Administrator · 22 Jun 2026, 13.37" */}
        <p className="mt-0.5 text-xs text-gray-400">
          {ev.actor && <>{TIMELINE_ACTOR_LABEL[ev.type] ?? ""} {ev.actor} · </>}
          {formatDateTime(ev.created_at)}
        </p>
      </div>
    </li>
  )
}

// Riwayat Peminjaman: daftar event tracking order (dibuat → diterima → dipinjam →
// dipindah antar unit → dikembalikan / dibatalkan) dalam bentuk garis waktu vertikal.
export function OrderTimeline({ events }: { events: TimelineEvent[] | undefined }) {
  const [expanded, setExpanded] = useState(false)

  if (!events || events.length === 0) return null

  // Default ringkas: tampil hanya sampai event "Diterima CSSD"; sisanya (dipinjam,
  // dipindah, dikembalikan, dst.) diintip samar di balik kaca agar tak banyak scroll.
  const accIndex = events.findIndex((e) => e.type === "diterima")
  const cutoff = accIndex >= 0 ? accIndex + 1 : events.length
  const visible = events.slice(0, cutoff)
  const hidden = events.slice(cutoff)
  const collapsed = !expanded && hidden.length > 0

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Tracking
      </p>

      {collapsed ? (
        <>
          <ol>
            {visible.map((ev) => (
              // Semua item terlihat punya garis penghubung — menyambung ke peek di bawah.
              <TimelineItem key={ev.id} ev={ev} showConnector padBottom />
            ))}
          </ol>

          {/* Peek event tersembunyi di balik kaca (frosted): konten tetap terlihat
              samar, ditutup gradient + blur, dengan tombol untuk membuka semuanya. */}
          <div className="relative -mt-1 overflow-hidden">
            <ol className="pointer-events-none max-h-24 opacity-70" aria-hidden>
              {hidden.map((ev, i) => (
                <TimelineItem
                  key={ev.id}
                  ev={ev}
                  showConnector={i < hidden.length - 1}
                  padBottom
                />
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/10 via-white/55 to-white/90 backdrop-blur-[3px] transition hover:backdrop-blur-[2px]"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-[#075489] shadow-sm">
                <ChevronDown className="h-3.5 w-3.5" /> Tampilkan semua tracking ({hidden.length})
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <ol>
            {events.map((ev, i) => (
              <TimelineItem
                key={ev.id}
                ev={ev}
                showConnector={i < events.length - 1}
                padBottom={i < events.length - 1}
              />
            ))}
          </ol>
          {hidden.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ml-6 mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#075489] hover:underline"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Sembunyikan
            </button>
          )}
        </>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, ListTree } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/molecules/Modal"

// Rincian ringkas batch untuk tombol "Detail" pada event produksi/cleaning/steril:
// cukup nomor batch + waktunya.
export type TimelineDetail = {
  kind: "produksi" | "cleaning" | "packaging" | "steril"
  code: string
  at?: string | null
}

// Satu peristiwa di timeline tracking order (dari endpoint scan / detail order).
export type TimelineEvent = {
  id: number
  type:
    // Siklus peminjaman
    | "dibuat" | "diterima" | "dipinjam" | "dikembalikan" | "dipindah" | "dibatalkan"
    // Pipeline CSSD (ditelusuri dari kode produksi): produksi → cleaning → steril → simpan rak
    | "produksi" | "diproses" | "selesai_cuci" | "gagal_cuci" | "packaging"
    | "disterilkan" | "steril" | "gagal_steril" | "disimpan" | "terdistribusi"
  room: string | null
  actor: string | null
  borrowed_by: string | null
  note: string | null
  created_at: string | null
  detail?: TimelineDetail | null
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

// Hari & tanggal lengkap: "Selasa, 14 Jul 2026, 09.34".
function formatHariTanggal(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    weekday: "long",
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
  packaging: "Packaging",
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
  packaging: "info",
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
  packaging: "Dikemas",
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
  packaging: "bg-teal-500",
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

// Label nomor batch per jenis tahap.
const DETAIL_NOMOR_LABEL: Record<TimelineDetail["kind"], string> = {
  produksi: "Nomor Produksi",
  cleaning: "Nomor Cleaning",
  packaging: "Nomor Packaging",
  steril: "Nomor Sterilisasi",
}

// Satu baris event pada garis waktu (dot + garis penghubung + konten).
function TimelineItem({
  ev,
  showConnector,
  padBottom,
  onDetail,
}: {
  ev: TimelineEvent
  showConnector: boolean
  padBottom: boolean
  onDetail: (ev: TimelineEvent) => void
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
          {ev.detail && (
            <button
              type="button"
              onClick={() => onDetail(ev)}
              className="inline-flex items-center gap-1 rounded-md border border-[#075489]/30 px-2 py-0.5 text-xs font-medium text-[#075489] transition-colors hover:bg-[#075489]/10"
            >
              <ListTree className="h-3.5 w-3.5" /> Detail
            </button>
          )}
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

// Isi modal rincian batch: nomor batch + hari & tanggal.
function DetailModalBody({ detail }: { detail: TimelineDetail }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {DETAIL_NOMOR_LABEL[detail.kind]}
        </p>
        <p className="font-mono text-sm font-semibold text-[#075489]">{detail.code}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Hari &amp; Tanggal
        </p>
        <p className="text-sm text-gray-800">{formatHariTanggal(detail.at)}</p>
      </div>
    </div>
  )
}

// Riwayat Peminjaman: daftar event tracking order (dibuat → diterima → dipinjam →
// dipindah antar unit → dikembalikan / dibatalkan) dalam bentuk garis waktu vertikal.
export function OrderTimeline({ events }: { events: TimelineEvent[] | undefined }) {
  const [expanded, setExpanded] = useState(false)
  const [detailEv, setDetailEv] = useState<TimelineEvent | null>(null)

  if (!events || events.length === 0) return null

  // Default ringkas: hanya event TERAKHIR (posisi order saat ini) yang tampil;
  // seluruh riwayat sebelumnya disembunyikan di balik tombol agar tidak panjang.
  const latest = events[events.length - 1]
  const hiddenCount = events.length - 1
  const collapsed = !expanded && hiddenCount > 0

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Tracking
      </p>

      {collapsed ? (
        <>
          <ol>
            <TimelineItem ev={latest} showConnector={false} padBottom={false} onDetail={setDetailEv} />
          </ol>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-6 mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#075489] hover:underline"
          >
            <ChevronDown className="h-3.5 w-3.5" /> Tampilkan semua tracking ({hiddenCount})
          </button>
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
                onDetail={setDetailEv}
              />
            ))}
          </ol>
          {hiddenCount > 0 && (
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

      <Modal
        open={detailEv !== null}
        onClose={() => setDetailEv(null)}
        title={
          detailEv?.detail
            ? `${TIMELINE_LABEL[detailEv.type] ?? "Detail"} — ${detailEv.detail.code}`
            : "Detail"
        }
        size="sm"
        footer={
          <Button variant="outline" onClick={() => setDetailEv(null)}>
            Tutup
          </Button>
        }
      >
        {detailEv?.detail && <DetailModalBody detail={detailEv.detail} />}
      </Modal>
    </div>
  )
}

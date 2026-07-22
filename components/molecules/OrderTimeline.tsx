"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, ListTree, Loader2, Search } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/molecules/Modal"
import api from "@/lib/axios"

// Satu baris tabel Detail packaging: tanggal | code (barcode_no) | nama | nama petugas.
export type TimelinePackagingRow = {
  tanggal?: string | null
  code: string
  name: string
  petugas?: string | null
}

// Satu baris tabel Detail produksi/cleaning/steril: tanggal | nomor batch | nama |
// jumlah (+ nama petugas bila ada, mis. tahap Steril).
export type TimelineItemLine = {
  name: string
  type: "paket" | "satuan"
  qty: number
  tanggal?: string | null
  code?: string
  petugas?: string | null
}

// Rincian tombol "Detail" per tahap. Isinya di-LAZY-LOAD saat diklik, jadi di sini
// cukup pengenal batch: `codes` (produksi/cleaning) atau `ids` (packaging).
export type TimelineDetail = {
  kind: "produksi" | "cleaning" | "packaging" | "steril"
  code: string
  at?: string | null
  codes?: string[]
  ids?: number[]
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

const TIMELINE_LABEL: Record<string, string> = {
  produksi: "Produksi",
  dibuat: "Order Dibuat",
  diterima: "Diterima CSSD",
  diproses: "Diproses",
  selesai_cuci: "Pencucian & Disinfeksi",
  gagal_cuci: "Gagal Cuci",
  packaging: "Inspeksi & Pengemasan",
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

// Tahap pipeline (Produksi → Steril): baris pelaku + waktu disembunyikan karena
// sudah tersaji di tabel Detail masing-masing.
const PIPELINE_STAGES = new Set([
  "produksi",
  "diproses",
  "selesai_cuci",
  "gagal_cuci",
  "packaging",
  "disterilkan",
  "steril",
  "gagal_steril",
])

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
        {/* Baris pelaku + waktu: "Disetujui Administrator · 22 Jun 2026, 13.37".
            Disembunyikan untuk tahap pipeline (produksi → steril) — pelaku & tanggalnya
            sudah ada di tabel Detail. */}
        {!PIPELINE_STAGES.has(ev.type) && (
          <p className="mt-0.5 text-xs text-gray-400">
            {ev.actor && <>{TIMELINE_ACTOR_LABEL[ev.type] ?? ""} {ev.actor} · </>}
            {formatDateTime(ev.created_at)}
          </p>
        )}
      </div>
    </li>
  )
}

// Kolom pencarian rincian Detail (filter baris tabel).
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cari nama atau kode…"
        className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#075489] focus:ring-2 focus:ring-[#075489]/20"
      />
    </div>
  )
}

// Tabel rincian tahap (di-lazy-load): tanggal | nomor batch | nama | jumlah.
// `codeLabel` = judul kolom nomor (mis. "Nomor Produksi" / "Nomor Cleaning").
function LazyItemsTable({ items, codeLabel }: { items: TimelineItemLine[]; codeLabel: string }) {
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const filtered = query
    ? items.filter((it) => `${it.name} ${it.code ?? ""} ${it.petugas ?? ""}`.toLowerCase().includes(query))
    : items
  // Kolom Nama Petugas hanya muncul bila datanya ada (mis. tahap Steril).
  const showPetugas = items.some((it) => it.petugas)
  return (
    <div className="space-y-2">
      <SearchBox value={q} onChange={setQ} />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Tidak ada rincian.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">Tanggal</th>
                <th className="py-2 pr-3">{codeLabel}</th>
                <th className="py-2 pr-3">Nama</th>
                {showPetugas && <th className="py-2">Nama Petugas</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatDateTime(it.tanggal ?? null)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs font-semibold text-[#075489]">
                    {it.code ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-gray-800">{it.name}</td>
                  {showPetugas && <td className="py-2 text-gray-600">{it.petugas ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Tabel rincian Detail packaging (lazy-load): tanggal | code | nama | nama petugas.
function PackagingTable({ rows }: { rows: TimelinePackagingRow[] }) {
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const filtered = query
    ? rows.filter((r) => `${r.name} ${r.code} ${r.petugas ?? ""}`.toLowerCase().includes(query))
    : rows
  return (
    <div className="space-y-2">
      <SearchBox value={q} onChange={setQ} />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Tidak ada rincian.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">Tanggal</th>
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Nama</th>
                <th className="py-2">Nama Petugas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatDateTime(r.tanggal ?? null)}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs font-semibold text-[#075489]">{r.code}</td>
                  <td className="py-2 pr-3 text-gray-800">{r.name}</td>
                  <td className="py-2 text-gray-600">{r.petugas ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Riwayat Peminjaman: daftar event tracking order (dibuat → diterima → dipinjam →
// dipindah antar unit → dikembalikan / dibatalkan) dalam bentuk garis waktu vertikal.
// Endpoint + parameter lazy-load Detail per jenis tahap.
const LAZY_DETAIL: Record<string, { endpoint: string; codeLabel: string }> = {
  produksi: { endpoint: "/master/production/detail", codeLabel: "Nomor Produksi" },
  cleaning: { endpoint: "/master/cleaning/detail", codeLabel: "Nomor Cleaning" },
  packaging: { endpoint: "/master/packaging/barcode-detail", codeLabel: "Nomor Packaging" },
  steril: { endpoint: "/master/sterilization-pipeline/detail", codeLabel: "Nomor Sterilisasi" },
}

/**
 * Timeline tracking order. Beri `events` (sudah dimuat) ATAU `orderId` (di-LAZY-LOAD
 * dari GET orders/{id}/timeline saat dirender — dipakai di Pengembalian Instrumen
 * agar tracking-nya tidak ikut dibebankan ke payload scan).
 */
export function OrderTimeline({ events, orderId }: { events?: TimelineEvent[]; orderId?: number }) {
  const [expanded, setExpanded] = useState(false)
  const [detailEv, setDetailEv] = useState<TimelineEvent | null>(null)

  // Lazy-load seluruh timeline bila hanya orderId yang diberikan.
  const [lazyEvents, setLazyEvents] = useState<TimelineEvent[] | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  useEffect(() => {
    if (orderId == null) return
    let active = true
    setTimelineLoading(true)
    setLazyEvents(null)
    api
      .get(`/master/orders/${orderId}/timeline`)
      .then((res) => {
        if (active) setLazyEvents((res.data?.data?.timeline as TimelineEvent[]) ?? [])
      })
      .catch(() => {
        if (active) setLazyEvents([])
      })
      .finally(() => {
        if (active) setTimelineLoading(false)
      })
    return () => {
      active = false
    }
  }, [orderId])

  // Rincian tombol Detail per tahap di-LAZY-LOAD saat modalnya dibuka.
  const [lazyData, setLazyData] = useState<{ items?: TimelineItemLine[]; rows?: TimelinePackagingRow[] } | null>(null)
  const [lazyLoading, setLazyLoading] = useState(false)
  const lazyKind = detailEv?.detail?.kind
  const lazyCfg = lazyKind ? LAZY_DETAIL[lazyKind] : undefined
  const isPackaging = lazyKind === "packaging"

  useEffect(() => {
    const d = detailEv?.detail
    if (!lazyCfg || !d) return
    const params = isPackaging ? { ids: d.ids } : { codes: d.codes }
    const identifiers = isPackaging ? d.ids : d.codes
    if (!identifiers || identifiers.length === 0) return
    let active = true
    setLazyLoading(true)
    setLazyData(null)
    api
      .get(lazyCfg.endpoint, { params })
      .then((res) => {
        if (active) setLazyData(res.data?.data ?? {})
      })
      .catch(() => {
        if (active) setLazyData({})
      })
      .finally(() => {
        if (active) setLazyLoading(false)
      })
    return () => {
      active = false
    }
  }, [detailEv, lazyCfg, isPackaging])

  const data = orderId != null ? lazyEvents : events

  if (orderId != null && timelineLoading && !data) {
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Tracking</p>
        <div className="py-4 text-center text-xs text-gray-400">
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-[#075489]" />
          <p className="mt-1">Memuat tracking…</p>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) return null

  // Default ringkas: hanya event TERAKHIR (posisi order saat ini) yang tampil;
  // seluruh riwayat sebelumnya disembunyikan di balik tombol agar tidak panjang.
  const latest = data[data.length - 1]
  const hiddenCount = data.length - 1
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
            {data.map((ev, i) => (
              <TimelineItem
                key={ev.id}
                ev={ev}
                showConnector={i < data.length - 1}
                padBottom={i < data.length - 1}
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
        title={detailEv ? (TIMELINE_LABEL[detailEv.type] ?? "Detail") : "Detail"}
        size={lazyCfg ? "lg" : "sm"}
        footer={
          <Button variant="outline" onClick={() => setDetailEv(null)}>
            Tutup
          </Button>
        }
      >
        {detailEv?.detail &&
          (lazyLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#075489]" />
              <p className="mt-2 text-sm text-gray-400">Memuat rincian…</p>
            </div>
          ) : isPackaging ? (
            <PackagingTable rows={lazyData?.rows ?? []} />
          ) : (
            <LazyItemsTable items={lazyData?.items ?? []} codeLabel={lazyCfg?.codeLabel ?? "Nomor"} />
          ))}
      </Modal>
    </div>
  )
}

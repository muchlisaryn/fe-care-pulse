"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, ListTree, Loader2, Search } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Modal } from "@/components/molecules/Modal"
import { localeOf, useLanguage, useT, type Lang } from "@/lib/i18n"
import api from "@/lib/axios"

// Satu baris tabel Detail packaging: tanggal | code (barcode_no) | nama | nama petugas.
export type TimelinePackagingRow = {
  tanggal?: string | null
  code: string
  name: string
  petugas?: string | null
}

// Satu baris tabel Detail produksi/cleaning/steril: tanggal | nomor label | nomor
// batch | nama | jumlah (+ nama petugas bila ada, mis. tahap Steril).
export type TimelineItemLine = {
  name: string
  type: "paket" | "satuan"
  qty: number
  tanggal?: string | null
  code?: string
  /** Nomor label kemasan bungkus steril — penanda yang sama di seluruh tahap. */
  barcode_no?: string | null
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

function formatDateTime(value: string | null, lang: Lang) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Nama tiap event pada garis waktu — KUNCI kamus, bukan teksnya, supaya ikut
// bahasa aktif tanpa perlu dua peta terpisah per bahasa.
const TIMELINE_LABEL_KEY: Record<string, string> = {
  produksi: "timeline.evProduksi",
  dibuat: "timeline.evDibuat",
  diterima: "timeline.evDiterima",
  diproses: "timeline.evDiproses",
  selesai_cuci: "timeline.evSelesaiCuci",
  gagal_cuci: "timeline.evGagalCuci",
  packaging: "timeline.evPackaging",
  disterilkan: "timeline.evDisterilkan",
  steril: "timeline.evSteril",
  gagal_steril: "timeline.evGagalSteril",
  disimpan: "timeline.evDisimpan",
  terdistribusi: "timeline.evTerdistribusi",
  dipinjam: "timeline.evDipinjam",
  dipindah: "timeline.evDipindah",
  dikembalikan: "timeline.evDikembalikan",
  dibatalkan: "timeline.evDibatalkan",
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
const TIMELINE_ACTOR_KEY: Record<string, string> = {
  produksi: "timeline.byProduksi",
  dibuat: "timeline.byDibuat",
  diterima: "timeline.byDiterima",
  selesai_cuci: "timeline.bySelesaiCuci",
  gagal_cuci: "timeline.bySelesaiCuci",
  packaging: "timeline.byPackaging",
  steril: "timeline.bySteril",
  gagal_steril: "timeline.bySteril",
  disterilkan: "timeline.byDisterilkan",
  disimpan: "timeline.byDisimpan",
  dipinjam: "timeline.byDipinjam",
  dipindah: "timeline.byDipindah",
  dikembalikan: "timeline.byDiterima",
  dibatalkan: "timeline.byDibatalkan",
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
  const { t, lang } = useLanguage()
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
            {TIMELINE_LABEL_KEY[ev.type] ? t(TIMELINE_LABEL_KEY[ev.type]) : ev.type}
          </Badge>
          {ev.room && <span className="text-sm text-gray-700">{ev.room}</span>}
          {ev.detail && (
            <button
              type="button"
              onClick={() => onDetail(ev)}
              className="inline-flex items-center gap-1 rounded-md border border-[#075489]/30 px-2 py-0.5 text-xs font-medium text-[#075489] transition-colors hover:bg-[#075489]/10"
            >
              <ListTree className="h-3.5 w-3.5" /> {t("timeline.detail")}
            </button>
          )}
        </div>
        {ev.note && <p className="mt-0.5 text-xs text-gray-500">{ev.note}</p>}
        {/* Baris pelaku + waktu: "Disetujui Administrator · 22 Jun 2026, 13.37".
            Disembunyikan untuk tahap pipeline (produksi → steril) — pelaku & tanggalnya
            sudah ada di tabel Detail. */}
        {!PIPELINE_STAGES.has(ev.type) && (
          <p className="mt-0.5 text-xs text-gray-400">
            {ev.actor && (
              <>
                {TIMELINE_ACTOR_KEY[ev.type] ? t(TIMELINE_ACTOR_KEY[ev.type]) : ""} {ev.actor} ·{" "}
              </>
            )}
            {formatDateTime(ev.created_at, lang)}
          </p>
        )}
      </div>
    </li>
  )
}

// Kolom pencarian rincian Detail (filter baris tabel).
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("timeline.searchPlaceholder")}
        className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#075489] focus:ring-2 focus:ring-[#075489]/20"
      />
    </div>
  )
}

// Tabel rincian tahap (di-lazy-load): tanggal | nomor batch | nama | jumlah.
// `codeLabel` = judul kolom nomor (mis. "Nomor Produksi" / "Nomor Cleaning").
function LazyItemsTable({ items, codeLabel }: { items: TimelineItemLine[]; codeLabel: string }) {
  const { t, lang } = useLanguage()
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const filtered = query
    ? items.filter((it) =>
        `${it.name} ${it.code ?? ""} ${it.barcode_no ?? ""} ${it.petugas ?? ""}`
          .toLowerCase()
          .includes(query),
      )
    : items
  // Kolom Nama Petugas hanya muncul bila datanya ada (mis. tahap Steril).
  const showPetugas = items.some((it) => it.petugas)
  return (
    <div className="space-y-2">
      <SearchBox value={q} onChange={setQ} />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{t("timeline.noDetails")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">{t("timeline.colDate")}</th>
                <th className="py-2 pr-3">{t("timeline.colLabelNo")}</th>
                <th className="py-2 pr-3">{codeLabel}</th>
                <th className="py-2 pr-3">{t("timeline.colName")}</th>
                {showPetugas && <th className="py-2">{t("timeline.colOfficer")}</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatDateTime(it.tanggal ?? null, lang)}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {it.barcode_no ? (
                      <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-1.5 py-0.5 rounded">
                        {it.barcode_no}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
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
  const { t, lang } = useLanguage()
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()
  const filtered = query
    ? rows.filter((r) => `${r.name} ${r.code} ${r.petugas ?? ""}`.toLowerCase().includes(query))
    : rows
  return (
    <div className="space-y-2">
      <SearchBox value={q} onChange={setQ} />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{t("timeline.noDetails")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">{t("timeline.colDate")}</th>
                <th className="py-2 pr-3">{t("masterIcd10.colCode")}</th>
                <th className="py-2 pr-3">{t("timeline.colName")}</th>
                <th className="py-2">{t("timeline.colOfficer")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{formatDateTime(r.tanggal ?? null, lang)}</td>
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
const LAZY_DETAIL: Record<string, { endpoint: string; codeLabelKey: string }> = {
  produksi: { endpoint: "/master/production/detail", codeLabelKey: "timeline.codeProduction" },
  cleaning: { endpoint: "/master/cleaning/detail", codeLabelKey: "timeline.codeCleaning" },
  packaging: {
    endpoint: "/master/packaging/barcode-detail",
    codeLabelKey: "timeline.codePackaging",
  },
  steril: {
    endpoint: "/master/sterilization-pipeline/detail",
    codeLabelKey: "timeline.codeSterilization",
  },
}

/**
 * Timeline tracking order. Beri `events` (sudah dimuat) ATAU `orderId` (di-LAZY-LOAD).
 *
 * Mode `orderId` dimuat DUA TAHAP agar modal Pengembalian Instrumen terbuka cepat:
 * 1. Saat dirender — hanya AKTIVITAS TERAKHIR, dari endpoint ringan tersendiri
 *    `GET order-tracking/{id}/latest` (satu baris tabel order_events).
 * 2. Saat tombol "Tampilkan semua tracking" ditekan — barulah seluruh riwayat
 *    (termasuk pipeline CSSD tiap unit) ditarik dari `GET orders/{id}/timeline`.
 */
export function OrderTimeline({
  events,
  orderId,
  scopeOrderId,
}: {
  events?: TimelineEvent[]
  orderId?: number
  /**
   * Order yang dipakai MENYARING rincian Detail tiap tahap — satu batch pipeline
   * bisa berisi unit milik order lain, dan yang ingin dilacak hanya instrumen order
   * ini. Diisi sendiri bila `events` yang dioper (mode `orderId` memakainya otomatis).
   */
  scopeOrderId?: number
}) {
  // Seluruh teks timeline mengikuti bahasa yang dipilih di header.
  const t = useT()
  const detailOrderId = scopeOrderId ?? orderId
  const [expanded, setExpanded] = useState(false)
  const [detailEv, setDetailEv] = useState<TimelineEvent | null>(null)

  // Tahap 1 — aktivitas TERAKHIR saja (endpoint ringan tersendiri).
  const [latestEvent, setLatestEvent] = useState<TimelineEvent | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [timelineLoading, setTimelineLoading] = useState(false)
  // Tahap 2 — seluruh riwayat, baru diisi setelah tombol "Tampilkan semua" ditekan.
  const [lazyEvents, setLazyEvents] = useState<TimelineEvent[] | null>(null)
  const [allLoading, setAllLoading] = useState(false)

  useEffect(() => {
    if (orderId == null) return
    let active = true
    setTimelineLoading(true)
    // Order berganti → riwayat penuh order sebelumnya dibuang & tampilan kembali
    // ringkas, supaya tidak ada baris milik order lain yang tertinggal di layar.
    setLatestEvent(null)
    setLazyEvents(null)
    setExpanded(false)
    api
      .get(`/master/order-tracking/${orderId}/latest`)
      .then((res) => {
        if (!active) return
        setLatestEvent((res.data?.data?.event as TimelineEvent | null) ?? null)
        setHasMore(Boolean(res.data?.data?.has_more))
      })
      .catch(() => {
        if (!active) return
        setLatestEvent(null)
        setHasMore(false)
      })
      .finally(() => {
        if (active) setTimelineLoading(false)
      })
    return () => {
      active = false
    }
  }, [orderId])

  // Tarik seluruh riwayat — hanya dipanggil dari tombol "Tampilkan semua tracking",
  // dan hanya sekali per order (hasilnya disimpan sampai ordernya berganti).
  async function loadAllEvents() {
    if (orderId == null) return
    if (lazyEvents) {
      setExpanded(true)
      return
    }
    setAllLoading(true)
    try {
      const res = await api.get(`/master/orders/${orderId}/timeline`)
      setLazyEvents((res.data?.data?.timeline as TimelineEvent[]) ?? [])
      setExpanded(true)
    } catch {
      setLazyEvents([])
    } finally {
      setAllLoading(false)
    }
  }

  // Rincian tombol Detail per tahap di-LAZY-LOAD saat modalnya dibuka.
  const [lazyData, setLazyData] = useState<{ items?: TimelineItemLine[]; rows?: TimelinePackagingRow[] } | null>(null)
  const [lazyLoading, setLazyLoading] = useState(false)
  const lazyKind = detailEv?.detail?.kind
  const lazyCfg = lazyKind ? LAZY_DETAIL[lazyKind] : undefined
  const isPackaging = lazyKind === "packaging"

  useEffect(() => {
    const d = detailEv?.detail
    if (!lazyCfg || !d) return
    const params = {
      ...(isPackaging ? { ids: d.ids } : { codes: d.codes }),
      // Saring ke unit milik order ini saja (lihat OrderItem::stockIdsOfOrder).
      ...(detailOrderId != null ? { order_id: detailOrderId } : {}),
    }
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
  }, [detailEv, lazyCfg, isPackaging, detailOrderId])

  // Mode `orderId`: selama belum ditekan "Tampilkan semua", yang ada di tangan
  // hanyalah aktivitas terakhir — daftar penuhnya memang belum pernah ditarik.
  const data = orderId != null ? (lazyEvents ?? (latestEvent ? [latestEvent] : null)) : events

  if (orderId != null && timelineLoading && !latestEvent) {
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("timeline.heading")}
        </p>
        <div className="py-4 text-center text-xs text-gray-400">
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-[#075489]" />
          <p className="mt-1">{t("timeline.loading")}</p>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) return null

  // Default ringkas: hanya event TERAKHIR (posisi order saat ini) yang tampil;
  // seluruh riwayat sebelumnya disembunyikan di balik tombol agar tidak panjang.
  const latest = data[data.length - 1]
  // Mode `orderId`: jumlah pastinya belum diketahui sebelum riwayat penuh ditarik —
  // servernya cuma memberi tahu masih ada riwayat lain atau tidak (`has_more`),
  // jadi tombolnya tampil tanpa angka.
  const hiddenCount = data.length - 1
  const canExpand = orderId != null ? hasMore || hiddenCount > 0 : hiddenCount > 0
  const collapsed = !expanded && canExpand
  const expandLabel =
    orderId != null && lazyEvents === null
      ? t("timeline.showAll")
      : t("timeline.showAllCount", { n: hiddenCount })

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t("timeline.heading")}
      </p>

      {collapsed ? (
        <>
          <ol>
            <TimelineItem
              ev={latest}
              showConnector={false}
              padBottom={false}
              onDetail={setDetailEv}
            />
          </ol>
          <button
            type="button"
            onClick={() => (orderId != null ? loadAllEvents() : setExpanded(true))}
            disabled={allLoading}
            className="ml-6 mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#075489] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {allLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                {t("timeline.loading")}
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> {expandLabel}
              </>
            )}
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
              <ChevronUp className="h-3.5 w-3.5" /> {t("timeline.hide")}
            </button>
          )}
        </>
      )}

      <Modal
        open={detailEv !== null}
        onClose={() => setDetailEv(null)}
        title={
          detailEv && TIMELINE_LABEL_KEY[detailEv.type]
            ? t(TIMELINE_LABEL_KEY[detailEv.type])
            : t("timeline.detail")
        }
        size={lazyCfg ? "lg" : "sm"}
        footer={
          <Button variant="outline" onClick={() => setDetailEv(null)}>
            {t("common.close")}
          </Button>
        }
      >
        {detailEv?.detail &&
          (lazyLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#075489]" />
              <p className="mt-2 text-sm text-gray-400">
                {t("timeline.loadingDetails")}
              </p>
            </div>
          ) : isPackaging ? (
            <PackagingTable rows={lazyData?.rows ?? []} />
          ) : (
            <LazyItemsTable
              items={lazyData?.items ?? []}
              codeLabel={t(lazyCfg?.codeLabelKey ?? "timeline.colNumber")}
            />
          ))}
      </Modal>
    </div>
  )
}

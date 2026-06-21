import { Badge } from "@/components/atoms/Badge"

// Satu peristiwa di timeline tracking order (dari endpoint scan / detail order).
export type TimelineEvent = {
  id: number
  type: "dibuat" | "diterima" | "dipinjam" | "dikembalikan" | "dipindah" | "dibatalkan"
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
  dibuat: "Order Dibuat",
  diterima: "Diterima CSSD",
  dipinjam: "Dipinjam",
  dipindah: "Dipinjam Unit Lain",
  dikembalikan: "Dikembalikan",
  dibatalkan: "Dibatalkan",
}
const TIMELINE_VARIANT: Record<string, "info" | "success" | "danger" | "warning" | "default"> = {
  dibuat: "warning",
  diterima: "info",
  dipinjam: "info",
  dipindah: "default",
  dikembalikan: "success",
  dibatalkan: "danger",
}
const TIMELINE_DOT: Record<string, string> = {
  dibuat: "bg-amber-400",
  diterima: "bg-[#075489]",
  dipinjam: "bg-[#4ba69d]",
  dipindah: "bg-purple-400",
  dikembalikan: "bg-green-500",
  dibatalkan: "bg-red-500",
}

// Riwayat Peminjaman: daftar event tracking order (dibuat → diterima → dipinjam →
// dipindah antar unit → dikembalikan / dibatalkan) dalam bentuk garis waktu vertikal.
export function OrderTimeline({ events }: { events: TimelineEvent[] | undefined }) {
  if (!events || events.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Riwayat Peminjaman
      </p>
      <ol>
        {events.map((ev, i) => {
          const last = i === events.length - 1
          return (
            <li key={ev.id} className="flex gap-3">
              {/* Kolom penanda: dot + garis penghubung, keduanya rata tengah */}
              <div className="flex flex-col items-center self-stretch">
                <span
                  className={
                    "mt-1 h-3 w-3 shrink-0 rounded-full " + (TIMELINE_DOT[ev.type] ?? "bg-gray-400")
                  }
                />
                {!last && <span className="w-0.5 flex-1 bg-gray-200" />}
              </div>
              <div className={last ? "pb-0" : "pb-4"}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={TIMELINE_VARIANT[ev.type] ?? "default"}>
                    {TIMELINE_LABEL[ev.type] ?? ev.type}
                  </Badge>
                  {ev.room && <span className="text-sm text-gray-700">{ev.room}</span>}
                  <span className="text-xs text-gray-400">{formatDateTime(ev.created_at)}</span>
                </div>
                {ev.note && <p className="mt-0.5 text-xs text-gray-500">{ev.note}</p>}
                {ev.actor && <p className="mt-0.5 text-xs text-gray-400">oleh {ev.actor}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

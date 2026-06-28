import {
  Check,
  Clock,
  Inbox,
  Droplets,
  Package,
  ShieldCheck,
  FlaskConical,
  Warehouse,
  Truck,
  Undo2,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { OrderStatus } from "@/lib/store/slices/orderSlice"

// Gaya badge status order — tiap tahap punya warna & ikon sendiri agar mudah
// dibedakan sekilas. `dot` menandakan tahap yang sedang berjalan (animasi pulse).
type StatusStyle = {
  label: string
  icon: LucideIcon
  className: string
  iconClassName: string
  pulse?: boolean
}

const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  diajukan: {
    label: "Diajukan",
    icon: Clock,
    className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    iconClassName: "text-amber-500",
    pulse: true,
  },
  pencucian: {
    label: "Sedang Dicuci",
    icon: Droplets,
    className: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
    iconClassName: "text-yellow-500",
    pulse: true,
  },
  pengemasan: {
    label: "Sedang Packaging",
    icon: Package,
    className: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
    iconClassName: "text-violet-500",
    pulse: true,
  },
  selesai: {
    label: "Siap Disterilkan",
    icon: ShieldCheck,
    className: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    iconClassName: "text-indigo-500",
    pulse: true,
  },
  sterilisasi: {
    label: "Sedang Disterilkan",
    icon: FlaskConical,
    className: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    iconClassName: "text-sky-500",
    pulse: true,
  },
  steril: {
    label: "Steril / Siap Rilis",
    icon: ShieldCheck,
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    iconClassName: "text-emerald-500",
  },
  digudang: {
    label: "Di Gudang Steril",
    icon: Warehouse,
    className: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
    iconClassName: "text-teal-500",
  },
  dipinjam: {
    label: "Distribusi",
    icon: Truck,
    className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    iconClassName: "text-blue-500",
  },
  dikembalikan: {
    label: "Dikembalikan",
    icon: Undo2,
    className: "bg-green-50 text-green-700 ring-1 ring-green-200",
    iconClassName: "text-green-500",
  },
  dibatalkan: {
    label: "Dibatalkan",
    icon: X,
    className: "bg-red-50 text-red-600 ring-1 ring-red-200",
    iconClassName: "text-red-500",
  },
}

const FALLBACK_STYLE: StatusStyle = {
  label: "—",
  icon: Clock,
  className: "bg-gray-50 text-gray-600 ring-1 ring-gray-200",
  iconClassName: "text-gray-400",
}

/** Badge status order yang menonjol: warna + ikon khas per tahap pipeline CSSD. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLES[status] ?? { ...FALLBACK_STYLE, label: status }
  const Icon = s.icon
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold " +
        s.className
      }
    >
      {s.pulse ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      ) : (
        <Icon className={"h-3.5 w-3.5 " + s.iconClassName} />
      )}
      {s.label}
    </span>
  )
}

// Tahapan tracking alur CSSD (urut kiri→kanan) yang ditampilkan ke pengguna.
type Stage = { key: string; label: string; icon: LucideIcon }

const STAGES: Stage[] = [
  { key: "diterima", label: "Diterima", icon: Inbox },
  { key: "dicuci", label: "Dicuci", icon: Droplets },
  { key: "packaging", label: "Packaging", icon: Package },
  { key: "steril", label: "Steril", icon: ShieldCheck },
  { key: "distribusi", label: "Distribusi", icon: Truck },
]

// Pemetaan status order (DB) → indeks tahap yang sedang berjalan (0-based).
// -1 berarti belum masuk pipeline (masih "diajukan") atau dibatalkan.
function activeStageIndex(status: OrderStatus): number {
  switch (status) {
    case "pencucian":
      return 1 // sudah diterima, sedang dicuci
    case "pengemasan":
      return 2 // selesai cuci, sedang packaging
    case "selesai":
    case "sterilisasi":
    case "steril":
    case "digudang":
      return 3 // tahap steril / gudang steril
    case "dipinjam":
    case "dikembalikan":
      return 4 // sudah terdistribusi
    default:
      return -1 // diajukan / dibatalkan
  }
}

/**
 * Stepper horizontal tracking order CSSD: Diterima → Dicuci → Packaging →
 * Steril → Distribusi. Tahap yang sudah dilewati ditandai centang, tahap
 * berjalan disorot, sisanya abu-abu. Status "diajukan" = menunggu diterima,
 * "dibatalkan" = order dibatalkan.
 */
export function OrderStatusTracker({ status }: { status: OrderStatus }) {
  if (status === "dibatalkan") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        <X className="h-4 w-4 shrink-0" />
        Order dibatalkan — tidak diproses lebih lanjut.
      </div>
    )
  }

  const activeIndex = activeStageIndex(status)

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      {status === "diajukan" && (
        <p className="mb-3 text-xs font-medium text-amber-600">
          Menunggu pesanan diterima CSSD.
        </p>
      )}
      <ol className="flex items-center">
        {STAGES.map((stage, i) => {
          const done = i < activeIndex
          const active = i === activeIndex
          const Icon = stage.icon
          return (
            <li key={stage.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors " +
                    (done
                      ? "border-[#4ba69d] bg-[#4ba69d] text-white"
                      : active
                        ? "border-[#075489] bg-[#075489] text-white"
                        : "border-gray-200 bg-gray-50 text-gray-300")
                  }
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span
                  className={
                    "text-center text-[11px] font-medium " +
                    (done
                      ? "text-[#4ba69d]"
                      : active
                        ? "text-[#075489]"
                        : "text-gray-400")
                  }
                >
                  {stage.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className={
                    "mx-1 -mt-5 h-0.5 flex-1 rounded " +
                    (i < activeIndex ? "bg-[#4ba69d]" : "bg-gray-200")
                  }
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

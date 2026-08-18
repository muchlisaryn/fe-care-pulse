import type { OrderStatus } from "@/lib/store/slices/orderSlice"

/**
 * Kunci kamus untuk tiap status order — labelnya dibaca lewat `t()` agar ikut
 * bahasa aktif. Dipusatkan di sini karena status yang sama dipakai di halaman
 * order, tracking, papan monitor, dan badge status.
 */
export const statusLabelKey: Record<OrderStatus, string> = {
  diajukan: "orderInstrument.statusSubmitted",
  pencucian: "orderInstrument.statusCleaning",
  pengemasan: "orderInstrument.statusPackaging",
  selesai: "orderInstrument.statusReadySterilize",
  sterilisasi: "orderInstrument.statusSterilizing",
  steril: "orderInstrument.statusSterile",
  digudang: "orderInstrument.statusReadyDistribute",
  dipinjam: "orderInstrument.statusDistributed",
  dikembalikan: "orderInstrument.statusReturned",
  dibatalkan: "orderInstrument.statusCanceled",
}

/** Label status untuk nilai apa pun dari server — nilai tak dikenal tampil apa adanya. */
export function orderStatusLabel(
  status: string,
  t: (key: string) => string,
): string {
  const key = statusLabelKey[status as OrderStatus]
  return key ? t(key) : status
}

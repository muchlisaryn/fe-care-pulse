/**
 * Sifat tarif (`rates.fee_type`) — satu-satunya tempat nilainya ditulis.
 *
 * Nilainya harus persis sama dengan konstanta di backend
 * (`App\Models\Rate::FEE_TYPE_*`); menyebarnya sebagai string mentah di tiap
 * halaman membuat salah ketik baru ketahuan saat data gagal tersimpan.
 */

export const FEE_TYPE = {
  recurring: "recurring",
  oneTime: "one_time",
} as const;

export type FeeType = (typeof FEE_TYPE)[keyof typeof FEE_TYPE];

type Penerjemah = (key: string, vars?: Record<string, string | number>) => string;

/** Pilihan untuk dropdown Master Tarif. */
export function feeTypeOptions(t: Penerjemah) {
  return [
    { value: FEE_TYPE.recurring, label: t("nafsulMaster.feeTypeRecurring") },
    { value: FEE_TYPE.oneTime, label: t("nafsulMaster.feeTypeOneTime") },
  ];
}

/**
 * Label untuk kolom tabel.
 *
 * `null` bukan data rusak melainkan tarif lama yang belum diklasifikasi —
 * ditandai "belum diatur" supaya bedanya terlihat, bukan disamarkan jadi strip
 * seperti kolom kosong biasa.
 */
export function renderFeeType(nilai: unknown, t: Penerjemah): string {
  if (nilai === FEE_TYPE.recurring) return t("nafsulMaster.feeTypeRecurring");
  if (nilai === FEE_TYPE.oneTime) return t("nafsulMaster.feeTypeOneTime");
  return t("nafsulMaster.feeTypeUnset");
}

/** Tarif tanpa periode: form transaksi menyembunyikan isian bulan untuk ini. */
export function isSekaliBayar(nilai: unknown): boolean {
  return nilai === FEE_TYPE.oneTime;
}

// Alasan batch sterilisasi BMHP dinyatakan gagal — sama dengan
// SterilizationBmhp::FAILURE_REASONS di backend. Dipakai tab Sterilisasi (form
// validasi & detail batch) dan tab Packaging (keterangan kemasan gagal steril).
export const FAILURE_REASONS: { value: string; label: string }[] = [
  { value: "indikator_kimia", label: "Indikator kimia gagal" },
  { value: "indikator_biologi", label: "Indikator biologi gagal" },
  { value: "bowie_dick", label: "Uji Bowie-Dick gagal" },
  { value: "mesin_error", label: "Mesin error / siklus terhenti" },
  { value: "kemasan_basah", label: "Kemasan basah" },
  { value: "kemasan_rusak", label: "Kemasan rusak / sobek" },
  { value: "lainnya", label: "Lainnya" },
]

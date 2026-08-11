/**
 * Bentuk data permintaan order instrumen yang dipakai bersama halaman "Tambah Order
 * Instrumen" dan kartu per pasiennya (`PatientRequestCard`).
 *
 * Satu order dibuat PER PASIEN: identitas pasien + daftar permintaannya = satu record
 * order. Karena itu daftar permintaan disimpan di dalam grup pasien, bukan sebagai
 * satu daftar tunggal milik halaman.
 */

/** Jenis permintaan: instrumen satuan atau paket (katalog tipe `paket`). */
export type AddMode = "satuan" | "paket"

/** Jenis instrumen (master) — dipakai untuk permintaan satuan. */
export type InstrumentType = {
  id: number
  code: string
  name: string
  available_stocks_count?: number // jumlah unit berstatus `tersedia`
  available_sterile_count?: number // jumlah unit STERIL siap-order (di gudang steril)
}

/** Katalog paket instrumen (Master › Katalog Instrumen, tipe `paket`). */
export type PaketCatalog = {
  id: number
  code: string
  name: string
  items_count?: number
  available_sets?: number // set yang bisa dipenuhi dari stok tersedia
  available_sterile_sets?: number // set yang bisa dipenuhi dari stok STERIL
}

/** Rincian isi paket (jenis instrumen + jumlah per set), dari endpoint show katalog. */
export type PaketItem = {
  instrument_id: number
  quantity: number
  instrument?: { id: number; code: string; name: string } | null
}

/** Isi paket per baris permintaan: nama instrumen + jumlah per satu set paket. */
export type PaketContent = { name: string; perSet: number }

/** Baris permintaan: hanya jumlah. Unit fisik di-generate saat CSSD menerima pesanan. */
export type RequestLine = {
  type: AddMode
  refId: number // instrument_id (satuan) / instrument_catalog_id (paket)
  name: string
  quantity: string // disimpan sebagai teks agar boleh kosong; divalidasi saat simpan
  contents?: PaketContent[] // isi paket (instrumen yang akan di-order) — untuk type paket
}

/**
 * Satu pasien beserta permintaannya → menjadi SATU record order saat disimpan.
 * `id` hanya kunci lokal untuk React, tidak dikirim ke server.
 */
export type PatientGroup = {
  id: string
  medicalRecordNo: string
  patientName: string
  requests: RequestLine[]
}

/** Grup pasien baru yang masih kosong. */
export function emptyPatientGroup(): PatientGroup {
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    medicalRecordNo: "",
    patientName: "",
    requests: [],
  }
}

/**
 * Warna aksen kartu pasien — dipakai bergiliran sesuai urutan pasien pada form
 * supaya satu order mudah dibedakan dari order pasien lain (garis tepi + nomor
 * urut + latar kepala kartu memakai warna yang sama). Dua warna pertama adalah
 * warna merek; sisanya dipakai bila pasiennya lebih dari dua.
 */
export const PATIENT_ACCENTS = ["#4ba69d", "#075489", "#b45309", "#7c3aed", "#be123c"] as const

/** Warna aksen untuk pasien ke-`index` (berulang bila pasiennya banyak). */
export function patientAccent(index: number): string {
  return PATIENT_ACCENTS[index % PATIENT_ACCENTS.length]
}

/** Panjang maksimal No. Rekam Medis. */
export const MAX_RM_LENGTH = 10

/**
 * No. Rekam Medis hanya berisi ANGKA, maksimal 10 digit. Disaring saat mengetik
 * (bukan divalidasi saat simpan) supaya prefiks seperti "RM-" yang terlanjur
 * diketik/di-paste langsung rontok, dan kelebihan digit tidak sempat masuk —
 * nomor RM yang tersimpan jadi seragam dan bisa dicocokkan antar sistem.
 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_RM_LENGTH)
}

/** Total jumlah unit/set pada satu daftar permintaan. */
export function totalQtyOf(requests: RequestLine[]): number {
  return requests.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
}

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"
import type { PipelineDateRange } from "./cleaningSlice"

// Ringkasan isi batch (chip kartu): jenis + jumlahnya. Untuk paket, `quantity`
// adalah jumlah SET, bukan jumlah instrumen di dalamnya.
export type ProdPackagingItem = {
  type: "satuan" | "paket"
  name: string
  quantity: number
}

// Unit fisik yang terkunci pada batch (dari tahap Produksi).
export type ProdPackagingUnit = {
  id: number
  source: "satuan" | "paket"
  package_name: string | null
  // Set ke-berapa dalam batch (1, 2, ...). Unit dalam satu set berbagi nomor sama.
  package_no: number | null
  instrument_stock_id: number | null
  code: string | null
  // Nama instrumen dari snapshot production_item (label checklist inspeksi).
  name: string | null
  // Foto paket (unit paket) / foto instrumen (unit satuan) — snapshot dari produksi.
  image_url: string | null
  instrument: { id: number; name: string; image_url?: string | null } | null
  status: string | null
  condition_out: { id: number; name: string } | null
}

// Batch pada tahap Inspection & Packaging pipeline produksi. Dua kemungkinan asal:
// record `packaging` yang sudah dibuat (`started: true`), atau batch cleaning selesai
// yang masih antre diinspeksi (`started: false`) — yang terakhir belum punya id/code
// sampai endpoint `packaging/start` dipanggil.
export type ProdPackagingBatch = {
  id: number | null
  code: string | null // PKG+ymd+urutan harian
  code_transaction: string | null // PRD+ymd+urutan harian
  washing_code: string | null
  // false = record packaging belum dibuat (masih antrean menunggu inspeksi).
  started: boolean
  // Ronde pengemasan batch cleaning yang sama: 1 = pertama, 2+ = pengemasan ulang
  // (RPK) setelah ada unit yang gagal steril.
  round: number
  status: "pengemasan"
  stage_status: "diproses" | "selesai" // 'selesai' = batch sudah dikemas, label bisa dilihat ulang
  borrowed_by: string | null
  processed_at: string | null
  processed_by: string | null
  completed_by: string | null // petugas yang menyelesaikan pengemasan
  completed_at: string | null
  operator: string | null
  chemical_indicator: string | null // = No. Lot indikator kimia
  packaging_type_id: number | null // FK master jenis kemasan
  packaging_type_label: string | null // nama jenis kemasan dari master
  packaged_at: string | null
  expiry_date: string | null // tgl kedaluwarsa steril, dari masa simpan jenis kemasan
  units_count: number
  items: ProdPackagingItem[]
  units: ProdPackagingUnit[]
}

// Satu label sterilisasi (per unit) yang dicetak setelah packaging selesai.
export type ProdSterilLabelItem = {
  id: number | null // id packaging_item — null utk batch lama tanpa detail packaging_item
  instrument_name: string
  unit_code: string | null
  source: "satuan" | "paket"
  package_name: string | null
  // Nomor set dalam batch produksi (production_item.package_no) — bagian akhir
  // kode label. null untuk batch lama yang belum punya penomoran set.
  package_no: number | null
  // Nomor tersimpan di packaging_item: prefix + kode packaging + nomor set tanpa
  // spasi. Inilah isi barcode yang terbaca saat dipindai.
  barcode_no: string
}

// Satu pilihan jenis kemasan dari master — masa simpannya menentukan tgl
// kedaluwarsa steril. `value` = id master jenis kemasan.
export type PackagingType = {
  value: number
  label: string
  shelf_life_days: number
}

// Payload label sterilisasi yang dikembalikan endpoint complete.
export type ProdSterilLabel = {
  batch: string
  packaging_code: string // gabungan prefix + angka, untuk keperluan tampilan
  // Dipakai menyusun kode label: prefix & angka sengaja dipisah, tidak digabung.
  packaging_prefix: string
  packaging_number: string
  set_name: string
  packer: string | null
  packaging_type: string | null
  packaged_at: string
  expiry_date: string
  chemical_indicator: string | null
  items: ProdSterilLabelItem[]
}

type State = {
  items: ProdPackagingBatch[]
  loading: boolean
  loaded: boolean
}

const initialState: State = { items: [], loading: false, loaded: false }

// Ambil seluruh halaman lalu gabungkan (selaras dengan slice pipeline lain).
async function fetchAllPages<T>(url: string, range: PipelineDateRange = {}): Promise<T[]> {
  const collected: T[] = []
  let current = 1
  let last = 1
  do {
    const res = await api.get(url, { params: { page: current, ...range } })
    const payload = res.data.data
    collected.push(...payload.data)
    last = payload.last_page
    current += 1
  } while (current <= last)
  return collected
}

export const fetchProductionPackaging = createAsyncThunk(
  "productionPackaging/fetch",
  (range: PipelineDateRange = {}) => fetchAllPages<ProdPackagingBatch>("/master/packaging", range),
)

const productionPackagingSlice = createSlice({
  name: "productionPackaging",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProductionPackaging.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchProductionPackaging.fulfilled, (state, action) => {
        state.items = action.payload
        state.loading = false
        state.loaded = true
      })
      .addCase(fetchProductionPackaging.rejected, (state) => {
        state.loading = false
      })
  },
})

export default productionPackagingSlice.reducer

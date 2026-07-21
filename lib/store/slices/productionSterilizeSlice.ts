import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"
import type { PipelineDateRange } from "./cleaningSlice"

// Unit fisik yang akan / sedang disterilkan.
export type ProdSterilizeUnit = {
  id: number
  instrument_stock_id: number | null // dipakai untuk validasi hasil per-unit
  code: string | null
  instrument: string | null
  image_url?: string | null
  source: "satuan" | "paket"
  package_name: string | null
  // Nomor set dalam batch produksi — jumlah nomor unik = jumlah SET paket.
  package_no: number | null
  // Nomor label fisik dari packaging_item. Baris pada kartu dikelompokkan per
  // nomor ini: satu barcode = satu kemasan/label.
  barcode_no: string | null
}

// Batch sterilisasi terbaru sebuah PKG (saat status "sterilisasi" = menunggu validasi).
export type ProdSterilizeBatch = {
  id: number
  code: string // STR-NNN
  machine: string | null
  method: string | null
  cycle_number: string | null
  temperature: string | null
  duration_minutes: number | null
  sterilized_at: string | null
  expiry_date: string | null
  chemical_indicator: string | null
  biological_indicator: string | null
  bio_indicator_control: string | null // indikator biologi pembanding (Negatif/Positif)
  bio_indicator_test: string | null // indikator biologi uji (Negatif/Positif)
  note: string | null
  status: "diproses" | "selesai" | "gagal"
  processed_by: string | null // petugas yang membuat/menjalankan batch
  validated_by: string | null // petugas yang memvalidasi hasil
  validated_at: string | null
}

// Batch produksi (PKG) pada pipeline sterilisasi:
// - "selesai"     = siap dibuatkan batch steril
// - "sterilisasi" = batch dibuat, menunggu validasi (Steril / Gagal)
export type ProdSterilizeOrder = {
  // ready → id PKG (untuk dipilih ke batch); batch → id STR (untuk validasi).
  // Untuk entri re-proses (unit lepas gagal steril): id sintetis, pakai stock_id.
  id: number
  // "ready" = PKG siap-steril / unit re-proses; "batch" = batch STR menunggu validasi.
  kind: "ready" | "batch"
  reprocess?: boolean // true = unit lepas hasil gagal steril yang antre re-proses
  stock_id?: number | null // instrument_stock_id (hanya untuk entri reprocess)
  code: string // kode PKG (ready) / STR (batch)
  // Nomor label kemasan — identitas baris siap-steril, dipakai saat mencentang &
  // dikirim sebagai `barcode_nos` waktu membuat batch. null untuk kartu batch STR.
  barcode_no?: string | null
  // Nama label: nama paket (unit paket) / nama instrumen (unit satuan), dari
  // relasi production_item.
  name?: string | null
  code_transaction: string | null // PRD-NNN (bisa gabungan)
  status: "selesai" | "sterilisasi"
  borrowed_by: string | null
  image_url?: string | null
  processed_at: string | null
  unit_count: number
  units: ProdSterilizeUnit[]
  sterilization: ProdSterilizeBatch | null
}

type State = {
  items: ProdSterilizeOrder[]
  loading: boolean
  loaded: boolean
}

const initialState: State = { items: [], loading: false, loaded: false }

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

export const fetchProductionSterilize = createAsyncThunk(
  "productionSterilize/fetch",
  (range: PipelineDateRange = {}) =>
    fetchAllPages<ProdSterilizeOrder>("/master/sterilization-pipeline", range),
)

const productionSterilizeSlice = createSlice({
  name: "productionSterilize",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProductionSterilize.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchProductionSterilize.fulfilled, (state, action) => {
        state.items = action.payload
        state.loading = false
        state.loaded = true
      })
      .addCase(fetchProductionSterilize.rejected, (state) => {
        state.loading = false
      })
  },
})

export default productionSterilizeSlice.reducer

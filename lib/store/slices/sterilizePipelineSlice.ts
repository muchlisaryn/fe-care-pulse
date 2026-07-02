import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Unit fisik (order_item) yang akan disterilkan.
export type SterilizeUnit = {
  id: number
  code: string | null
  instrument: string | null
  image_url?: string | null
  source: "satuan" | "paket"
  package_name: string | null
}

// Batch sterilisasi terbaru sebuah order (saat status "sterilisasi" = menunggu validasi).
export type SterilizeBatch = {
  id: number
  code: string
  machine: string | null
  method: string | null
  cycle_number: string | null
  temperature: string | null
  duration_minutes: number | null
  sterilized_at: string | null
  expiry_date: string | null
  chemical_indicator: string | null
  biological_indicator: string | null
  status: "diproses" | "selesai" | "gagal"
}

// Order pada pipeline sterilisasi:
// - "selesai"     = siap dibuatkan batch
// - "sterilisasi" = batch dibuat, menunggu validasi (Steril / Gagal)
export type SterilizeOrder = {
  id: number
  code: string
  code_transaction: string | null
  status: "selesai" | "sterilisasi"
  borrowed_by: string | null
  // Gambar set/instrumen utama batch (untuk header kartu). Opsional (order-based null).
  image_url?: string | null
  // Opsional: pipeline produksi (batch PKG) tidak punya ruangan / tanggal order.
  room?: { id: number; name: string } | null
  order_date?: string | null
  processed_at: string | null
  unit_count: number
  units: SterilizeUnit[]
  sterilization: SterilizeBatch | null
}

type SterilizePipelineState = {
  items: SterilizeOrder[]
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: SterilizePipelineState = {
  items: [],
  loading: false,
  loaded: false,
  dirty: false,
}

// Ambil seluruh halaman lalu gabungkan jadi satu array (selaras dengan slice cleaning).
async function fetchAllPages<T>(url: string): Promise<T[]> {
  const collected: T[] = []
  let current = 1
  let last = 1
  do {
    const res = await api.get(url, { params: { page: current } })
    const payload = res.data.data
    collected.push(...payload.data)
    last = payload.last_page
    current += 1
  } while (current <= last)
  return collected
}

export const fetchSterilizePipeline = createAsyncThunk("sterilizePipeline/fetch", () =>
  fetchAllPages<SterilizeOrder>("/master/orders/ready-to-sterilize"),
)

const sterilizePipelineSlice = createSlice({
  name: "sterilizePipeline",
  initialState,
  reducers: {
    invalidateSterilizePipeline(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSterilizePipeline.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchSterilizePipeline.fulfilled, (state, action) => {
        state.items = action.payload
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchSterilizePipeline.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { invalidateSterilizePipeline } = sterilizePipelineSlice.actions
export default sterilizePipelineSlice.reducer

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Unit fisik yang akan / sedang disterilkan.
export type ProdSterilizeUnit = {
  id: number
  code: string | null
  instrument: string | null
  image_url?: string | null
  source: "satuan" | "paket"
  package_name: string | null
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
  status: "diproses" | "selesai" | "gagal"
}

// Batch produksi (PKG) pada pipeline sterilisasi:
// - "selesai"     = siap dibuatkan batch steril
// - "sterilisasi" = batch dibuat, menunggu validasi (Steril / Gagal)
export type ProdSterilizeOrder = {
  // ready → id PKG (untuk dipilih ke batch); batch → id STR (untuk validasi).
  id: number
  // "ready" = PKG siap-steril; "batch" = batch STR menunggu validasi.
  kind: "ready" | "batch"
  code: string // PKG-NNN (ready) / STR-NNN (batch)
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

export const fetchProductionSterilize = createAsyncThunk("productionSterilize/fetch", () =>
  fetchAllPages<ProdSterilizeOrder>("/master/sterilization-pipeline"),
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

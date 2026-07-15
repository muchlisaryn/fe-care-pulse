import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Ringkasan isi batch (chip kartu): jenis + jumlah unit.
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
  instrument_stock_id: number | null
  code: string | null
  instrument: { id: number; name: string; image_url?: string | null } | null
  status: string | null
  condition_out: { id: number; name: string } | null
}

// Batch pada tahap Inspection & Packaging (record PKG-NNN) pipeline produksi.
export type ProdPackagingBatch = {
  id: number
  code: string // PKG-NNN
  code_transaction: string | null // PRD-NNN
  washing_code: string | null
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
  instrument_name: string
  unit_code: string | null
  source: "satuan" | "paket"
  package_name: string | null
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
  packaging_code: string
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

export const fetchProductionPackaging = createAsyncThunk("productionPackaging/fetch", () =>
  fetchAllPages<ProdPackagingBatch>("/master/packaging"),
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

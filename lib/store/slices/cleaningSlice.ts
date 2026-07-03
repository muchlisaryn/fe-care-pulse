import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type WashingStatus = "dalam_proses" | "selesai" | "gagal"

export type WashingRecord = {
  id: number
  washer_machine_id: number | null
  washer_machine: { id: number; code: string; name: string } | null
  machine_no: string | null
  operator: string | null
  temperature: string | null
  washed_at: string | null
  duration_minutes: number | null
  detergent_type: string | null
  status: WashingStatus
  alert: boolean
  alert_message: string | null
  failure_reason: string | null
  completed_at: string | null
}

export type CleaningItem = {
  type: "satuan" | "paket"
  name: string
  quantity: number
}

// Unit fisik yang dikunci ke batch (terisi untuk batch Produksi CSSD; kosong
// untuk order peminjaman yang unitnya baru di-generate saat Packaging).
export type CleaningUnit = {
  id: number
  source: "satuan" | "paket"
  package_name: string | null
  instrument_stock_id: number | null
  code: string | null
  instrument: { id: number; name: string; image_url?: string | null } | null
  status: string | null
  condition_out: { id: number; name: string } | null
}

// Order pada tahap Cleaning & Pengemasan (status pencucian / pengemasan).
export type CleaningOrder = {
  id: number
  code: string
  code_transaction: string | null
  status: "pencucian" | "pengemasan"
  stage_status: "proses" | "selesai" // 'selesai' = riwayat cleaning (sudah lanjut)
  borrowed_by: string | null
  room: { id: number; name: string } | null
  order_date: string | null
  processed_at: string | null
  processed_by: string | null
  requested_qty: number
  request_lines: number
  items: CleaningItem[]
  units_count: number
  units: CleaningUnit[]
  washing: WashingRecord | null
}

type CleaningState = {
  items: CleaningOrder[]
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: CleaningState = {
  items: [],
  loading: false,
  loaded: false,
  dirty: false,
}

// Ambil seluruh halaman lalu gabungkan jadi satu array (selaras dengan slice monitoring).
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

export const fetchCleaning = createAsyncThunk("cleaning/fetch", () =>
  fetchAllPages<CleaningOrder>("/master/cleaning"),
)

const cleaningSlice = createSlice({
  name: "cleaning",
  initialState,
  reducers: {
    invalidateCleaning(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCleaning.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchCleaning.fulfilled, (state, action) => {
        state.items = action.payload
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchCleaning.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { invalidateCleaning } = cleaningSlice.actions
export default cleaningSlice.reducer

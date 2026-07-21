import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type WashingStatus = "dalam_proses" | "selesai" | "gagal" | "batal"

export type WashingRecord = {
  id: number
  washer_machine_id: number | null
  washer_machine: { id: number; name: string } | null
  operator: string | null
  temperature: string | null
  washed_at: string | null
  duration_minutes: number | null
  detergent_type: string | null
  status: WashingStatus
  alert: boolean
  alert_message: string | null
  failure_reason: string | null
  // Jejak pelaku tiap aksi + waktunya.
  started_by: string | null
  started_at: string | null
  completed_by: string | null
  completed_at: string | null
  canceled_by: string | null
  canceled_at: string | null
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
  // Nomor satuan pesanan dalam batch (1, 2, ...): satu nomor per qty, baik satuan
  // maupun paket. Unit dalam satu set berbagi nomor yang sama.
  package_no: number | null
  instrument_stock_id: number | null
  // Snapshot dari production_item — nama, kode & foto dibekukan saat batch
  // dibuat, tidak ikut berubah bila master instrumen diubah/dihapus.
  name: string | null
  code: string | null
  // Foto paket (unit paket) / foto instrumen (unit satuan) — satu kolom di DB.
  image_url: string | null
  status: string | null
  condition_out: { id: number; name: string } | null
}

// Order pada tahap Cleaning & Pengemasan (status pencucian / pengemasan).
export type CleaningOrder = {
  id: number
  code: string
  code_transaction: string | null
  status: "pencucian" | "pengemasan"
  stage_status: "proses" | "selesai" | "batal" // 'selesai'/'batal' = riwayat cleaning
  borrowed_by: string | null
  note: string | null // Catatan (opsional) dari tahap Mulai Produksi.
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

// Rentang tanggal yang disaring BACKEND. Pencarian teks sengaja tidak dikirim —
// penyaringannya murni di frontend supaya instan tanpa request ulang.
export type PipelineDateRange = { date_from?: string; date_to?: string }

// Ambil seluruh halaman lalu gabungkan jadi satu array (selaras dengan slice monitoring).
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

export const fetchCleaning = createAsyncThunk("cleaning/fetch", (range: PipelineDateRange = {}) =>
  fetchAllPages<CleaningOrder>("/master/cleaning", range),
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

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

/**
 * Alat Kedaluwarsa Steril (/cssd/kedaluwarsa).
 *
 * API-nya BERDIRI SENDIRI (`/master/sterile-expiry`) — bukan endpoint Storage Steril
 * (`/master/storage/*`) maupun CRUD sterilisasi (`/master/sterilizations/*`). Datanya
 * memang berasal dari gudang steril yang sama, tapi bentuk & penyaringnya khusus
 * halaman ini, jadi sengaja tidak dijadikan satu endpoint.
 */

/** Satu baris daftar = satu batch steril di gudang yang sudah/akan kedaluwarsa. */
export type SterileExpiryBatch = {
  /** id batch sterilisasi; 0 = baris gudang lama tanpa batch. */
  id: number
  code: string | null
  machine: string | null
  method: string | null
  sterilized_at: string | null
  expiry_date: string | null
  /** Sisa hari dari server; negatif = sudah lewat. */
  days_to_expiry: number | null
  expired: boolean
  alert: boolean
  /**
   * Jumlah unit menurut aturan tampilan: satu SET dihitung 1 (berapa pun instrumen
   * di dalamnya) dan satu instrumen satuan dihitung 1.
   */
  item_count: number
  /** Rincian `item_count`: berapa set paket + berapa instrumen satuan. */
  set_count: number
  unit_count: number
  /** Jumlah instrumen fisik (isi set dijabarkan) — keterangan tambahan saja. */
  instrument_count: number
  racks: string[]
}

/** Angka kartu statistik — dihitung server dengan aturan hitung yang sama. */
export type SterileExpirySummary = {
  batches: number
  items: number
  expired: number
  alert: number
}

type SterileExpiryState = {
  items: SterileExpiryBatch[]
  page: number
  lastPage: number
  total: number
  loading: boolean
  loaded: boolean
  summary: SterileExpirySummary
}

const initialState: SterileExpiryState = {
  items: [],
  page: 1,
  lastPage: 1,
  total: 0,
  loading: false,
  loaded: false,
  summary: { batches: 0, items: 0, expired: 0, alert: 0 },
}

/** Argumen: halaman, kata kunci & ambang hari — ketiganya disaring di server. */
export type SterileExpiryArg = { page?: number; search?: string; days?: number }

export const fetchSterileExpiry = createAsyncThunk(
  "sterileExpiry/list",
  async ({ page = 1, search, days }: SterileExpiryArg = {}) => {
    const res = await api.get("/master/sterile-expiry", {
      params: { page, search: search || undefined, days },
    })
    const p = res.data.data
    return {
      items: p.data as SterileExpiryBatch[],
      page: p.current_page as number,
      lastPage: p.last_page as number,
      total: p.total as number,
    }
  },
)

export const fetchSterileExpirySummary = createAsyncThunk(
  "sterileExpiry/summary",
  async ({ days }: { days?: number } = {}) => {
    const res = await api.get("/master/sterile-expiry/summary", { params: { days } })
    return res.data.data as SterileExpirySummary
  },
)

// Tanpa penanda cache/`dirty`: masa kedaluwarsa berubah tiap hari & isi gudang
// berubah oleh petugas lain, jadi halaman ini selalu mengambil data baru.
const sterileExpirySlice = createSlice({
  name: "sterileExpiry",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSterileExpiry.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchSterileExpiry.fulfilled, (state, action) => {
        state.items = action.payload.items
        state.page = action.payload.page
        state.lastPage = action.payload.lastPage
        state.total = action.payload.total
        state.loading = false
        state.loaded = true
      })
      .addCase(fetchSterileExpiry.rejected, (state) => {
        state.loading = false
      })
      .addCase(fetchSterileExpirySummary.fulfilled, (state, action) => {
        state.summary = action.payload
      })
  },
})

export default sterileExpirySlice.reducer

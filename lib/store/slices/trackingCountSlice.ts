import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Angka badge tab "Distribution & Tracking" (halaman Tracking Order).
//
// Slice & endpointnya sengaja BERDIRI SENDIRI, terpisah dari monitoringSlice yang
// menyuplai badge tab "Order Masuk": aturan hitung kedua tab berbeda, jadi
// perubahan di satu tab tidak boleh ikut menggeser angka di tab lain.
//
// Angka dihitung server dari JEJAK WAKTU (processed_at / distributed_at /
// is_returned per unit), bukan dari kolom `status` yang bisa tertinggal.
export type TrackingCounts = {
  /** Sudah diproses CSSD, belum diantar ke unit pelayanan. */
  siap_distribusi: number
  /** Sudah diantar & masih ada unit yang belum dikembalikan. */
  dipinjam: number
  /** siap_distribusi + dipinjam — angka yang dipajang badge. */
  total: number
}

type TrackingCountState = {
  counts: TrackingCounts
  loading: boolean
}

const initialState: TrackingCountState = {
  counts: { siap_distribusi: 0, dipinjam: 0, total: 0 },
  loading: false,
}

// `from`/`to` mengikuti filter rentang tanggal halaman (disaring pada `order_date`)
// supaya angka badge selalu sebanding dengan isi daftarnya.
export const fetchTrackingCounts = createAsyncThunk(
  "trackingCount/fetch",
  async (range: { from?: string; to?: string } = {}) => {
    const res = await api.get("/master/tracking-order/counts", {
      params: { from: range.from || undefined, to: range.to || undefined },
    })
    return res.data.data as TrackingCounts
  },
)

const trackingCountSlice = createSlice({
  name: "trackingCount",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTrackingCounts.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchTrackingCounts.fulfilled, (state, action) => {
        state.counts = action.payload
        state.loading = false
      })
      .addCase(fetchTrackingCounts.rejected, (state) => {
        state.loading = false
      })
  },
})

export default trackingCountSlice.reducer

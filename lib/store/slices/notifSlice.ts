import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"
import { fetchMonitoringIncoming } from "./monitoringSlice"

// Notifikasi global: jumlah order masuk (diajukan/disetujui) yang perlu diproses
// CSSD + jumlah permintaan pinjam-alih masuk yang menunggu ACC. Dipoll dari
// AppLayout, ditampilkan sebagai badge di sidebar / halaman order.
type NotifState = {
  incomingCount: number
  pendingTransferCount: number
  loaded: boolean
}

const initialState: NotifState = {
  incomingCount: 0,
  pendingTransferCount: 0,
  loaded: false,
}

// Endpoint ringan (hanya angka) — dipanggil sering: saat mount, tab kembali fokus,
// order baru masuk, dan setelah order diterima/dibatalkan/dihapus.
export const fetchIncomingCount = createAsyncThunk("notif/incomingCount", async () => {
  const res = await api.get("/master/monitoring/incoming-count")
  return (res.data.data.count as number) ?? 0
})

export const fetchPendingTransferCount = createAsyncThunk("notif/pendingTransferCount", async () => {
  const res = await api.get("/master/order-transfers/incoming-count")
  return (res.data.data.count as number) ?? 0
})

const notifSlice = createSlice({
  name: "notif",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchIncomingCount.fulfilled, (state, action) => {
        state.incomingCount = action.payload
        state.loaded = true
      })
      .addCase(fetchPendingTransferCount.fulfilled, (state, action) => {
        state.pendingTransferCount = action.payload
      })
      // Halaman Tracking Order memuat SELURUH order masuk (semua halaman), jadi
      // panjang daftarnya adalah angka yang sama persis dengan badge. Disinkronkan
      // di sini supaya badge tak pernah menampilkan sisa notifikasi untuk order yang
      // sudah tidak ada di daftar — termasuk turun ke 0 (badge hilang) saat kosong.
      .addCase(fetchMonitoringIncoming.fulfilled, (state, action) => {
        state.incomingCount = action.payload.length
        state.loaded = true
      })
  },
})

export default notifSlice.reducer

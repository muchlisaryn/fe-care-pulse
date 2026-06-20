import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

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

export const fetchIncomingCount = createAsyncThunk("notif/incomingCount", async () => {
  const res = await api.get("/master/monitoring/incoming", { params: { page: 1 } })
  return (res.data.data.total as number) ?? 0
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
  },
})

export default notifSlice.reducer

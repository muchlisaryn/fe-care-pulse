import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"
import type { TimelineEvent } from "@/components/molecules/OrderTimeline"

// Status order sesuai PRD §4.6 (order.status) + tahapan pipeline CSSD
// (pencucian → pengemasan → selesai) untuk tracking.
export const ORDER_STATUSES = [
  "diajukan",
  "pencucian",
  "pengemasan",
  "selesai",
  "sterilisasi",
  "steril",
  "digudang",
  "dipinjam",
  "dikembalikan",
  "dibatalkan",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type OrderItem = {
  id: number
  order_id: number
  instrument_stock_id: number
  source: "satuan" | "paket"
  package_name: string | null
  condition_out_id: number | null
  condition_in_id: number | null
  is_returned: boolean
  instrument_stock?: {
    id: number
    code: string
    instrument?: { id: number; code: string; name: string } | null
  } | null
  condition_out?: { id: number; name: string } | null
  condition_in?: { id: number; name: string } | null
}

// Baris permintaan (jumlah) yang diinput peminjam. Unit fisik (OrderItem)
// di-generate dari sini saat CSSD menerima pesanan.
export type OrderRequestItem = {
  id: number
  order_id: number
  type: "satuan" | "paket"
  instrument_id: number | null
  instrument_catalog_id: number | null
  package_name: string | null
  quantity: number
  instrument?: { id: number; code: string; name: string } | null
  catalog?: {
    id: number
    code: string
    name: string
    // Isi paket: jenis instrumen + jumlah per set.
    items?: {
      instrument_id: number
      quantity: number
      instrument?: { id: number; code: string; name: string } | null
    }[]
  } | null
}

export type Order = {
  id: number
  code: string
  // Kode transaksi barcode — null sampai order diterima CSSD (status keluar dari "diajukan").
  code_transaction: string | null
  room_id: number
  user_id: number | null
  order_date: string | null
  order_time: string | null
  return_plan_date: string | null
  return_actual_date: string | null
  borrowed_by: string | null
  returned_by: string | null
  status: OrderStatus
  note: string | null
  room?: { id: number; code: string | null; name: string } | null
  user?: { id: number; name: string } | null
  items?: OrderItem[]
  request_items?: OrderRequestItem[]
  items_count?: number
  paket_items_count?: number
  satuan_items_count?: number
  created_by: string | null
  updated_by: string | null
  // Jejak pembatalan (status "dibatalkan") — terpisah dari hapus (soft delete).
  canceled_at: string | null
  canceled_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string
  updated_at: string
  // Riwayat peminjaman (timeline event) — hanya tersedia dari endpoint detail/scan.
  timeline?: TimelineEvent[]
}

type OrderState = {
  items: Order[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  status: OrderStatus | "" // "" = semua status
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: OrderState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  status: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchOrders = createAsyncThunk("orders/fetch", async (_, { getState }) => {
  const { page, search, status } = (getState() as { orders: OrderState }).orders
  const res = await api.get("/master/orders", {
    params: { page, search: search || undefined, status: status || undefined },
  })
  return res.data.data
})

const orderSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    setOrderSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setOrderStatus(state, action: PayloadAction<OrderStatus | "">) {
      state.status = action.payload
      state.page = 1
      state.loaded = false
    },
    setOrderPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateOrders(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchOrders.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setOrderSearch, setOrderStatus, setOrderPage, invalidateOrders } = orderSlice.actions
export default orderSlice.reducer

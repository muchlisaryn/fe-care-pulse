import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Status permintaan pinjam-alih (handover) instrumen antar peminjam.
export type TransferStatus = "pending" | "accepted" | "rejected" | "canceled"

export type OrderTransferItem = {
  id: number
  order_transfer_id: number
  instrument_stock_id: number
  source: "satuan" | "paket"
  package_name: string | null
  instrument_stock?: {
    id: number
    code: string
    instrument?: { id: number; code: string; name: string } | null
  } | null
}

export type OrderTransfer = {
  id: number
  from_order_id: number
  holder_user_id: number
  requested_by_user_id: number
  to_room_id: number
  borrowed_by: string | null
  medical_record_no: string | null
  patient_name: string | null
  note: string | null
  status: TransferStatus
  responded_at: string | null
  new_order_id: number | null
  from_order?: { id: number; code: string; code_transaction: string | null; room?: { id: number; name: string } | null } | null
  to_room?: { id: number; name: string } | null
  requested_by?: { id: number; name: string } | null
  holder?: { id: number; name: string } | null
  items?: OrderTransferItem[]
  created_at: string
}

type OrderTransferState = {
  items: OrderTransfer[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  // "incoming" = permintaan masuk (saya pemegang), "outgoing" = permintaan saya ajukan.
  box: "incoming" | "outgoing"
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: OrderTransferState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  box: "incoming",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchOrderTransfers = createAsyncThunk("orderTransfers/fetch", async (_, { getState }) => {
  const { page, search, box } = (getState() as { orderTransfers: OrderTransferState }).orderTransfers
  const res = await api.get("/master/order-transfers", {
    params: { page, search: search || undefined, box, status: box === "incoming" ? "pending" : undefined },
  })
  return res.data.data
})

const orderTransferSlice = createSlice({
  name: "orderTransfers",
  initialState,
  reducers: {
    setTransferSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setTransferBox(state, action: PayloadAction<"incoming" | "outgoing">) {
      state.box = action.payload
      state.page = 1
      state.loaded = false
    },
    setTransferPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateOrderTransfers(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrderTransfers.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchOrderTransfers.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchOrderTransfers.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setTransferSearch, setTransferBox, setTransferPage, invalidateOrderTransfers } =
  orderTransferSlice.actions
export default orderTransferSlice.reducer

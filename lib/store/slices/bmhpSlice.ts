import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Bmhp = {
  id: number
  code: string
  name: string
  // Satuan merujuk master satuan; `unit` adalah namanya, dikirim server.
  unit_id: number | null
  unit: string | null
  // Harga satuan (rupiah).
  price: number
  created_at: string
  updated_at: string
}

type BmhpState = {
  items: Bmhp[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: BmhpState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchBmhps = createAsyncThunk("bmhps/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { bmhps: BmhpState }).bmhps
  const res = await api.get("/master/bmhps", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const bmhpSlice = createSlice({
  name: "bmhps",
  initialState,
  reducers: {
    setBmhpSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setBmhpPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateBmhps(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBmhps.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchBmhps.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchBmhps.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setBmhpSearch, setBmhpPage, invalidateBmhps } = bmhpSlice.actions
export default bmhpSlice.reducer

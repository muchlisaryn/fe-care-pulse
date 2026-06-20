import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Instrument = {
  id: number
  code: string
  name: string
  image_url: string | null
  stocks_count: number
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string
  updated_at: string
}

// Urutan daftar instrumen berdasarkan jumlah unit stok.
export type InstrumentSort = "" | "stock_asc" | "stock_desc"

type InstrumentState = {
  items: Instrument[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  sortBy: InstrumentSort
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: InstrumentState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  sortBy: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchInstruments = createAsyncThunk("instruments/fetch", async (_, { getState }) => {
  const { page, search, sortBy } = (getState() as { instruments: InstrumentState }).instruments
  const res = await api.get("/master/instruments", {
    params: { page, search: search || undefined, sort: sortBy || undefined },
  })
  return res.data.data
})

const instrumentSlice = createSlice({
  name: "instruments",
  initialState,
  reducers: {
    setInstrumentSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setInstrumentPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    setInstrumentSort(state, action: PayloadAction<InstrumentSort>) {
      state.sortBy = action.payload
      state.page = 1
      state.loaded = false
    },
    invalidateInstruments(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInstruments.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchInstruments.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchInstruments.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setInstrumentSearch, setInstrumentPage, setInstrumentSort, invalidateInstruments } =
  instrumentSlice.actions
export default instrumentSlice.reducer

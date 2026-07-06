import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Rack = {
  id: number
  name: string
  note: string | null
  created_at: string
  updated_at: string
}

type RackState = {
  items: Rack[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: RackState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchRacks = createAsyncThunk("racks/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { racks: RackState }).racks
  const res = await api.get("/master/racks", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const rackSlice = createSlice({
  name: "racks",
  initialState,
  reducers: {
    setRackSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setRackPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateRacks(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRacks.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchRacks.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchRacks.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setRackSearch, setRackPage, invalidateRacks } = rackSlice.actions
export default rackSlice.reducer

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Master satuan (pcs, box, botol, ...). Kolom jejak (`created_by`, `updated_by`)
// diisi server dari pengguna yang login; satuan yang dihapus (soft delete) tidak
// ikut dikirim.
export type UnitMaster = {
  id: number
  code: string
  name: string
  note: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

type UnitState = {
  items: UnitMaster[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: UnitState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchUnits = createAsyncThunk("units/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { units: UnitState }).units
  const res = await api.get("/master/units", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const unitSlice = createSlice({
  name: "units",
  initialState,
  reducers: {
    setUnitSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setUnitPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateUnits(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUnits.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchUnits.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchUnits.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setUnitSearch, setUnitPage, invalidateUnits } = unitSlice.actions
export default unitSlice.reducer

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Satu BMHP satuan di dalam paket. Satuan & harganya dibaca dari master BMHP
// (`bmhp`), tidak disalin ke baris ini.
export type PackageBmhpItem = {
  id: number
  bmhp_id: number
  qty: number
  bmhp: {
    id: number
    code: string
    name: string
    unit: string | null
    price: number
  } | null
}

// Master paket BMHP — kumpulan BMHP satuan. `total_price` dihitung server dari
// (harga BMHP × qty) isinya; tidak ada harga paket yang disimpan tersendiri.
export type PackageBmhp = {
  id: number
  code: string
  name: string
  items: PackageBmhpItem[]
  total_price: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

type PackageBmhpState = {
  items: PackageBmhp[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: PackageBmhpState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchPackageBmhps = createAsyncThunk("packageBmhps/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { packageBmhps: PackageBmhpState }).packageBmhps
  const res = await api.get("/master/package-bmhps", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const packageBmhpSlice = createSlice({
  name: "packageBmhps",
  initialState,
  reducers: {
    setPackageBmhpSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setPackageBmhpPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidatePackageBmhps(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPackageBmhps.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchPackageBmhps.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchPackageBmhps.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setPackageBmhpSearch, setPackageBmhpPage, invalidatePackageBmhps } =
  packageBmhpSlice.actions
export default packageBmhpSlice.reducer

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Master jenis kemasan (tahap Packaging). `shelf_life_days` = masa simpan steril:
// jenis yang dipilih operator saat Selesai Pengemasan menentukan tgl kedaluwarsa.
export type PackagingTypeMaster = {
  id: number
  code: string
  name: string
  shelf_life_days: number
  note: string | null
  created_at: string
  updated_at: string
}

type PackagingTypeState = {
  items: PackagingTypeMaster[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: PackagingTypeState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchPackagingTypes = createAsyncThunk(
  "packagingTypes/fetch",
  async (_, { getState }) => {
    const { page, search } = (getState() as { packagingTypes: PackagingTypeState }).packagingTypes
    const res = await api.get("/master/packaging-types", {
      params: { page, search: search || undefined },
    })
    return res.data.data
  }
)

const packagingTypeSlice = createSlice({
  name: "packagingTypes",
  initialState,
  reducers: {
    setPackagingTypeSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setPackagingTypePage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidatePackagingTypes(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPackagingTypes.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchPackagingTypes.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchPackagingTypes.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setPackagingTypeSearch, setPackagingTypePage, invalidatePackagingTypes } =
  packagingTypeSlice.actions
export default packagingTypeSlice.reducer

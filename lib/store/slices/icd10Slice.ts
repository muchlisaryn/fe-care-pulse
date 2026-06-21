import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Icd10 = {
  id: number
  code: string
  display: string
  version: string
  created_by?: string | null
  updated_by?: string | null
  created_at?: string
  updated_at?: string
}

type Icd10State = {
  items: Icd10[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: Icd10State = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchIcd10 = createAsyncThunk("icd10/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { icd10: Icd10State }).icd10
  const res = await api.get("/master/icd10", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const icd10Slice = createSlice({
  name: "icd10",
  initialState,
  reducers: {
    setIcd10Search(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setIcd10Page(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateIcd10(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIcd10.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchIcd10.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchIcd10.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setIcd10Search, setIcd10Page, invalidateIcd10 } = icd10Slice.actions
export default icd10Slice.reducer

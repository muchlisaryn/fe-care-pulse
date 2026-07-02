import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type CategoriClinicalPathway = {
  id: number
  sort_order: number
  label: string
  created_by?: string | null
  updated_by?: string | null
  created_at?: string
  updated_at?: string
}

type CategoriState = {
  items: CategoriClinicalPathway[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: CategoriState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchCategoriCP = createAsyncThunk("categoriCP/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { categoriCP: CategoriState }).categoriCP
  const res = await api.get("/clinical-pathway/categories", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const categoriCPSlice = createSlice({
  name: "categoriCP",
  initialState,
  reducers: {
    setCategoriCPSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setCategoriCPPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateCategoriCP(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategoriCP.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchCategoriCP.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchCategoriCP.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setCategoriCPSearch, setCategoriCPPage, invalidateCategoriCP } =
  categoriCPSlice.actions
export default categoriCPSlice.reducer

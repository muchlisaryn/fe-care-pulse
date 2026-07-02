import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type TemplateClinicalPathway = {
  id: number
  icd10_id: number
  max_days: number
  description: string | null
  is_active: boolean
  icd10?: { id: number; code: string; display: string; version: string } | null
  created_at?: string
  updated_at?: string
}

type TemplateState = {
  items: TemplateClinicalPathway[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: TemplateState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchTemplateCP = createAsyncThunk("templateCP/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { templateCP: TemplateState }).templateCP
  const res = await api.get("/clinical-pathway/templates", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const templateCPSlice = createSlice({
  name: "templateCP",
  initialState,
  reducers: {
    setTemplateCPSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setTemplateCPPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateTemplateCP(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTemplateCP.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchTemplateCP.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchTemplateCP.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setTemplateCPSearch, setTemplateCPPage, invalidateTemplateCP } =
  templateCPSlice.actions
export default templateCPSlice.reducer

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Condition = {
  id: number
  name: string
  created_by: string
  updated_by: string
  deleted_at: string | null
  deleted_by: string | null
  created_at: string
  updated_at: string
}

type ConditionState = {
  items: Condition[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: ConditionState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchConditions = createAsyncThunk("conditions/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { conditions: ConditionState }).conditions
  const res = await api.get("/master/conditions", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const conditionSlice = createSlice({
  name: "conditions",
  initialState,
  reducers: {
    setConditionSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setConditionPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateConditions(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConditions.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchConditions.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchConditions.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setConditionSearch, setConditionPage, invalidateConditions } = conditionSlice.actions
export default conditionSlice.reducer

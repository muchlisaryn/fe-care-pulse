import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type WasherMachine = {
  id: number
  code: string
  name: string
  location: string | null
  min_temperature: string | null
  max_temperature: string | null
  min_duration_minutes: number | null
  max_duration_minutes: number | null
  status: "aktif" | "nonaktif"
  note: string | null
  created_at: string
  updated_at: string
}

type WasherMachineState = {
  items: WasherMachine[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: WasherMachineState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchWasherMachines = createAsyncThunk(
  "washerMachines/fetch",
  async (_, { getState }) => {
    const { page, search } = (getState() as { washerMachines: WasherMachineState }).washerMachines
    const res = await api.get("/master/washer-machines", {
      params: { page, search: search || undefined },
    })
    return res.data.data
  }
)

const washerMachineSlice = createSlice({
  name: "washerMachines",
  initialState,
  reducers: {
    setWasherMachineSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setWasherMachinePage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateWasherMachines(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWasherMachines.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchWasherMachines.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchWasherMachines.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setWasherMachineSearch, setWasherMachinePage, invalidateWasherMachines } =
  washerMachineSlice.actions
export default washerMachineSlice.reducer

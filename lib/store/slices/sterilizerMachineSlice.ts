import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type SterilizerMachine = {
  id: number
  code: string
  name: string
  location: string | null
  temperature: string | null
  duration_minutes: number | null
  sterile_shelf_life_days: number | null
  status: "aktif" | "nonaktif"
  note: string | null
  created_at: string
  updated_at: string
}

type SterilizerMachineState = {
  items: SterilizerMachine[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: SterilizerMachineState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchSterilizerMachines = createAsyncThunk(
  "sterilizerMachines/fetch",
  async (_, { getState }) => {
    const { page, search } = (getState() as { sterilizerMachines: SterilizerMachineState })
      .sterilizerMachines
    const res = await api.get("/master/sterilizer-machines", {
      params: { page, search: search || undefined },
    })
    return res.data.data
  }
)

const sterilizerMachineSlice = createSlice({
  name: "sterilizerMachines",
  initialState,
  reducers: {
    setSterilizerMachineSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setSterilizerMachinePage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateSterilizerMachines(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSterilizerMachines.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchSterilizerMachines.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchSterilizerMachines.rejected, (state) => {
        state.loading = false
      })
  },
})

export const {
  setSterilizerMachineSearch,
  setSterilizerMachinePage,
  invalidateSterilizerMachines,
} = sterilizerMachineSlice.actions
export default sterilizerMachineSlice.reducer

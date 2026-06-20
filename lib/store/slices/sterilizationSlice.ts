import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Status batch sterilisasi (Sterilization::STATUSES)
export const STERILIZATION_STATUSES = ["diproses", "selesai", "gagal"] as const
export type SterilizationStatus = (typeof STERILIZATION_STATUSES)[number]

// Metode sterilisasi (Sterilization::METHODS)
export const STERILIZATION_METHODS = ["uap", "eo", "plasma", "panas_kering"] as const
export type SterilizationMethod = (typeof STERILIZATION_METHODS)[number]

export type SterilizationItem = {
  id: number
  sterilization_id: number
  instrument_stock_id: number
  instrument_stock?: {
    id: number
    code: string
    instrument?: { id: number; code: string; name: string } | null
  } | null
}

export type Sterilization = {
  id: number
  code: string
  machine: string
  method: SterilizationMethod
  cycle_number: string | null
  temperature: string | null
  duration_minutes: number | null
  operator: string | null
  sterilized_at: string | null
  expiry_date: string | null
  chemical_indicator: string | null
  biological_indicator: string | null
  status: SterilizationStatus
  note: string | null
  items?: SterilizationItem[]
  items_count?: number
  created_at: string
  updated_at: string
}

type SterilizationState = {
  items: Sterilization[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  status: SterilizationStatus | ""
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: SterilizationState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  status: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchSterilizations = createAsyncThunk("sterilizations/fetch", async (_, { getState }) => {
  const { page, search, status } = (getState() as { sterilizations: SterilizationState }).sterilizations
  const res = await api.get("/master/sterilizations", {
    params: { page, search: search || undefined, status: status || undefined },
  })
  return res.data.data
})

const sterilizationSlice = createSlice({
  name: "sterilizations",
  initialState,
  reducers: {
    setSterilizationSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setSterilizationStatus(state, action: PayloadAction<SterilizationStatus | "">) {
      state.status = action.payload
      state.page = 1
      state.loaded = false
    },
    setSterilizationPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateSterilizations(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSterilizations.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchSterilizations.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchSterilizations.rejected, (state) => {
        state.loading = false
      })
  },
})

export const {
  setSterilizationSearch,
  setSterilizationStatus,
  setSterilizationPage,
  invalidateSterilizations,
} = sterilizationSlice.actions
export default sterilizationSlice.reducer

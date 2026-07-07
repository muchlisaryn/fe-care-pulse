import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export const DISTRIBUTION_STATUSES = ["terdistribusi", "dibatalkan"] as const

export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number]

export type DistributionItem = {
  id: number
  distribution_id: number
  bmhp_id: number | null
  quantity: number
  note: string | null
  bmhp?: { id: number; code: string; name: string; unit: string } | null
}

export type Distribution = {
  id: number
  code: string
  room_id: number
  sender: string | null
  receiver: string | null
  distributed_at: string | null
  status: DistributionStatus
  note: string | null
  room?: { id: number; code: string | null; name: string } | null
  items?: DistributionItem[]
  items_count?: number
  created_at: string
  updated_at: string
}

type DistributionState = {
  items: Distribution[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  status: DistributionStatus | ""
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: DistributionState = {
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

export const fetchDistributions = createAsyncThunk("distributions/fetch", async (_, { getState }) => {
  const { page, search, status } = (getState() as { distributions: DistributionState }).distributions
  const res = await api.get("/master/distributions", {
    params: { page, search: search || undefined, status: status || undefined },
  })
  return res.data.data
})

const distributionSlice = createSlice({
  name: "distributions",
  initialState,
  reducers: {
    setDistributionSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setDistributionStatus(state, action: PayloadAction<DistributionStatus | "">) {
      state.status = action.payload
      state.page = 1
      state.loaded = false
    },
    setDistributionPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateDistributions(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDistributions.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchDistributions.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchDistributions.rejected, (state) => {
        state.loading = false
      })
  },
})

export const {
  setDistributionSearch,
  setDistributionStatus,
  setDistributionPage,
  invalidateDistributions,
} = distributionSlice.actions
export default distributionSlice.reducer

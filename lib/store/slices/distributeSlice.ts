import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type DistributeUnit = {
  id: number
  code: string | null
  instrument: string | null
  rack_code: string | null
}

// Order yang sudah di gudang steril (status "digudang") & siap didistribusikan.
export type DistributeOrder = {
  id: number
  code: string
  code_transaction: string | null
  status: string
  borrowed_by: string | null
  room: { id: number; name: string; code: string | null } | null
  processed_at: string | null
  expiry_date: string | null
  unit_count: number
  units: DistributeUnit[]
}

type DistributeState = {
  items: DistributeOrder[]
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: DistributeState = {
  items: [],
  loading: false,
  loaded: false,
  dirty: false,
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const collected: T[] = []
  let current = 1
  let last = 1
  do {
    const res = await api.get(url, { params: { page: current } })
    const payload = res.data.data
    collected.push(...payload.data)
    last = payload.last_page
    current += 1
  } while (current <= last)
  return collected
}

export const fetchReadyToDistribute = createAsyncThunk("distribute/fetch", () =>
  fetchAllPages<DistributeOrder>("/master/orders/ready-to-distribute"),
)

const distributeSlice = createSlice({
  name: "distribute",
  initialState,
  reducers: {
    invalidateDistribute(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReadyToDistribute.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchReadyToDistribute.fulfilled, (state, action) => {
        state.items = action.payload
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchReadyToDistribute.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { invalidateDistribute } = distributeSlice.actions
export default distributeSlice.reducer

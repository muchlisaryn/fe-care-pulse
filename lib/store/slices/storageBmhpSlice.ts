import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Unit pada batch BMHP yang siap disimpan ke rak + status penempatannya.
export type StorageBmhpIncomingUnit = {
  id: number
  code: string | null
  instrument: string | null
  barcode_no: string | null
  image_url: string | null
  source: "satuan" | "paket"
  package_name: string | null
  package_no?: number | null
  quantity?: number
  unit_name?: string | null
  stored: boolean
  rack_code: string | null
}

// Batch BMHP steril yang perlu disimpan ke rak gudang steril.
export type StorageBmhpIncomingBatch = {
  id: number
  code: string
  code_transaction: string | null
  status: string
  source?: "order" | "produksi"
  store_url?: string
  borrowed_by: string | null
  room: { id: number; name: string } | null
  operator?: string | null
  machine_name?: string | null
  processed_at: string | null
  expiry_date: string | null
  unit_count: number
  stored_count: number
  units: StorageBmhpIncomingUnit[]
}

// Satu baris inventaris gudang steril BMHP.
export type StorageBmhpInventoryRow = {
  id: number
  rack_code: string
  stored_at: string | null
  expiry_date: string | null
  days_to_expiry: number | null
  alert: boolean
  expired: boolean
  can_distribute: boolean
  blocked_reason: string | null
  source: "satuan" | "paket"
  package_name: string | null
  package_no?: number | null
  barcode_no: string | null
  production_code: string | null
  batch: string | null
  unit: {
    id: number
    code: string | null
    instrument: string | null
    quantity?: number
    unit_name?: string | null
    image_url?: string | null
  }
}

export type StorageBmhpSummary = {
  total: number
  alert: number
  expired: number
  no_expiry?: number
}

export type LazyList<T> = {
  items: T[]
  page: number
  lastPage: number
  total: number
  loading: boolean
  loadingMore: boolean
  loaded: boolean
}

type StorageBmhpState = {
  incoming: LazyList<StorageBmhpIncomingBatch>
  inventory: LazyList<StorageBmhpInventoryRow>
  summary: StorageBmhpSummary
}

const emptyList = <T>(): LazyList<T> => ({
  items: [],
  page: 0,
  lastPage: 1,
  total: 0,
  loading: false,
  loadingMore: false,
  loaded: false,
})

const initialState: StorageBmhpState = {
  incoming: emptyList<StorageBmhpIncomingBatch>(),
  inventory: emptyList<StorageBmhpInventoryRow>(),
  summary: { total: 0, alert: 0, expired: 0 },
}

type PageResult<T> = { items: T[]; page: number; lastPage: number; total: number }

export type FetchPageArg = { page?: number; search?: string }

async function fetchPage<T>(url: string, { page = 1, search }: FetchPageArg): Promise<PageResult<T>> {
  const res = await api.get(url, {
    params: { page, search: search || undefined },
  })
  const p = res.data.data
  return { items: p.data, page: p.current_page, lastPage: p.last_page, total: p.total }
}

export const fetchStorageBmhpIncoming = createAsyncThunk(
  "storageBmhp/incoming",
  (arg: FetchPageArg = {}) => fetchPage<StorageBmhpIncomingBatch>("/master/storage-bmhp/incoming", arg),
)

export const fetchStorageBmhpInventory = createAsyncThunk(
  "storageBmhp/inventory",
  (arg: FetchPageArg = {}) => fetchPage<StorageBmhpInventoryRow>("/master/storage-bmhp/inventory", arg),
)

export const fetchStorageBmhpSummary = createAsyncThunk("storageBmhp/summary", async () => {
  const res = await api.get("/master/storage-bmhp/summary")
  return res.data.data as StorageBmhpSummary
})

function onPending<T>(list: LazyList<T>, page: number) {
  if (page > 1) list.loadingMore = true
  else list.loading = true
}

function onFulfilled<T>(list: LazyList<T>, result: PageResult<T>) {
  list.items = result.page > 1 ? [...list.items, ...result.items] : result.items
  list.page = result.page
  list.lastPage = result.lastPage
  list.total = result.total
  list.loading = false
  list.loadingMore = false
  list.loaded = true
}

function onRejected<T>(list: LazyList<T>) {
  list.loading = false
  list.loadingMore = false
}

const storageBmhpSlice = createSlice({
  name: "storageBmhp",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchStorageBmhpIncoming.pending, (state, action) => {
        onPending(state.incoming, action.meta.arg.page ?? 1)
      })
      .addCase(fetchStorageBmhpIncoming.fulfilled, (state, action) => {
        onFulfilled(state.incoming, action.payload)
      })
      .addCase(fetchStorageBmhpIncoming.rejected, (state) => {
        onRejected(state.incoming)
      })
      .addCase(fetchStorageBmhpInventory.pending, (state, action) => {
        onPending(state.inventory, action.meta.arg.page ?? 1)
      })
      .addCase(fetchStorageBmhpInventory.fulfilled, (state, action) => {
        onFulfilled(state.inventory, action.payload)
      })
      .addCase(fetchStorageBmhpInventory.rejected, (state) => {
        onRejected(state.inventory)
      })
      .addCase(fetchStorageBmhpSummary.fulfilled, (state, action) => {
        state.summary = action.payload
      })
  },
})

export default storageBmhpSlice.reducer

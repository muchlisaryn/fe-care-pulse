import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Unit pada order yang siap disimpan + status penempatannya.
export type StorageIncomingUnit = {
  id: number
  code: string | null
  instrument: string | null
  source: "satuan" | "paket"
  package_name: string | null
  stored: boolean
  rack_code: string | null
}

// Order steril yang perlu disimpan ke gudang.
export type StorageIncomingOrder = {
  id: number
  code: string
  code_transaction: string | null
  status: string
  borrowed_by: string | null
  room: { id: number; name: string } | null
  processed_at: string | null
  expiry_date: string | null
  unit_count: number
  stored_count: number
  units: StorageIncomingUnit[]
}

// Satu baris inventaris gudang steril.
export type StorageInventoryRow = {
  id: number
  rack_code: string
  stored_at: string | null
  expiry_date: string | null
  days_to_expiry: number | null
  alert: boolean
  expired: boolean
  unit: { id: number; code: string | null; instrument: string | null }
  order: { id: number; code: string; code_transaction: string | null } | null
}

type StorageState = {
  incoming: StorageIncomingOrder[]
  incomingLoading: boolean
  incomingLoaded: boolean
  inventory: StorageInventoryRow[]
  inventoryLoading: boolean
  inventoryLoaded: boolean
  dirty: boolean
}

const initialState: StorageState = {
  incoming: [],
  incomingLoading: false,
  incomingLoaded: false,
  inventory: [],
  inventoryLoading: false,
  inventoryLoaded: false,
  dirty: false,
}

// Ambil seluruh halaman lalu gabungkan jadi satu array.
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

export const fetchStorageIncoming = createAsyncThunk("storage/incoming", () =>
  fetchAllPages<StorageIncomingOrder>("/master/storage/incoming"),
)

export const fetchStorageInventory = createAsyncThunk("storage/inventory", () =>
  fetchAllPages<StorageInventoryRow>("/master/storage/inventory"),
)

const storageSlice = createSlice({
  name: "storage",
  initialState,
  reducers: {
    invalidateStorage(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStorageIncoming.pending, (state) => {
        state.incomingLoading = true
      })
      .addCase(fetchStorageIncoming.fulfilled, (state, action) => {
        state.incoming = action.payload
        state.incomingLoading = false
        state.incomingLoaded = true
        state.dirty = false
      })
      .addCase(fetchStorageIncoming.rejected, (state) => {
        state.incomingLoading = false
      })
      .addCase(fetchStorageInventory.pending, (state) => {
        state.inventoryLoading = true
      })
      .addCase(fetchStorageInventory.fulfilled, (state, action) => {
        state.inventory = action.payload
        state.inventoryLoading = false
        state.inventoryLoaded = true
        state.dirty = false
      })
      .addCase(fetchStorageInventory.rejected, (state) => {
        state.inventoryLoading = false
      })
  },
})

export const { invalidateStorage } = storageSlice.actions
export default storageSlice.reducer

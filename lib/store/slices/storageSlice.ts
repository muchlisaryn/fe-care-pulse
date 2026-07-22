import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// Unit pada order yang siap disimpan + status penempatannya.
export type StorageIncomingUnit = {
  id: number
  code: string | null
  instrument: string | null
  /** Nomor label kemasan yang tercetak di bungkus steril (satu label = satu bungkus). */
  barcode_no: string | null
  image_url: string | null
  // Gambar SET (katalog paket) — untuk thumbnail grup paket.
  package_image?: string | null
  source: "satuan" | "paket"
  package_name: string | null
  stored: boolean
  rack_code: string | null
}

// Order / batch produksi steril yang perlu disimpan ke gudang.
export type StorageIncomingOrder = {
  id: number
  code: string
  code_transaction: string | null
  status: string
  // Asal batch: "order" (peminjaman) atau "produksi" (pipeline produksi).
  source?: "order" | "produksi"
  // Endpoint untuk menyimpan unit batch ini ke rak.
  store_url?: string
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
  source: "satuan" | "paket"
  package_name: string | null
  /** Kode batch produksi (PRD-...) asal unit — label pada bungkus sterilnya. */
  production_code: string | null
  unit: { id: number; code: string | null; instrument: string | null; image_url?: string | null }
  order: { id: number; code: string; code_transaction: string | null } | null
  batch: string | null
}

/** Angka ringkasan gudang — dipakai kartu statistik tanpa memuat seluruh baris. */
export type StorageSummary = { total: number; alert: number; expired: number }

/**
 * Daftar yang dimuat BERTAHAP (lazy load): halaman 1 saat dibutuhkan, halaman
 * berikutnya menyusul saat pengguna men-scroll sampai dasar daftar.
 */
export type LazyList<T> = {
  items: T[]
  /** Halaman terakhir yang sudah masuk `items`. */
  page: number
  lastPage: number
  /** Jumlah baris keseluruhan di server (bukan yang sudah dimuat). */
  total: number
  /** Muat halaman pertama (daftar masih kosong). */
  loading: boolean
  /** Muat halaman berikutnya (menambah di bawah). */
  loadingMore: boolean
  loaded: boolean
}

type StorageState = {
  incoming: LazyList<StorageIncomingOrder>
  productionIncoming: LazyList<StorageIncomingOrder>
  inventory: LazyList<StorageInventoryRow>
  summary: StorageSummary
  summaryLoaded: boolean
  dirty: boolean
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

const initialState: StorageState = {
  incoming: emptyList<StorageIncomingOrder>(),
  productionIncoming: emptyList<StorageIncomingOrder>(),
  inventory: emptyList<StorageInventoryRow>(),
  summary: { total: 0, alert: 0, expired: 0 },
  summaryLoaded: false,
  dirty: false,
}

// Satu halaman hasil paginate Laravel.
type PageResult<T> = { items: T[]; page: number; lastPage: number; total: number }

/** Argumen thunk: halaman ke-berapa + kata kunci pencarian (dicari di server). */
export type FetchPageArg = { page?: number; search?: string }

async function fetchPage<T>(url: string, { page = 1, search }: FetchPageArg): Promise<PageResult<T>> {
  const res = await api.get(url, { params: { page, search: search || undefined } })
  const p = res.data.data
  return { items: p.data, page: p.current_page, lastPage: p.last_page, total: p.total }
}

export const fetchStorageIncoming = createAsyncThunk("storage/incoming", (arg: FetchPageArg = {}) =>
  fetchPage<StorageIncomingOrder>("/master/storage/incoming", arg),
)

export const fetchProductionStorageIncoming = createAsyncThunk(
  "storage/productionIncoming",
  (arg: FetchPageArg = {}) => fetchPage<StorageIncomingOrder>("/master/storage/production-incoming", arg),
)

export const fetchStorageInventory = createAsyncThunk("storage/inventory", (arg: FetchPageArg = {}) =>
  fetchPage<StorageInventoryRow>("/master/storage/inventory", arg),
)

export const fetchStorageSummary = createAsyncThunk("storage/summary", async () => {
  const res = await api.get("/master/storage/summary")
  return res.data.data as StorageSummary
})

// Reducer bersama ketiga daftar: halaman 1 mengganti isi, halaman > 1 menambah.
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
      .addCase(fetchStorageIncoming.pending, (state, action) => {
        onPending(state.incoming, action.meta.arg.page ?? 1)
      })
      .addCase(fetchStorageIncoming.fulfilled, (state, action) => {
        onFulfilled(state.incoming, action.payload)
        state.dirty = false
      })
      .addCase(fetchStorageIncoming.rejected, (state) => {
        onRejected(state.incoming)
      })
      .addCase(fetchProductionStorageIncoming.pending, (state, action) => {
        onPending(state.productionIncoming, action.meta.arg.page ?? 1)
      })
      .addCase(fetchProductionStorageIncoming.fulfilled, (state, action) => {
        onFulfilled(state.productionIncoming, action.payload)
        state.dirty = false
      })
      .addCase(fetchProductionStorageIncoming.rejected, (state) => {
        onRejected(state.productionIncoming)
      })
      .addCase(fetchStorageInventory.pending, (state, action) => {
        onPending(state.inventory, action.meta.arg.page ?? 1)
      })
      .addCase(fetchStorageInventory.fulfilled, (state, action) => {
        onFulfilled(state.inventory, action.payload)
        state.dirty = false
      })
      .addCase(fetchStorageInventory.rejected, (state) => {
        onRejected(state.inventory)
      })
      .addCase(fetchStorageSummary.fulfilled, (state, action) => {
        state.summary = action.payload
        state.summaryLoaded = true
      })
  },
})

export const { invalidateStorage } = storageSlice.actions
export default storageSlice.reducer

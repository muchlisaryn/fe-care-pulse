import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// ── Tipe data monitoring (dibagikan ke halaman Monitoring) ──────────────────

// Satu unit fisik di dalam sebuah grup katalog.
export type MonitoredUnit = {
  instrument_stock_id: number | null
  code: string | null
  status: string | null
  condition: { id: number; name: string } | null
}

// Instrumen yang dipinjam, dikelompokkan per (order, asal, paket, katalog instrumen).
export type MonitoredInstrument = {
  order_code: string
  code_transaction: string | null
  borrowed_by: string | null
  order_date: string | null
  return_plan_date: string | null
  source: "satuan" | "paket"
  package_name: string | null
  instrument: { id: number; code: string; name: string } | null
  qty: number
  units: MonitoredUnit[]
}

export type MonitoredRoom = {
  id: number
  code: string | null
  name: string
  borrowed_count: number
  instrument_count: number
  instruments: MonitoredInstrument[]
}

// Order masuk dari menu Order Instrumen (status diajukan).
export type IncomingStatus = "diajukan"
// Komposisi instrumen di dalam satu paket (hanya untuk item bertipe "paket").
export type IncomingItemContent = { instrument: string; code: string | null; quantity: number }
export type IncomingItem = {
  type: "satuan" | "paket"
  name: string
  quantity: number
  contents?: IncomingItemContent[]
}
export type IncomingOrder = {
  id: number
  code: string
  status: IncomingStatus
  borrowed_by: string | null
  room: { id: number; name: string } | null
  order_date: string | null
  return_plan_date: string | null
  note: string | null
  requested_qty: number
  request_lines: number
  items: IncomingItem[]
}

// Order yang sudah dikembalikan (riwayat) — tetap dipajang di daftar monitoring.
export type ReturnedOrder = {
  id: number
  code: string
  code_transaction: string | null
  borrowed_by: string | null
  room: { id: number; name: string } | null
  order_date: string | null
  return_plan_date: string | null
  returned_at: string | null
  total_units: number
}

// ── State ───────────────────────────────────────────────────────────────────

type MonitoringState = {
  rooms: MonitoredRoom[]
  incoming: IncomingOrder[]
  returned: ReturnedOrder[]
  roomsLoading: boolean
  incomingLoading: boolean
  returnedLoading: boolean
  roomsLoaded: boolean
  incomingLoaded: boolean
  returnedLoaded: boolean
}

const initialState: MonitoringState = {
  rooms: [],
  incoming: [],
  returned: [],
  roomsLoading: false,
  incomingLoading: false,
  returnedLoading: false,
  roomsLoaded: false,
  incomingLoaded: false,
  returnedLoaded: false,
}

// Ambil seluruh halaman dari endpoint paginated lalu gabungkan jadi satu array.
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

export const fetchMonitoringRooms = createAsyncThunk("monitoring/rooms", () =>
  fetchAllPages<MonitoredRoom>("/master/monitoring/rooms"),
)

export const fetchMonitoringIncoming = createAsyncThunk("monitoring/incoming", () =>
  fetchAllPages<IncomingOrder>("/master/monitoring/incoming"),
)

export const fetchMonitoringReturned = createAsyncThunk("monitoring/returned", () =>
  fetchAllPages<ReturnedOrder>("/master/monitoring/returned"),
)

const monitoringSlice = createSlice({
  name: "monitoring",
  initialState,
  reducers: {
    // Tandai data monitoring kedaluwarsa (mis. setelah handover/pinjam-alih di-ACC),
    // sehingga di-fetch ulang saat halaman monitoring dibuka berikutnya.
    invalidateMonitoring(state) {
      state.roomsLoaded = false
      state.incomingLoaded = false
      state.returnedLoaded = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMonitoringRooms.pending, (state) => {
        state.roomsLoading = true
      })
      .addCase(fetchMonitoringRooms.fulfilled, (state, action) => {
        state.rooms = action.payload
        state.roomsLoading = false
        state.roomsLoaded = true
      })
      .addCase(fetchMonitoringRooms.rejected, (state) => {
        state.roomsLoading = false
      })
      .addCase(fetchMonitoringIncoming.pending, (state) => {
        state.incomingLoading = true
      })
      .addCase(fetchMonitoringIncoming.fulfilled, (state, action) => {
        state.incoming = action.payload
        state.incomingLoading = false
        state.incomingLoaded = true
      })
      .addCase(fetchMonitoringIncoming.rejected, (state) => {
        state.incomingLoading = false
      })
      .addCase(fetchMonitoringReturned.pending, (state) => {
        state.returnedLoading = true
      })
      .addCase(fetchMonitoringReturned.fulfilled, (state, action) => {
        state.returned = action.payload
        state.returnedLoading = false
        state.returnedLoaded = true
      })
      .addCase(fetchMonitoringReturned.rejected, (state) => {
        state.returnedLoading = false
      })
  },
})

export const { invalidateMonitoring } = monitoringSlice.actions
export default monitoringSlice.reducer

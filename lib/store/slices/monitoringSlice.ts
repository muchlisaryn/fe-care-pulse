import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import api from "@/lib/axios"

// ── Tipe data monitoring (dibagikan ke halaman Monitoring) ──────────────────

// Satu unit fisik di dalam sebuah grup katalog.
export type MonitoredUnit = {
  instrument_stock_id: number | null
  code: string | null
  status: string | null
  /** Nomor label fisik bungkus steril (packaging_item.barcode_no) — bisa dicari/di-scan. */
  barcode_no: string | null
  condition: { id: number; name: string } | null
}

// Instrumen yang dipinjam, dikelompokkan per (order, asal, paket, katalog instrumen).
export type MonitoredInstrument = {
  order_code: string
  code_transaction: string | null
  borrowed_by: string | null
  /** Identitas pasien (khusus order rawat inap) — ditampilkan di kartu Daftar Order. */
  patient_name: string | null
  medical_record_no: string | null
  order_date: string | null
  return_plan_date: string | null
  source: "satuan" | "paket"
  package_name: string | null
  /** Jumlah SET paket ini pada order (null untuk baris satuan). `qty` tetap unit fisik. */
  package_sets: number | null
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
  /** Identitas pasien (khusus order rawat inap). */
  patient_name: string | null
  medical_record_no: string | null
  room: { id: number; name: string } | null
  order_date: string | null
  order_time: string | null
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
  /** Identitas pasien (khusus order rawat inap). */
  patient_name: string | null
  medical_record_no: string | null
  room: { id: number; name: string } | null
  order_date: string | null
  return_plan_date: string | null
  returned_at: string | null
  total_units: number
  /** Jumlah SET paket pada order (paket dihitung per set, bukan per unit isinya). */
  total_sets: number
  /** Jumlah UNIT instrumen satuan pada order. */
  total_satuan: number
}

// Satu baris tab "Distribution & Tracking" (endpoint monitoring/tracking): order
// yang sedang dipinjam ATAU riwayat order yang sudah dikembalikan. Server yang
// menentukan urutan & potongan halamannya — lihat fetchMonitoringTracking.
export type TrackingRow =
  | {
      kind: "borrowed"
      order_id: number
      order_code: string
      /** Baris unit RATA — bentuknya sama dengan `monitoring/rooms` agar pengelompoknya bisa dipakai ulang. */
      instruments: (MonitoredInstrument & { room: string | null })[]
    }
  | { kind: "returned"; order_id: number; order_code: string; order: ReturnedOrder }

// Angka KETIGA kartu statistik halaman Tracking Order — dihitung di server, bukan
// dari daftar ruangan yang dimuat penuh (lihat monitoring/borrowed-summary).
export type BorrowedSummary = {
  /** Set paket + unit satuan — angka yang dipajang kartu. */
  borrowed: number
  sets: number
  units: number
  /** Jumlah order yang masih punya unit belum dikembalikan. */
  orders: number
  /** Instrumen yang rencana kembalinya sudah lewat (aturan set/unit yang sama). */
  overdue: number
}

// Angka badge tiap tab — murni count() di server, tanpa memuat daftarnya.
export type MonitoringCounts = {
  masuk: number
  siap_distribusi: number
  dipinjam: number
  dikembalikan: number
}

// Satu kartu "Distribusi per Ruangan": angka saja, tanpa daftar instrumennya.
// Daftar instrumen per ruangan baru diambil saat kartunya diklik (lihat `rooms`).
export type RoomSummary = {
  id: number
  code: string | null
  name: string
  borrowed_count: number
  overdue_count: number
}

// ── State ───────────────────────────────────────────────────────────────────

/**
 * Baris per halaman tab Distribution & Tracking. HARUS sama dengan default
 * `TRACKING_PER_PAGE` di MonitoringController — nilainya tetap dikirim eksplisit
 * sebagai `per_page` supaya jumlah halaman dari server cocok dengan yang dipakai
 * komponen Pagination.
 */
export const TRACKING_PER_PAGE = 10

type MonitoringState = {
  /** Daftar ruangan LENGKAP dengan instrumennya — berat, hanya dimuat saat dibutuhkan. */
  rooms: MonitoredRoom[]
  roomsSummary: RoomSummary[]
  incoming: IncomingOrder[]
  returned: ReturnedOrder[]
  /** Baris tab Distribution & Tracking — HANYA satu halaman (dipaginasi server). */
  tracking: TrackingRow[]
  trackingPage: number
  trackingPerPage: number
  trackingTotalPages: number
  trackingTotalItems: number
  borrowedSummary: BorrowedSummary
  counts: MonitoringCounts
  roomsLoading: boolean
  roomsSummaryLoading: boolean
  incomingLoading: boolean
  returnedLoading: boolean
  trackingLoading: boolean
  roomsLoaded: boolean
  roomsSummaryLoaded: boolean
  incomingLoaded: boolean
  returnedLoaded: boolean
}

const initialState: MonitoringState = {
  rooms: [],
  roomsSummary: [],
  incoming: [],
  returned: [],
  tracking: [],
  trackingPage: 1,
  trackingPerPage: TRACKING_PER_PAGE,
  trackingTotalPages: 1,
  trackingTotalItems: 0,
  borrowedSummary: { borrowed: 0, sets: 0, units: 0, orders: 0, overdue: 0 },
  counts: { masuk: 0, siap_distribusi: 0, dipinjam: 0, dikembalikan: 0 },
  roomsLoading: false,
  roomsSummaryLoading: false,
  incomingLoading: false,
  returnedLoading: false,
  trackingLoading: false,
  roomsLoaded: false,
  roomsSummaryLoaded: false,
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

/**
 * Satu HALAMAN daftar tab Distribution & Tracking. Berbeda dari thunk lain di file
 * ini yang menarik seluruh halaman lalu menggabungkannya (fetchAllPages): di sini
 * pencarian, rentang tanggal, dan potongan halaman dikerjakan server, jadi cukup
 * satu permintaan per halaman.
 */
export const fetchMonitoringTracking = createAsyncThunk(
  "monitoring/tracking",
  async (args: { page?: number; search?: string; from?: string; to?: string } = {}) => {
    const res = await api.get("/master/monitoring/tracking", {
      params: {
        page: args.page ?? 1,
        per_page: TRACKING_PER_PAGE,
        search: args.search || undefined,
        from: args.from || undefined,
        to: args.to || undefined,
      },
    })
    const p = res.data.data
    return {
      rows: p.data as TrackingRow[],
      page: p.current_page as number,
      totalPages: p.last_page as number,
      totalItems: p.total as number,
      perPage: p.per_page as number,
    }
  },
)

// Angka kartu statistik — dihitung di server dengan aturan yang sama seperti kartu
// "Instrumen di Gudang Steril": paket per SET, satuan per UNIT.
export const fetchBorrowedSummary = createAsyncThunk("monitoring/borrowedSummary", async () => {
  const res = await api.get("/master/monitoring/borrowed-summary")
  return res.data.data as BorrowedSummary
})

// Angka badge tab. `from`/`to` mengikuti filter rentang tanggal halaman supaya
// angkanya selalu sama dengan isi daftar yang tampil.
export const fetchMonitoringCounts = createAsyncThunk(
  "monitoring/counts",
  async (range: { from?: string; to?: string } = {}) => {
    const res = await api.get("/master/monitoring/counts", {
      params: { from: range.from || undefined, to: range.to || undefined },
    })
    return res.data.data as MonitoringCounts
  },
)

// Kartu "Distribusi per Ruangan" — angka per ruangan saja (bukan agregat paginated),
// jadi cukup satu permintaan ringan.
export const fetchMonitoringRoomsSummary = createAsyncThunk("monitoring/roomsSummary", async () => {
  const res = await api.get("/master/monitoring/rooms-summary")
  return res.data.data as RoomSummary[]
})

const monitoringSlice = createSlice({
  name: "monitoring",
  initialState,
  reducers: {
    // Tandai data monitoring kedaluwarsa (mis. setelah handover/pinjam-alih di-ACC),
    // sehingga di-fetch ulang saat halaman monitoring dibuka berikutnya.
    invalidateMonitoring(state) {
      state.roomsLoaded = false
      state.roomsSummaryLoaded = false
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
      // Halaman tracking TIDAK ditandai "loaded": isinya bergantung pada halaman,
      // pencarian, dan rentang tanggal, jadi tidak ada satu keadaan yang bisa
      // dianggap cache valid — halaman selalu diminta ulang saat parameternya berubah.
      .addCase(fetchMonitoringTracking.pending, (state) => {
        state.trackingLoading = true
      })
      .addCase(fetchMonitoringTracking.fulfilled, (state, action) => {
        state.tracking = action.payload.rows
        state.trackingPage = action.payload.page
        state.trackingPerPage = action.payload.perPage
        state.trackingTotalPages = action.payload.totalPages
        state.trackingTotalItems = action.payload.totalItems
        state.trackingLoading = false
      })
      .addCase(fetchMonitoringTracking.rejected, (state) => {
        state.trackingLoading = false
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
      .addCase(fetchMonitoringRoomsSummary.pending, (state) => {
        state.roomsSummaryLoading = true
      })
      .addCase(fetchMonitoringRoomsSummary.fulfilled, (state, action) => {
        state.roomsSummary = action.payload
        state.roomsSummaryLoading = false
        state.roomsSummaryLoaded = true
      })
      .addCase(fetchMonitoringRoomsSummary.rejected, (state) => {
        state.roomsSummaryLoading = false
      })
      .addCase(fetchBorrowedSummary.fulfilled, (state, action) => {
        state.borrowedSummary = action.payload
      })
      .addCase(fetchMonitoringCounts.fulfilled, (state, action) => {
        state.counts = action.payload
      })
  },
})

export const { invalidateMonitoring } = monitoringSlice.actions
export default monitoringSlice.reducer

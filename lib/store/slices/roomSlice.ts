import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Room = {
  id: number
  code: string
  name: string
  // Layanan ruangan: igd / rawat_jalan / rawat_inap (bisa null utk data lama).
  layanan: "igd" | "rawat_jalan" | "rawat_inap" | null
  created_by: string
  updated_by: string
  deleted_at: string | null
  deleted_by: string | null
  created_at: string
  updated_at: string
}

type RoomState = {
  items: Room[]
  // Daftar lengkap tanpa paginasi/pencarian, khusus untuk isi dropdown pilihan
  // ruangan. Dipisah dari `items` supaya tidak ikut ke-filter saat user
  // berpindah halaman / mencari di master ruangan.
  options: Room[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  optionsLoaded: boolean
  dirty: boolean
}

const initialState: RoomState = {
  items: [],
  options: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  optionsLoaded: false,
  dirty: false,
}

export const fetchRooms = createAsyncThunk("rooms/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { rooms: RoomState }).rooms
  const res = await api.get("/master/rooms", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

// Ambil semua ruangan untuk dropdown — sengaja tidak membaca `page`/`search`
// dari state agar hasilnya selalu sama di halaman mana pun.
export const fetchRoomOptions = createAsyncThunk("rooms/fetchOptions", async () => {
  const res = await api.get("/master/rooms", { params: { per_page: 500 } })
  return res.data.data
})

const roomSlice = createSlice({
  name: "rooms",
  initialState,
  reducers: {
    setRoomSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setRoomPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateRooms(state) {
      state.dirty = true
      state.optionsLoaded = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRooms.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchRooms.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchRooms.rejected, (state) => {
        state.loading = false
      })
      .addCase(fetchRoomOptions.fulfilled, (state, action) => {
        state.options = action.payload.data
        state.optionsLoaded = true
      })
  },
})

export const { setRoomSearch, setRoomPage, invalidateRooms } = roomSlice.actions
export default roomSlice.reducer

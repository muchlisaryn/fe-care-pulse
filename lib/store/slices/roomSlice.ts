import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Room = {
  id: number
  code: string
  name: string
  created_by: string
  updated_by: string
  deleted_at: string | null
  deleted_by: string | null
  created_at: string
  updated_at: string
}

type RoomState = {
  items: Room[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: RoomState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchRooms = createAsyncThunk("rooms/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { rooms: RoomState }).rooms
  const res = await api.get("/master/rooms", {
    params: { page, search: search || undefined },
  })
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
  },
})

export const { setRoomSearch, setRoomPage, invalidateRooms } = roomSlice.actions
export default roomSlice.reducer

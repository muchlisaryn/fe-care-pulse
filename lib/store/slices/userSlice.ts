import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type User = {
  id: number
  name: string
  username: string
  email: string
  no_telephone: string | null
  authority_id: number | null
  authority: { id: number; name: string } | null
  created_at: string
  updated_at: string
}

type UserState = {
  items: User[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: UserState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchUsers = createAsyncThunk("users/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { users: UserState }).users
  const res = await api.get("/master/users", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const userSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    setUserSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setUserPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateUsers(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchUsers.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setUserSearch, setUserPage, invalidateUsers } = userSlice.actions
export default userSlice.reducer

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type TitleMenuItem = {
  id: number
  name: string
  url: string
  sort_order: number
}

export type TitleMenu = {
  id: number
  title: string
  sort_order: number
  menus: TitleMenuItem[]
}

type TitleMenuState = {
  items: TitleMenu[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: TitleMenuState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchTitleMenus = createAsyncThunk("titleMenus/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { titleMenus: TitleMenuState }).titleMenus
  const res = await api.get("/master/title-menus", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const titleMenuSlice = createSlice({
  name: "titleMenus",
  initialState,
  reducers: {
    setTitleMenuSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setTitleMenuPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateTitleMenus(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTitleMenus.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchTitleMenus.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchTitleMenus.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setTitleMenuSearch, setTitleMenuPage, invalidateTitleMenus } = titleMenuSlice.actions
export default titleMenuSlice.reducer

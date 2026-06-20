import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type TitleMenuRef = {
  id: number
  title: string
}

// Sub-menu (child) as returned by the grouped index — only id, name, url.
export type MenuChild = {
  id: number
  name: string
  url: string | null
}

// Parent menu (parent_id === null) inside a group.
export type MenuParent = {
  id: number
  title_menu_id: number | null
  parent_id: number | null
  name: string
  url: string | null
  icon: string | null
  sort_order: number
  is_open: boolean
  menu: MenuChild[]
}

// Top-level grouping by title_menu.
export type MenuGroup = {
  title_menu: string | null
  menus: MenuParent[]
}

// Full detail (Show endpoint) used to prefill the edit form.
export type MenuDetail = {
  id: number
  title_menu_id: number | null
  parent_id: number | null
  name: string
  url: string | null
  icon: string | null
  sort_order: number
  is_open: boolean
  title_menu: TitleMenuRef | null
  parent: MenuDetail | null
  children?: { id: number; name: string; url: string | null; sort_order: number }[]
}

type MenuState = {
  groups: MenuGroup[]
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: MenuState = {
  groups: [],
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchMenus = createAsyncThunk("menus/fetch", async (_, { getState }) => {
  const { search } = (getState() as { menus: MenuState }).menus
  const res = await api.get("/master/menus", {
    params: { search: search || undefined },
  })
  console.log("[menu] response data:", res.data)
  return res.data.data
})

const menuSlice = createSlice({
  name: "menus",
  initialState,
  reducers: {
    setMenuSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.loaded = false
    },
    invalidateMenus(state) {
      state.dirty = true
      state.loading = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMenus.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchMenus.fulfilled, (state, action) => {
        state.groups = Array.isArray(action.payload) ? action.payload : []
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchMenus.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setMenuSearch, invalidateMenus } = menuSlice.actions
export default menuSlice.reducer

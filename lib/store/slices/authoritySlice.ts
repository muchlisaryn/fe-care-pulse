import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Authority = {
  id: number
  name: string
  description: string | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export type MenuOption = {
  id: number
  parent_id: number | null
  name: string
  url: string | null
  title_menu_id: number | null
  title_menu: { id: number; title: string } | null
  sort_order: number
}

// Shape of the grouped /master/menus response.
type GroupedMenuChild = { id: number; name: string; url: string | null }
type GroupedMenuParent = {
  id: number
  title_menu_id: number | null
  parent_id: number | null
  name: string
  url: string | null
  sort_order: number
  menu?: GroupedMenuChild[]
}
type GroupedMenu = { title_menu: string | null; menus: GroupedMenuParent[] }

// Flatten the grouped tree into a flat MenuOption list (parents + children)
// for the authority checkbox tree.
export function flattenMenuOptions(groups: unknown): MenuOption[] {
  if (!Array.isArray(groups)) return []
  const out: MenuOption[] = []
  for (const g of groups as GroupedMenu[]) {
    const titleMenu = (id: number | null) =>
      id != null ? { id, title: g.title_menu ?? "" } : null
    for (const p of g.menus ?? []) {
      const tm = titleMenu(p.title_menu_id)
      out.push({
        id: p.id,
        parent_id: null,
        name: p.name,
        url: p.url,
        title_menu_id: p.title_menu_id,
        title_menu: tm,
        sort_order: p.sort_order,
      })
      for (const c of p.menu ?? []) {
        out.push({
          id: c.id,
          parent_id: p.id,
          name: c.name,
          url: c.url,
          title_menu_id: p.title_menu_id,
          title_menu: tm,
          sort_order: 0,
        })
      }
    }
  }
  return out
}

type AuthorityState = {
  items: Authority[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
  menuOptions: MenuOption[]
  menuOptionsLoaded: boolean
}

const initialState: AuthorityState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
  menuOptions: [],
  menuOptionsLoaded: false,
}

export const fetchAuthorities = createAsyncThunk(
  "authorities/fetch",
  async (_, { getState }) => {
    const { page, search } = (getState() as { authorities: AuthorityState }).authorities
    const res = await api.get("/master/authorities", {
      params: { page, search: search || undefined },
    })
    return res.data.data
  }
)

export const fetchMenuOptions = createAsyncThunk(
  "authorities/fetchMenuOptions",
  async () => {
    const res = await api.get("/master/menus")
    return flattenMenuOptions(res.data.data)
  }
)

const authoritySlice = createSlice({
  name: "authorities",
  initialState,
  reducers: {
    setAuthoritySearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setAuthorityPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateAuthorities(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuthorities.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchAuthorities.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchAuthorities.rejected, (state) => {
        state.loading = false
      })
      .addCase(fetchMenuOptions.fulfilled, (state, action) => {
        state.menuOptions = action.payload
        state.menuOptionsLoaded = true
      })
  },
})

export const { setAuthoritySearch, setAuthorityPage, invalidateAuthorities } =
  authoritySlice.actions
export default authoritySlice.reducer

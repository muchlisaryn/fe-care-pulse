import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import api from "@/lib/axios";

export type AuthSubMenu = {
  name: string;
  url: string | null;
};

export type AuthMenuGroup = {
  name: string;
  url: string | null;
  icon: string | null;
  sort_order: number;
  is_open: boolean;
  menu: AuthSubMenu[] | null;
};

export type AuthTitleSection = {
  title_menu: string | null;
  menus: AuthMenuGroup[];
};

type AuthMeData = {
  username: string;
  name?: string | null;
  email?: string | null;
  menus: AuthTitleSection[];
};

type AuthState = {
  username: string | null;
  name: string | null;
  email: string | null;
  token: string | null;
  menus: AuthTitleSection[];
  isAuthenticated: boolean;
  hydrated: boolean;
};

const initialState: AuthState = {
  username: null,
  name: null,
  email: null,
  token: null,
  menus: [],
  isAuthenticated: false,
  hydrated: false,
};

export const fetchMe = createAsyncThunk("auth/me", async () => {
  const res = await api.get("/auth/me");
  return res.data.data as AuthMeData;
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{
        username: string;
        token: string;
        menus: AuthTitleSection[];
        name?: string | null;
        email?: string | null;
      }>
    ) {
      state.username = action.payload.username;
      state.token = action.payload.token;
      state.menus = action.payload.menus;
      if (action.payload.name !== undefined) state.name = action.payload.name ?? null;
      if (action.payload.email !== undefined) state.email = action.payload.email ?? null;
      state.isAuthenticated = true;
      state.hydrated = true;
    },
    updateProfile(
      state,
      action: PayloadAction<{ name: string; username: string; email: string }>
    ) {
      state.name = action.payload.name;
      state.username = action.payload.username;
      state.email = action.payload.email;
    },
    updateToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
    },
    setHydrated(state) {
      state.hydrated = true;
    },
    logout(state) {
      state.username = null;
      state.name = null;
      state.email = null;
      state.token = null;
      state.menus = [];
      state.isAuthenticated = false;
      state.hydrated = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.username = action.payload.username;
        state.menus = action.payload.menus;
        // Sinkronkan nama & email dari server agar selalu tersedia (mis. untuk
        // prefill "Dipinjam Oleh"). Hanya timpa bila dikirim server.
        if (action.payload.name !== undefined) state.name = action.payload.name ?? null;
        if (action.payload.email !== undefined) state.email = action.payload.email ?? null;
        state.isAuthenticated = true;
        state.hydrated = true;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.hydrated = true;
      });
  },
});

export const { setCredentials, updateProfile, updateToken, setHydrated, logout } =
  authSlice.actions;
export default authSlice.reducer;

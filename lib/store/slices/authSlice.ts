import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import api from "@/lib/axios";
import { loadAuth, saveAuth } from "@/lib/auth";

export type AuthSubMenu = {
  name: string;
  url: string | null;
  icon?: string | null;
  open_sidebar?: boolean;
};

export type AuthMenuGroup = {
  name: string;
  url: string | null;
  icon: string | null;
  sort_order: number;
  is_open: boolean;
  open_sidebar?: boolean;
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
        // Menu hanya DIGANTI bila jawabannya benar-benar membawa daftar berisi.
        //
        // Tanpa penjaga ini, satu jawaban `/auth/me` yang tidak membawa `menus`
        // (bentuk respons meleset, proxy membalas apa adanya, otoritas sesaat
        // tidak terbaca) langsung mengosongkan sidebar — dan Sidebar merender
        // daftar kosong itu TANPA bunyi apa pun, karena bagi komponen "tidak
        // punya menu" dan "menunya belum sempat datang" terlihat sama persis.
        // Yang tampak ke pemakai: menu hilang tiba-tiba dan baru kembali
        // setelah halaman di-refresh, karena refresh membacanya lagi dari
        // localStorage yang isinya tidak pernah ikut terhapus.
        //
        // Daftar yang benar-benar kosong tetap harus bisa masuk lewat login &
        // setCredentials — di situ memang berarti "otoritas ini tanpa menu".
        if (Array.isArray(action.payload.menus) && action.payload.menus.length > 0) {
          state.menus = action.payload.menus;

          // Simpanan lokal ikut disegarkan supaya keduanya tidak berbeda:
          // sebelumnya `fetchMe` hanya memperbarui Redux, sehingga perubahan
          // otoritas baru terlihat sampai refresh berikutnya — lalu hilang lagi.
          const tersimpan = loadAuth();
          if (tersimpan) {
            saveAuth(
              action.payload.username ?? tersimpan.username,
              tersimpan.token,
              action.payload.menus,
              action.payload.name ?? tersimpan.name,
              tersimpan.email,
            );
          }
        }
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

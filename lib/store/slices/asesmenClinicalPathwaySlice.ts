import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type AsesmenClinicalPathway = {
  id: number
  template_id: number
  medical_record_no: string
  patient_name: string
  gender: "L" | "P"
  birth_date: string
  admission_diagnosis: string
  primary_disease: string | null
  comorbidity: string | null
  complication: string | null
  procedure: string | null
  weight: string | null
  height: string | null
  admitted_at: string
  discharged_at: string | null
  length_of_stay: number | null
  care_plan: string | null
  room_id: number | null
  ward_class: string | null
  is_referral: boolean
  template?: {
    id: number
    max_days: number
    icd10?: { id: number; code: string; display: string } | null
  } | null
  room?: { id: number; name: string } | null
  executor_verified_at: string | null
  created_at?: string
}

// "" = semua, "selesai" = pelaksana sudah verifikasi, "belum" = belum.
export type AsesmenStatusFilter = "" | "selesai" | "belum"

type AsesmenState = {
  items: AsesmenClinicalPathway[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  ruangId: string
  status: AsesmenStatusFilter
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: AsesmenState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  ruangId: "",
  status: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchAsesmenCP = createAsyncThunk("asesmenCP/fetch", async (_, { getState }) => {
  const { page, search, ruangId, status } = (getState() as { asesmenCP: AsesmenState }).asesmenCP
  const res = await api.get("/clinical-pathway/asesmen", {
    params: {
      page,
      search: search || undefined,
      room_id: ruangId || undefined,
      status: status || undefined,
    },
  })
  return res.data.data
})

const asesmenCPSlice = createSlice({
  name: "asesmenCP",
  initialState,
  reducers: {
    setAsesmenCPSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setAsesmenCPPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    setAsesmenCPRuang(state, action: PayloadAction<string>) {
      state.ruangId = action.payload
      state.page = 1
      state.loaded = false
    },
    setAsesmenCPStatus(state, action: PayloadAction<AsesmenStatusFilter>) {
      state.status = action.payload
      state.page = 1
      state.loaded = false
    },
    invalidateAsesmenCP(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAsesmenCP.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchAsesmenCP.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchAsesmenCP.rejected, (state) => {
        state.loading = false
      })
  },
})

export const {
  setAsesmenCPSearch,
  setAsesmenCPPage,
  setAsesmenCPRuang,
  setAsesmenCPStatus,
  invalidateAsesmenCP,
} = asesmenCPSlice.actions
export default asesmenCPSlice.reducer

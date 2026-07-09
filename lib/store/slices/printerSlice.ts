import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import api from "@/lib/axios"

export type Printer = {
  id: number
  name: string
  document_type: "struk" | "label"
  printer_language: "escpos" | "tspl" | "zpl" | "epl"
  connection_type: "network" | "usb" | "bluetooth" | "serial"
  ip_address: string | null
  port: number | null
  device_path: string | null
  // receipt (struk) only
  paper_size: "58mm" | "80mm" | null
  char_per_line: number | null
  auto_cut: boolean
  // label only
  label_width_mm: number | null
  label_height_mm: number | null
  label_gap_mm: number | null
  code_page: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type PrinterState = {
  items: Printer[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: PrinterState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchPrinters = createAsyncThunk("printers/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { printers: PrinterState }).printers
  const res = await api.get("/master/printers", {
    params: { page, search: search || undefined },
  })
  return res.data.data
})

const printerSlice = createSlice({
  name: "printers",
  initialState,
  reducers: {
    setPrinterSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setPrinterPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidatePrinters(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPrinters.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchPrinters.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchPrinters.rejected, (state) => {
        state.loading = false
      })
  },
})

export const { setPrinterSearch, setPrinterPage, invalidatePrinters } = printerSlice.actions
export default printerSlice.reducer

import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { api } from "@/lib/nafsul/api"
import type { Paginated } from "@/lib/nafsul/types"

/**
 * Satu baris rincian iuran di dalam sebuah kuitansi.
 *
 * Nama fieldnya Inggris, mengikuti kolom database `transactions` — berbeda
 * dari master Nafsul lain yang kontrak API-nya masih berbahasa Indonesia.
 *
 * `amount`, `discount`, dan `total` datang sebagai string: itu kolom DECIMAL,
 * dan mengubahnya jadi float di JSON akan membuang ketepatan nilai rupiah.
 */
export type TransaksiRincian = {
  id: number
  /** Kunci publik untuk view/update/delete. */
  uuid: string
  member_id: number
  member_number: string | null
  member_name: string | null
  rate_id: number
  rate_name: string | null
  /** Periode iuran "MM/YYYY"; `null` untuk tarif SEKALI BAYAR yang tak berperiode. */
  payment_period: string | null
  amount: string
  discount: string
  total: string
}

/** Satu kuitansi pembayaran — menaungi banyak rincian. */
export type TransaksiHeader = {
  id: number
  /** Kunci publik untuk view/update/delete. */
  uuid: string
  transaction_number: string
  /**
   * Tanggal uang DITERIMA ("YYYY-MM-DD"). Berbeda dari `created_at` yang
   * mencatat kapan barisnya dibuat di sistem — setoran Sabtu bisa baru diinput
   * Senin. `null` hanya pada baris lama yang belum sempat terisi.
   */
  date: string | null
  /** "kelompok" = setoran ketua kelompok, "pribadi" = anggota perorangan. */
  transaction_type: "kelompok" | "pribadi"
  /**
   * Nama ketua kelompok pemilik kuitansi, diambil dari rincian pertama.
   *
   * `null` pada kuitansi yang belum punya rincian sama sekali. Pada kuitansi
   * PRIBADI nilainya diabaikan — daftar menampilkan "Pribadi" yang diturunkan
   * dari `transaction_type`, bukan nama ketua penampung anggota perorangan.
   */
  group_leader_name: string | null
  total: string
  member_deduction: string
  /** "amount" = rupiah, "percent" = persen dari total rincian. */
  member_deduction_type: "amount" | "percent"
  /** Angka yang diketik petugas apa adanya (5 untuk "5%"). */
  member_deduction_input: string
  group_leader_deduction: string
  /** PERSENTASE komisi ketua kelompok yang diketik petugas (10 untuk 10%). */
  group_leader_fee_percent: string
  group_leader_fee: string
  payment: string
  /** "other" = lain-lain (potong tabungan, barter, dsb). */
  payment_method: "transfer" | "cash" | "other"
  /**
   * Jejak pemeriksaan kuitansi. `validation_at` null = BELUM divalidasi — itu
   * satu-satunya penanda statusnya, tidak ada boolean terpisah.
   */
  validation_at: string | null
  validation_by: string | null
  /** Positif = kurang bayar, negatif = lebih bayar. */
  balance: string
  transactions_count: number
  created_at: string | null
  /** Hanya terisi pada respons `show`. */
  transactions?: TransaksiRincian[]
}

export const PER_PAGE = 25

type TransaksiState = {
  items: TransaksiHeader[]
  totalItems: number
  totalPages: number
  page: number
  search: string
  /** Kosong = semua cara bayar. */
  paymentMethod: string
  loading: boolean
  loaded: boolean
  dirty: boolean
}

const initialState: TransaksiState = {
  items: [],
  totalItems: 0,
  totalPages: 1,
  page: 1,
  search: "",
  paymentMethod: "",
  loading: false,
  loaded: false,
  dirty: false,
}

export const fetchTransaksi = createAsyncThunk(
  "nafsulTransaksi/fetch",
  async (_, { getState }) => {
    const { page, search, paymentMethod } = (
      getState() as { nafsulTransaksi: TransaksiState }
    ).nafsulTransaksi

    return api<Paginated<TransaksiHeader>>("/transaksi/header", {
      params: {
        page,
        per_page: PER_PAGE,
        search: search || undefined,
        payment_method: paymentMethod || undefined,
      },
    })
  }
)

const nafsulTransaksiSlice = createSlice({
  name: "nafsulTransaksi",
  initialState,
  reducers: {
    setTransaksiSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
      state.loaded = false
    },
    setTransaksiPaymentMethod(state, action: PayloadAction<string>) {
      state.paymentMethod = action.payload
      state.page = 1
      state.loaded = false
    },
    setTransaksiPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
    },
    invalidateTransaksi(state) {
      state.dirty = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransaksi.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchTransaksi.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.totalItems = action.payload.total
        state.totalPages = action.payload.last_page
        state.loading = false
        state.loaded = true
        state.dirty = false
      })
      .addCase(fetchTransaksi.rejected, (state) => {
        state.loading = false
      })
  },
})

export const {
  setTransaksiSearch,
  setTransaksiPaymentMethod,
  setTransaksiPage,
  invalidateTransaksi,
} = nafsulTransaksiSlice.actions

export default nafsulTransaksiSlice.reducer

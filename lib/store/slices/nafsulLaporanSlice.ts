import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { api } from "@/lib/nafsul/api"

/**
 * Laporan Nafsul — rekap pembayaran bulanan Binroh, satu-satunya bentuk laporan
 * modul ini.
 *
 * Sebulan pembayaran dipecah per CARA BAYAR — TRANSFER, TUNAI, lalu LAIN-LAIN
 * — dan tiap blok ditutup total kotor, total potongan, dan total bersih. Blok
 * ketiga menampung setoran 2014–2024 dari sistem lama yang masuk tanpa penanda
 * cara bayar; blok itu hilang sendiri begitu tidak ada lagi kuitansi `other`. Satu baris =
 * satu ANGGOTA pada satu KUITANSI, bukan satu periode iuran: orang yang
 * melunasi dua belas bulan sekaligus tetap satu baris dengan nominal yang sudah
 * dijumlahkan — itu yang ditanyakan lembar ini ("siapa menyetor berapa"), bukan
 * "bulan apa saja yang tertutup".
 *
 * Angka rupiah datang sebagai STRING: itu kolom DECIMAL, dan mengubahnya jadi
 * float akan membuang ketepatan nilai rupiah.
 */

/** Satu baris lembar = satu anggota pada satu kuitansi. */
export type RekapRow = {
  /** Kunci render, dari pasangan kuitansi+anggota; tidak dipakai selain itu. */
  key: string
  /** Tanggal kuitansi ("YYYY-MM-DD"). */
  date: string
  transaction_number: string
  transaction_type: "kelompok" | "pribadi"
  /** Diabaikan pada kuitansi pribadi — yang tampil "Pribadi". */
  group_leader_name: string | null
  member_name: string | null
  member_number: string | null
  /** "L"/"B" pada data berjalan, tapi kolomnya string bebas dan boleh kosong. */
  visit: string | null
  amount: string
  deduction: string
}

/** Satu blok cara bayar beserta angka penutupnya. */
export type RekapBlock = {
  payment_method: string
  rows: RekapRow[]
  summary: {
    rows: number
    amount: string
    deduction: string
    /** `amount - deduction`; dihitung backend agar tidak ada dua versinya. */
    net: string
  }
}

/** `{ month: 8, year: 2026 }` → "2026-08", bentuk `<input type="month">`. */
function periodeInput(p: { month: number; year: number }): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`
}

/** "2026-08" / "2026-08-14" → "08/2026" yang diminta API. */
function periodeApi(value: string): string | undefined {
  const m = /^(\d{4})-(\d{2})/.exec(value)
  return m ? `${m[2]}/${m[1]}` : undefined
}

/**
 * Tanggal yang dikirim ke API, atau undefined bila yang dipilih sebulan penuh.
 *
 * Dibedakan dari BENTUK nilainya, bukan disimpan sebagai penanda terpisah:
 * penanda terpisah bisa menyala untuk nilai yang tidak punya tanggal.
 */
function tanggalApi(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

type LaporanState = {
  blocks: RekapBlock[]
  /**
   * Periode yang direkap: "YYYY-MM" untuk sebulan penuh, "YYYY-MM-DD" untuk
   * satu tanggal saja.
   *
   * KOSONG saat halaman baru dibuka, dan kosong itu berarti "biar server yang
   * memilih": backend menjawabnya dengan bulan terakhir yang ada setorannya,
   * lalu nilai ini diisi dari jawaban tersebut. Memilih sendiri bulan berjalan
   * hanya benar kalau setoran bulan ini sudah masuk — pada tanggal 1, atau pada
   * basis data yang datanya berhenti beberapa bulan lalu, yang tampil justru
   * lembar kosong yang tidak bisa dibedakan dari data hilang, lengkap dengan
   * pencarian yang selalu nihil karena mencari di dalam bulan yang kosong.
   */
  period: string
  /**
   * Kata kunci yang sedang dipakai — nama/no. anggota, no. pembayaran, atau
   * nama ketua. Kosong berarti seluruh bulan.
   *
   * Dicari di SERVER, bukan disaring di peramban atas baris yang sudah ada:
   * tiap blok ditutup baris total, dan total hasil hitungan ulang di frontend
   * akan jadi versi kedua dari angka yang sama.
   */
  search: string
  /** Cara bayar yang ditampilkan; kosong berarti semuanya. */
  method: string
  /** Backend memotong di `MAX_ROWS`; ditampilkan sebagai peringatan. */
  truncated: boolean
  loading: boolean
  /** true setelah pemuatan pertama yang berhasil. */
  loaded: boolean
  /** true setelah ada mutasi transaksi — memicu muat ulang. */
  dirty: boolean
  /**
   * Sebab permintaan terakhir gagal, atau null bila tidak gagal.
   *
   * WAJIB ada: tanpa penanda ini, permintaan yang gagal meninggalkan
   * `loading = false` DAN `loaded = false` sekaligus — keadaan yang tidak bisa
   * dibedakan dari "belum sempat memuat", sehingga layarnya menggantung di
   * tulisan "Memuat data..." selamanya tanpa pernah menyebut ada yang salah.
   *
   * Isinya kunci kamus bila kegagalannya umum, atau kalimat mentah dari server
   * bila ada — `t()` mengembalikan masukan apa adanya untuk yang bukan kunci.
   */
  error: string | null
}

const initialState: LaporanState = {
  blocks: [],
  period: "",
  search: "",
  method: "",
  truncated: false,
  loading: false,
  loaded: false,
  dirty: false,
  error: null,
}

/** Respons rekap bulanan: blok per cara bayar, bukan paginator. */
export type RekapResponse = {
  period: { month: number; year: number; date_from: string; date_to: string }
  blocks: RekapBlock[]
  truncated: boolean
}

export const fetchLaporanRekap = createAsyncThunk(
  "nafsulLaporan/rekap",
  async (_, { getState }) => {
    const { period, search, method } = (getState() as { nafsulLaporan: LaporanState })
      .nafsulLaporan

    return api<RekapResponse>("/laporan/rekap-pembayaran", {
      // Ketiganya opsional, dan `api()` sudah membuang nilai kosong dari query
      // string. Kosong berarti "tanpa penyaring" — untuk `period` artinya bulan
      // terakhir yang ada setorannya, dipilih backend lalu dikembalikan lewat
      // `period` pada responsnya.
      params: {
        period: periodeApi(period),
        date: tanggalApi(period),
        search,
        payment_method: method,
      },
    })
  }
)

const nafsulLaporanSlice = createSlice({
  name: "nafsulLaporan",
  initialState,
  reducers: {
    /**
     * Setel SELURUH penyaring sekaligus — bulan, kata kunci, cara bayar.
     *
     * Satu action untuk ketiganya, bukan tiga action berurutan: masing-masing
     * mengosongkan `loaded`, dan tiga kali berturut-turut membuat efek pemuatan
     * di halaman berangkat tiga kali untuk satu penekanan tombol Cari.
     */
    setLaporanFilter(
      state,
      action: PayloadAction<{ period: string; search: string; method: string }>,
    ) {
      state.period = action.payload.period
      state.search = action.payload.search.trim()
      state.method = action.payload.method
      state.loaded = false
    },

    /**
     * Tandai laporan usang.
     *
     * Dipakai halaman lain setelah mengubah transaksi (simpan, hapus,
     * validasi): laporan ini menghitung baris yang sama, jadi ikut basi.
     */
    invalidateLaporan(state) {
      state.dirty = true
    },

    /**
     * Muat ulang setelah gagal.
     *
     * `error` dikosongkan lebih dulu supaya efek pemuatan di halaman melihat
     * keadaan "belum dimuat dan tidak sedang bergalat", lalu berangkat lagi.
     */
    retryLaporan(state) {
      state.error = null
      state.loaded = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLaporanRekap.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchLaporanRekap.fulfilled, (state, action) => {
        // Bulan diambil dari JAWABAN, bukan dari yang dikirim: permintaan
        // pertama sengaja tidak menyebut bulan, dan bulan yang dipilih backend
        // harus terbaca di pemilih bulan — kalau tidak, isiannya kosong
        // sementara tabelnya berisi, dan menekan Cari untuk kata kunci apa pun
        // akan diam-diam melompat ke bulan lain.
        // Hanya diisi saat masih kosong, yaitu pada permintaan PERTAMA yang
        // memang sengaja tidak menyebut periode. Menimpanya tiap kali akan
        // membuang tanggal yang barusan dipilih petugas — jawaban server hanya
        // menyebut bulan tempat tanggal itu berada.
        if (!state.period) state.period = periodeInput(action.payload.period)
        state.blocks = action.payload.blocks
        state.truncated = action.payload.truncated
        state.loading = false
        state.loaded = true
        state.dirty = false
        state.error = null
      })
      .addCase(fetchLaporanRekap.rejected, (state, action) => {
        state.loading = false
        // `dirty` dilepas juga: kalau dibiarkan menyala, efek pemuatan di
        // halaman langsung mencoba lagi dan gagal lagi tanpa henti.
        state.dirty = false
        state.error = action.error.message || "nafsulLaporan.loadFailed"
      })
  },
})

export const {
  setLaporanFilter,
  invalidateLaporan,
  retryLaporan,
} = nafsulLaporanSlice.actions

export default nafsulLaporanSlice.reducer

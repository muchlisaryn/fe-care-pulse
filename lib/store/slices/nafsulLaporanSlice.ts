import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { api } from "@/lib/nafsul/api"
import { rentangSebulanTerakhir } from "@/lib/dateRange"

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
  /**
   * Rentang tanggal bebas, "YYYY-MM-DD". Keduanya harus terisi agar dipakai;
   * salah satu saja diabaikan server, karena rentang setengah terbuka pada
   * lembar yang ditutup baris total tidak punya arti yang jelas.
   *
   * MENANG atas `period`: begitu rentangnya terisi, pemilih bulan tidak lagi
   * menentukan isi lembar.
   */
  dateFrom: string
  dateTo: string
  /**
   * Rentang yang BENAR-BENAR dipakai server, dari responsnya.
   *
   * Dipakai menulis judul blok: dengan rentang bebas, judul tidak boleh lagi
   * menyebut satu nama bulan begitu saja — rentang yang memotong dua bulan
   * membuat judul dan baris totalnya berbohong.
   */
  appliedFrom: string
  appliedTo: string
  /** Backend memotong di `MAX_ROWS`; ditampilkan sebagai peringatan. */
  truncated: boolean
  /**
   * Paginasi lembar. Satuannya SATU BARIS lembar = satu pasangan
   * kuitansi+anggota, berapa pun rincian periode di dalamnya — itu yang
   * dikelompokkan server, jadi rincian sebuah baris tidak pernah dihitung
   * sebagai baris tersendiri.
   */
  page: number
  perPage: number
  total: number
  lastPage: number
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

// Rentang bawaan sebulan terakhir — sama dengan daftar transaksi & rekap jasa,
// supaya "sebulan terakhir" berarti hal yang sama di seluruh modul. Dipakai
// sebagai isi awal, bukan dibiarkan kosong: lembar ini tanpa penyaring akan
// jatuh ke bulan berjalan, yang pada tanggal 1 tampil kosong dan tidak bisa
// dibedakan dari data hilang.
const bawaan = rentangSebulanTerakhir()

/** Baris per halaman; disamakan dengan bawaan server. */
export const PER_HALAMAN = 50

/**
 * Batas atas `per_page` yang diterima server. Dipakai export untuk menarik
 * SELURUH lembar dalam satu permintaan — berkasnya harus memuat semua baris
 * hasil penyaringan, bukan hanya halaman yang kebetulan sedang tampil.
 */
export const PER_HALAMAN_EXPORT = 5000

const initialState: LaporanState = {
  blocks: [],
  period: "",
  search: "",
  method: "",
  dateFrom: bawaan.from,
  dateTo: bawaan.to,
  page: 1,
  perPage: PER_HALAMAN,
  total: 0,
  lastPage: 1,
  appliedFrom: "",
  appliedTo: "",
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
  pagination: { page: number; per_page: number; total: number; last_page: number }
  truncated: boolean
}

export const fetchLaporanRekap = createAsyncThunk(
  "nafsulLaporan/rekap",
  async (_, { getState }) => {
    const { period, search, method, dateFrom, dateTo, page, perPage } = (
      getState() as { nafsulLaporan: LaporanState }
    ).nafsulLaporan

    // Rentang hanya dikirim bila LENGKAP: sepotong saja akan diabaikan server,
    // dan mengirimnya tetap cuma membuat query string yang menyesatkan saat
    // ditelusuri di log.
    const rentangUtuh = dateFrom !== "" && dateTo !== ""

    return api<RekapResponse>("/laporan/rekap-pembayaran", {
      // Ketiganya opsional, dan `api()` sudah membuang nilai kosong dari query
      // string. Kosong berarti "tanpa penyaring" — untuk `period` artinya bulan
      // terakhir yang ada setorannya, dipilih backend lalu dikembalikan lewat
      // `period` pada responsnya.
      params: {
        period: periodeApi(period),
        date: tanggalApi(period),
        date_from: rentangUtuh ? dateFrom : undefined,
        date_to: rentangUtuh ? dateTo : undefined,
        search,
        payment_method: method,
        page,
        per_page: perPage,
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
      action: PayloadAction<{
        period: string
        search: string
        method: string
        dateFrom: string
        dateTo: string
      }>,
    ) {
      state.period = action.payload.period
      state.search = action.payload.search.trim()
      state.method = action.payload.method
      state.dateFrom = action.payload.dateFrom
      state.dateTo = action.payload.dateTo
      // Penyaring berubah → jumlah barisnya berubah, jadi kembali ke halaman
      // pertama. Tanpa ini penyaringan yang hasilnya sedikit bisa mendarat di
      // halaman kosong yang tidak bisa dibedakan dari "tidak ada data".
      state.page = 1
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

    /** Pindah halaman tanpa menyentuh penyaring lain. */
    setLaporanPage(state, action: PayloadAction<number>) {
      state.page = action.payload
      state.loaded = false
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
        state.appliedFrom = action.payload.period.date_from
        state.appliedTo = action.payload.period.date_to
        state.blocks = action.payload.blocks
        state.total = action.payload.pagination.total
        state.lastPage = action.payload.pagination.last_page
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
  setLaporanPage,
  invalidateLaporan,
  retryLaporan,
} = nafsulLaporanSlice.actions

export default nafsulLaporanSlice.reducer

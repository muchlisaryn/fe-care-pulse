import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { api } from "@/lib/nafsul/api"
import type { Paginated } from "@/lib/nafsul/types"

/**
 * Laporan Nafsul — dua sudut pandang atas data iuran yang sama, masing-masing
 * dengan penyaring, halaman, dan cache sendiri:
 *
 *  - `penerimaan` — per KUITANSI: uang yang masuk, potongan, jasa ketua.
 *  - `anggota`    — per RINCIAN: siapa membayar periode apa.
 *
 * Keduanya dipisah, bukan satu state bersama, supaya berpindah tab tidak
 * menghapus hasil saring tab sebelumnya — petugas kerap membandingkan keduanya
 * bolak-balik untuk satu pertanyaan yang sama.
 *
 * Angka rupiah datang sebagai STRING: itu kolom DECIMAL, dan mengubahnya jadi
 * float akan membuang ketepatan nilai rupiah.
 */

/** Satu baris tab Penerimaan = satu kuitansi. */
export type LaporanPenerimaanRow = {
  id: number
  uuid: string
  transaction_number: string
  /** Tanggal uang diterima ("YYYY-MM-DD"); null pada baris lama. */
  date: string | null
  transaction_type: "kelompok" | "pribadi"
  /** Diabaikan pada kuitansi pribadi — yang tampil "Pribadi". */
  group_leader_name: string | null
  transactions_count: number
  total: string
  member_deduction: string
  group_leader_deduction: string
  group_leader_fee: string
  payment: string
  payment_method: "transfer" | "cash" | "other"
  /** null = belum divalidasi; tidak ada boolean terpisah. */
  validation_at: string | null
  validation_by: string | null
}

/** Satu baris tab Per Anggota = satu rincian iuran. */
export type LaporanAnggotaRow = {
  id: number
  uuid: string
  member_number: string | null
  member_name: string | null
  region_name: string | null
  group_leader_name: string | null
  /** "MM/YYYY"; null untuk tarif SEKALI BAYAR yang tak berperiode. */
  payment_period: string | null
  rate_code: string | null
  rate_name: string | null
  amount: string
  discount: string
  total: string
  /** null = rincian ini masih tagihan, belum masuk kuitansi mana pun. */
  transaction_number: string | null
  transaction_date: string | null
  payment_method: string | null
  validation_at: string | null
}

/** Rekap tab Penerimaan atas SELURUH baris hasil saring, bukan satu halaman. */
export type LaporanPenerimaanSummary = {
  receipts: number
  total: string
  member_deduction: string
  group_leader_deduction: string
  group_leader_fee: string
  payment: string
}

/** Rekap tab Per Anggota atas SELURUH baris hasil saring. */
export type LaporanAnggotaSummary = {
  rows: number
  /** Jumlah ORANG, bukan jumlah baris — satu anggota bisa punya banyak periode. */
  members: number
  amount: string
  discount: string
  total: string
}

export type LaporanTab = "penerimaan" | "anggota"

export const PER_PAGE = 25

/**
 * Batas baris sekali unduh, sama dengan `MAX_PER_PAGE` di backend.
 *
 * Export meminta satu halaman sebesar ini dengan penyaring yang sedang aktif —
 * bukan lewat endpoint tersendiri — supaya isi berkas dan isi layar tidak
 * mungkin berangkat dari angka yang berbeda.
 */
export const EXPORT_PER_PAGE = 5000

export type PenerimaanFilters = {
  search: string
  /** "YYYY-MM-DD"; kosong = tanpa batas di sisi itu. */
  dateFrom: string
  dateTo: string
  /** Kosong = semua jenis. */
  transactionType: string
  /** Kosong = semua cara bayar. */
  paymentMethod: string
  /** "" | "validated" | "unvalidated". */
  validation: string
}

export type AnggotaFilters = {
  search: string
  /** Kode wilayah / ketua kelompok / tarif; kosong = semua. */
  regionCode: string
  groupLeaderCode: string
  rateCode: string
  /**
   * Rentang periode iuran, disimpan sebagai "YYYY-MM" (nilai `<input
   * type="month">`) dan diterjemahkan ke "MM/YYYY" saat dikirim — itu format
   * yang dipakai kontrak API transaksi.
   */
  periodFrom: string
  periodTo: string
  /** Rentang tanggal KUITANSI — berbeda dari periode iuran di atas. */
  dateFrom: string
  dateTo: string
  /** "" | "paid" | "unpaid". */
  status: string
}

/** Hari ini sebagai "YYYY-MM-DD", dirakit dari komponen tanggal LOKAL. */
function hariIni(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Tanggal `mundur` hari yang lalu sebagai "YYYY-MM-DD". */
function mundurHari(mundur: number): string {
  const d = new Date()
  d.setDate(d.getDate() - mundur)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Penyaring KOSONG — satu-satunya bentuk yang boleh jadi `initialState`.
 *
 * Bawaan yang berbasis jam (lihat `penerimaanAwal`) tidak boleh dihitung di
 * sini: `initialState` dievaluasi sekali saat modul dimuat, dan di server
 * Next modul itu hidup selama prosesnya hidup. Server yang sudah menyala sejak
 * kemarin akan terus menanam tanggal KEMARIN ke HTML hasil SSR, sedangkan
 * peramban menghitung tanggal hari ini saat hidrasi — mismatch yang muncul
 * setiap hari, bahkan ketika zona waktu keduanya sama. Peramban di zona waktu
 * yang berbeda dari server berselisih tanpa menunggu ganti hari.
 *
 * Jadi render pertama selalu kosong di kedua sisi, lalu `seedLaporanDefaults`
 * mengisinya dari jam PERAMBAN setelah mount — pola yang sama dengan
 * `LanguageProvider`, yang juga selalu merender `DEFAULT_LANG` lebih dulu.
 */
function penerimaanKosong(): PenerimaanFilters {
  return {
    search: "",
    dateFrom: "",
    dateTo: "",
    transactionType: "",
    paymentMethod: "",
    validation: "",
  }
}

/** Penyaring kosong tab Per Anggota — alasannya sama dengan di atas. */
function anggotaKosong(): AnggotaFilters {
  return {
    search: "",
    regionCode: "",
    groupLeaderCode: "",
    rateCode: "",
    periodFrom: "",
    periodTo: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  }
}

/**
 * Bawaan tab Penerimaan: 30 HARI TERAKHIR (H-30 s.d. hari ini).
 *
 * HANYA boleh dipanggil dari peramban (lewat `seedLaporanDefaults`), tidak
 * pernah saat modul dimuat — lihat `penerimaanKosong`.
 *
 * SENGAJA bukan "bulan berjalan" seperti Dashboard Nafsul. Rentang bulan
 * berjalan membuat laporan ini terbuka KOSONG setiap awal bulan — pada tanggal
 * 1 rentangnya cuma satu hari, dan setoran terakhir hampir selalu jatuh di
 * bulan sebelumnya. Layar kosong pada laporan tidak terbaca sebagai "belum ada
 * setoran bulan ini", melainkan sebagai laporannya yang rusak.
 *
 * Rentang bergulir tidak punya batas bulan untuk ditabrak, dan angkanya cocok
 * dengan bawaan laporan CSSD yang memakai jendela yang sama.
 *
 * Rentang kosong juga bukan pilihan: permintaan pertamanya akan memindai
 * seluruh riwayat kuitansi hanya untuk menampilkan 25 baris pertama.
 */
function penerimaanAwal(): PenerimaanFilters {
  return {
    search: "",
    dateFrom: mundurHari(30),
    dateTo: hariIni(),
    transactionType: "",
    paymentMethod: "",
    validation: "",
  }
}

/**
 * Bawaan tab Per Anggota: SETAHUN BERJALAN, disaring pada PERIODE iuran.
 *
 * Sama seperti `penerimaanAwal`, hanya dipanggil dari peramban.
 *
 * Sengaja bukan rentang tanggal kuitansi seperti tab sebelah: menyaring tanggal
 * kuitansi otomatis membuang rincian yang belum dibayar (baris itu memang belum
 * punya kuitansi), padahal justru tagihan itulah yang dicari saat laporan ini
 * dibuka untuk menelusuri siapa yang belum menyetor.
 */
function anggotaAwal(): AnggotaFilters {
  const tahun = new Date().getFullYear()
  return {
    search: "",
    regionCode: "",
    groupLeaderCode: "",
    rateCode: "",
    periodFrom: `${tahun}-01`,
    periodTo: `${tahun}-12`,
    dateFrom: "",
    dateTo: "",
    status: "",
  }
}

/** "YYYY-MM" (nilai `<input type="month">`) → "MM/YYYY" yang diminta API. */
function periodeApi(value: string): string | undefined {
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  return m ? `${m[2]}/${m[1]}` : undefined
}

/**
 * Parameter permintaan tab Penerimaan.
 *
 * Diekspor supaya export .xlsx memakai fungsi yang SAMA dengan yang mengisi
 * tabel — hanya `per_page`-nya yang berbeda. Kalau keduanya merakit parameter
 * sendiri-sendiri, cepat atau lambat ada penyaring yang terpasang di satu sisi
 * saja dan berkasnya berisi baris yang tidak ada di layar.
 */
export function paramsPenerimaan(f: PenerimaanFilters, page: number, perPage: number) {
  return {
    page,
    per_page: perPage,
    search: f.search || undefined,
    date_from: f.dateFrom || undefined,
    date_to: f.dateTo || undefined,
    transaction_type: f.transactionType || undefined,
    payment_method: f.paymentMethod || undefined,
    validation: f.validation || undefined,
  }
}

/** Parameter permintaan tab Per Anggota — lihat alasannya di `paramsPenerimaan`. */
export function paramsAnggota(f: AnggotaFilters, page: number, perPage: number) {
  return {
    page,
    per_page: perPage,
    search: f.search || undefined,
    region_code: f.regionCode || undefined,
    group_leader_code: f.groupLeaderCode || undefined,
    rate_code: f.rateCode || undefined,
    period_from: periodeApi(f.periodFrom),
    period_to: periodeApi(f.periodTo),
    date_from: f.dateFrom || undefined,
    date_to: f.dateTo || undefined,
    status: f.status || undefined,
  }
}

type TabState<TRow, TSummary> = {
  items: TRow[]
  summary: TSummary | null
  totalItems: number
  totalPages: number
  page: number
  loading: boolean
  loaded: boolean
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

type LaporanState = {
  tab: LaporanTab
  /**
   * Bawaan penyaring sudah diisi dari jam peramban.
   *
   * Pemuatan data menunggu ini. Tanpa penantian itu, permintaan pertama
   * berangkat dengan rentang tanggal KOSONG — memindai seluruh riwayat
   * kuitansi hanya untuk menampilkan 25 baris pertama, persis yang dihindari
   * dengan memberi bawaan.
   */
  seeded: boolean
  penerimaan: TabState<LaporanPenerimaanRow, LaporanPenerimaanSummary> & {
    filters: PenerimaanFilters
  }
  anggota: TabState<LaporanAnggotaRow, LaporanAnggotaSummary> & {
    filters: AnggotaFilters
  }
}

const tabKosong = {
  items: [],
  summary: null,
  totalItems: 0,
  totalPages: 1,
  page: 1,
  loading: false,
  loaded: false,
  dirty: false,
  error: null,
}

const initialState: LaporanState = {
  tab: "penerimaan",
  seeded: false,
  penerimaan: { ...tabKosong, items: [], summary: null, filters: penerimaanKosong() },
  anggota: { ...tabKosong, items: [], summary: null, filters: anggotaKosong() },
}

/** Respons laporan = paginator biasa + rekap seluruh hasil saring. */
type LaporanResponse<TRow, TSummary> = Paginated<TRow> & { summary: TSummary }

export const fetchLaporanPenerimaan = createAsyncThunk(
  "nafsulLaporan/penerimaan",
  async (_, { getState }) => {
    const { page, filters } = (getState() as { nafsulLaporan: LaporanState }).nafsulLaporan
      .penerimaan

    return api<LaporanResponse<LaporanPenerimaanRow, LaporanPenerimaanSummary>>(
      "/laporan/penerimaan",
      { params: paramsPenerimaan(filters, page, PER_PAGE) }
    )
  }
)

export const fetchLaporanAnggota = createAsyncThunk(
  "nafsulLaporan/anggota",
  async (_, { getState }) => {
    const { page, filters } = (getState() as { nafsulLaporan: LaporanState }).nafsulLaporan
      .anggota

    return api<LaporanResponse<LaporanAnggotaRow, LaporanAnggotaSummary>>(
      "/laporan/per-anggota",
      { params: paramsAnggota(filters, page, PER_PAGE) }
    )
  }
)

const nafsulLaporanSlice = createSlice({
  name: "nafsulLaporan",
  initialState,
  reducers: {
    setLaporanTab(state, action: PayloadAction<LaporanTab>) {
      state.tab = action.payload
    },

    /**
     * Isi bawaan penyaring dari jam PERAMBAN, sekali saja seumur sesi.
     *
     * Dipanggil dari efek mount halaman — jadi tidak pernah ikut jalan saat
     * SSR, dan HTML server tidak pernah memuat tanggal apa pun untuk
     * diperselisihkan saat hidrasi.
     *
     * Dijaga agar tidak mengulang: berpindah halaman lalu kembali tidak boleh
     * menimpa rentang yang sudah diubah petugas.
     */
    seedLaporanDefaults(state) {
      if (state.seeded) return
      state.seeded = true
      state.penerimaan.filters = penerimaanAwal()
      state.anggota.filters = anggotaAwal()
    },

    /**
     * Seluruh penyaring tab Penerimaan disetel SEKALIGUS, saat tombol Cari
     * ditekan.
     *
     * Satu reducer per penyaring berarti satu kali Cari memicu beberapa kali
     * `loaded = false`, dan karenanya beberapa permintaan yang saling
     * membatalkan hasil.
     */
    setPenerimaanFilters(state, action: PayloadAction<PenerimaanFilters>) {
      state.penerimaan.filters = action.payload
      state.penerimaan.page = 1
      state.penerimaan.loaded = false
    },
    setPenerimaanPage(state, action: PayloadAction<number>) {
      state.penerimaan.page = action.payload
      state.penerimaan.loaded = false
    },

    setAnggotaFilters(state, action: PayloadAction<AnggotaFilters>) {
      state.anggota.filters = action.payload
      state.anggota.page = 1
      state.anggota.loaded = false
    },
    setAnggotaPage(state, action: PayloadAction<number>) {
      state.anggota.page = action.payload
      state.anggota.loaded = false
    },

    /**
     * Tandai kedua tab usang.
     *
     * Dipakai halaman lain setelah mengubah transaksi (simpan, hapus,
     * validasi): laporannya menghitung baris yang sama, jadi keduanya ikut
     * basi — bukan hanya yang kebetulan sedang dibuka.
     */
    invalidateLaporan(state) {
      state.penerimaan.dirty = true
      state.anggota.dirty = true
    },

    /**
     * Muat ulang satu tab setelah gagal.
     *
     * `error` dikosongkan lebih dulu supaya efek pemuatan di halaman melihat
     * keadaan "belum dimuat dan tidak sedang bergalat", lalu berangkat lagi.
     */
    retryLaporan(state, action: PayloadAction<LaporanTab>) {
      const t = state[action.payload]
      t.error = null
      t.loaded = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLaporanPenerimaan.pending, (state) => {
        state.penerimaan.loading = true
        state.penerimaan.error = null
      })
      .addCase(fetchLaporanPenerimaan.fulfilled, (state, action) => {
        state.penerimaan.items = action.payload.data
        state.penerimaan.summary = action.payload.summary
        state.penerimaan.totalItems = action.payload.total
        state.penerimaan.totalPages = action.payload.last_page
        state.penerimaan.loading = false
        state.penerimaan.loaded = true
        state.penerimaan.dirty = false
        state.penerimaan.error = null
      })
      .addCase(fetchLaporanPenerimaan.rejected, (state, action) => {
        state.penerimaan.loading = false
        // `dirty` dilepas juga: kalau dibiarkan menyala, efek pemuatan di
        // halaman langsung mencoba lagi dan gagal lagi tanpa henti.
        state.penerimaan.dirty = false
        state.penerimaan.error = action.error.message || "nafsulLaporan.loadFailed"
      })
      .addCase(fetchLaporanAnggota.pending, (state) => {
        state.anggota.loading = true
        state.anggota.error = null
      })
      .addCase(fetchLaporanAnggota.fulfilled, (state, action) => {
        state.anggota.items = action.payload.data
        state.anggota.summary = action.payload.summary
        state.anggota.totalItems = action.payload.total
        state.anggota.totalPages = action.payload.last_page
        state.anggota.loading = false
        state.anggota.loaded = true
        state.anggota.dirty = false
        state.anggota.error = null
      })
      .addCase(fetchLaporanAnggota.rejected, (state, action) => {
        state.anggota.loading = false
        // `dirty` dilepas juga: kalau dibiarkan menyala, efek pemuatan di
        // halaman langsung mencoba lagi dan gagal lagi tanpa henti.
        state.anggota.dirty = false
        state.anggota.error = action.error.message || "nafsulLaporan.loadFailed"
      })
  },
})

export const {
  setLaporanTab,
  seedLaporanDefaults,
  setPenerimaanFilters,
  setPenerimaanPage,
  setAnggotaFilters,
  setAnggotaPage,
  invalidateLaporan,
  retryLaporan,
} = nafsulLaporanSlice.actions

export default nafsulLaporanSlice.reducer

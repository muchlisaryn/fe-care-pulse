"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { ChevronRight, Loader2, Search, Sheet } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { CurrencyCell } from "@/components/atoms/CurrencyCell"
import { Input } from "@/components/atoms/Input"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { api } from "@/lib/nafsul/api"
import { formatDate } from "@/lib/nafsul/format"
import { downloadXlsxSections, type XlsxSection } from "@/lib/excel"
import { localeOf, useLanguage } from "@/lib/i18n"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchLaporanRekap,
  retryLaporan,
  setLaporanFilter,
  setLaporanPage,
  PER_HALAMAN_EXPORT,
  type AnggotaKuitansiResponse,
  type RekapBlock,
  type RekapDetailBlock,
  type RekapDetailResponse,
  type RekapKuitansi,
  type RekapRow,
} from "@/lib/store/slices/nafsulLaporanSlice"

/** Kelas satu sel tabel — dipakai seluruh blok supaya tinggi barisnya sama. */
const SEL = "whitespace-nowrap px-4 py-2.5"

const KEPALA =
  "border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400"

/** Sel kosong tidak pernah dibiarkan kosong: nilai null selalu jadi em dash. */
function Kosong() {
  return <span className="text-xs text-gray-400">—</span>
}

/**
 * Kolom lembar .xlsx, dari kiri ke kanan — bentuk DATAR: satu baris per anggota,
 * kolom kuitansi diisi sekali di baris pertamanya.
 *
 * Berbeda dengan layar, yang memecahnya jadi dua tabel bersarang (lihat
 * `KOLOM_KUITANSI` & `KOLOM_ANGGOTA`). Berkasnya sengaja dibiarkan datar: lembar
 * .xlsx dibaca dan dijumlahkan dengan rumus, dan baris yang tersembunyi di balik
 * lipatan tidak akan pernah bisa dibuka di dalam Excel.
 */
const KOLOM = [
  "nafsulTransaksi.colDate",
  "nafsulLaporan.colPaymentNumber",
  "nafsulLaporan.colTransaction",
  // Cara bayar ikut tercetak PER BARIS, bukan hanya jadi judul bloknya: judul
  // itu tidak ditampilkan di layar, jadi tanpa kolom ini blok TRANSFER dan
  // TUNAI terbaca sebagai dua tabel yang tidak jelas bedanya — dan berkas yang
  // tab-nya digabung petugas kehilangan penanda itu sama sekali.
  "nafsulTransaksi.colMethod",
  "nafsulLaporan.colLeader",
  "nafsulLaporan.colMemberName",
  "nafsulLaporan.colMemberNumber",
  "nafsulLaporan.colAmountPaid",
  "nafsulLaporan.colMemberDeduction",
] as const

/**
 * Indeks kolom nominal & kolom yang ditengahkan — MENGACU pada urutan `KOLOM`
 * di atas, jadi ikut bergeser tiap kali ada kolom yang ditambah atau dibuang.
 */
const KOLOM_NOMINAL = [7, 8]
const KOLOM_TENGAH = [2, 3]

/**
 * Kolom tabel INDUK di layar: kuitansinya saja, yaitu yang ada di
 * `transaction_headers`.
 *
 * Kolom tingkat anggota tidak ikut di sini — nilainya milik `transactions`, satu
 * per anggota, dan menaruhnya di baris kuitansi membuat satu kolom memuat dua
 * satuan yang tidak bisa dibedakan.
 */
const KOLOM_KUITANSI = [
  "nafsulTransaksi.colDate",
  "nafsulLaporan.colPaymentNumber",
  "nafsulLaporan.colTransaction",
  "nafsulTransaksi.colMethod",
  "nafsulLaporan.colLeader",
] as const

/** Kolom tabel RINCIAN yang terbuka di bawah sebuah kuitansi. */
const KOLOM_ANGGOTA = [
  "nafsulLaporan.colMemberName",
  "nafsulLaporan.colMemberNumber",
  "nafsulLaporan.colAmountPaid",
  "nafsulLaporan.colMemberDeduction",
] as const

/** Indeks kolom nominal pada `KOLOM_ANGGOTA`. */
const ANGGOTA_NOMINAL = [2, 3]

/**
 * Satu KUITANSI beserta anggota di dalamnya.
 *
 * Dipakai EXPORT saja: responsnya `detail=1` datang datar — satu baris per
 * anggota — sedangkan lembar .xlsx menulis kolom kuitansi sekali di baris
 * pertamanya, dan latar kuning penanda kuitansi baru juga jatuh di situ.
 *
 * Layar tidak memerlukannya: barisnya memang sudah datang sebagai kuitansi.
 */
type Kuitansi = {
  /** Nomor kuitansi — kunci render sekaligus penanda buka/tutup. */
  key: string
  /** Baris pertama; dari sinilah kolom tingkat-kuitansi dibaca. */
  kepala: RekapRow
  rows: RekapRow[]
  amount: number
  deduction: number
}

function kuitansiRekap(rows: readonly RekapRow[]): Kuitansi[] {
  const hasil: Kuitansi[] = []

  for (const row of rows) {
    const terakhir = hasil[hasil.length - 1]

    if (terakhir && terakhir.key === row.transaction_number) {
      terakhir.rows.push(row)
      terakhir.amount += Number(row.amount)
      terakhir.deduction += Number(row.deduction)
      continue
    }

    hasil.push({
      key: row.transaction_number,
      kepala: row,
      rows: [row],
      amount: Number(row.amount),
      deduction: Number(row.deduction),
    })
  }

  return hasil
}

export default function NafsulLaporanPage() {
  const { t, lang } = useLanguage()
  const dispatch = useAppDispatch()
  const {
    blocks,
    period,
    search,
    method,
    dateFrom,
    dateTo,
    appliedFrom,
    appliedTo,
    page,
    perPage,
    total,
    lastPage,
    truncated,
    loading,
    loaded,
    dirty,
    error,
  } = useAppSelector((s) => s.nafsulLaporan)

  // Draft isian — baru masuk Redux saat tombolnya ditekan, sama seperti kotak
  // pencarian di halaman list lain. Ikut menyesuaikan saat nilai commit-nya
  // berganti, yang di sini terjadi tepat sekali: bawaan diisi dari jam peramban
  // setelah mount.
  const [formCari, setFormCari] = useDraft(search)
  const [formMetode, setFormMetode] = useDraft(method)
  const [formDari, setFormDari] = useDraft(dateFrom)
  const [formSampai, setFormSampai] = useDraft(dateTo)

  const [exporting, setExporting] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  // Permintaan pertama sengaja berangkat TANPA bulan: backend menjawabnya
  // dengan bulan terakhir yang ada setorannya, dan nilai itulah yang lalu
  // mengisi pemilih bulan. Memilih sendiri bulan berjalan berarti membuka
  // lembar kosong pada tanggal 1, sebelum setoran bulan itu masuk.
  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchLaporanRekap())
  }, [loaded, dirty, dispatch])

  /**
   * Penyaring lembar: bulan, kata kunci, cara bayar — satu dispatch.
   *
   * Ketiganya menentukan BARIS yang diminta ke server, jadi ketiganya berangkat
   * bersama lewat satu tombol. Memisahkan bulan ke tombol sendiri hanya membuat
   * dua permintaan untuk satu maksud ("bulan April, punya Pak Anu saja").
   */
  function cari(e: React.FormEvent) {
    e.preventDefault()
    dispatch(
      setLaporanFilter({
        // `period` dipertahankan di state sebagai jawaban server, tapi tidak
        // lagi bisa diubah dari layar: rentang tanggal sudah mencakup segala
        // yang bisa dipilih pemilih bulan, dan dua penyaring waktu yang saling
        // menimpa cuma bikin petugas menebak mana yang sedang berlaku.
        period: "",
        search: formCari,
        method: formMetode,
        dateFrom: formDari,
        dateTo: formSampai,
      }),
    )
  }

  const tanggal = useCallback(
    (value: string | null) => formatDate(value, localeOf(lang)),
    [lang],
  )

  // Judul & baris total menyebut bulannya dalam huruf besar ("APRIL 2026"),
  // mengikuti lembar cetak yang sudah dipakai. Namanya diambil dari locale
  // bahasa aktif, bukan dari daftar nama bulan yang ditulis sendiri.
  const labelPeriode = useCallback(
    (value: string) => {
      const m = /^(\d{4})-(\d{2})$/.exec(value)
      if (!m) return ""
      return new Date(Number(m[1]), Number(m[2]) - 1, 1)
        .toLocaleDateString(localeOf(lang), { month: "long", year: "numeric" })
        .toUpperCase()
    },
    [lang],
  )

  /**
   * Judul periode pada blok & berkas.
   *
   * Menyebut satu nama bulan ("APRIL 2026") HANYA bila rentang yang dipakai
   * server benar-benar sebulan penuh. Begitu rentangnya dipersempit atau
   * memotong dua bulan, nama bulan itu berbohong — yang tampil lalu tanggal
   * awal dan akhirnya apa adanya.
   */
  const labelRentang = useCallback(() => {
    if (!appliedFrom || !appliedTo) return labelPeriode(period)

    const awal = new Date(appliedFrom)
    const akhir = new Date(appliedTo)
    const sebulanPenuh =
      awal.getDate() === 1 &&
      awal.getMonth() === akhir.getMonth() &&
      awal.getFullYear() === akhir.getFullYear() &&
      akhir.getDate() ===
        new Date(akhir.getFullYear(), akhir.getMonth() + 1, 0).getDate()

    if (sebulanPenuh) {
      return labelPeriode(
        `${awal.getFullYear()}-${String(awal.getMonth() + 1).padStart(2, "0")}`,
      )
    }

    return `${formatDate(appliedFrom, localeOf(lang))} - ${formatDate(
      appliedTo,
      localeOf(lang),
    )}`.toUpperCase()
  }, [appliedFrom, appliedTo, labelPeriode, lang, period])

  /** "transfer" → "TRANSFER", lewat kamus supaya "cash" jadi "TUNAI". */
  const labelMetode = useCallback(
    (metode: string) => t(`nafsulTransaksi.method_${metode}`).toUpperCase(),
    [t],
  )

  // Menerima apa saja yang punya cara bayar — blok layar (baris kuitansi) dan
  // blok export (baris anggota) sama-sama dipakai di sini, dan judulnya memang
  // tidak bergantung pada bentuk barisnya.
  const judulBlok = useCallback(
    (block: { payment_method: string }) =>
      t("nafsulLaporan.recapSectionTitle", {
        method: labelMetode(block.payment_method),
        period: labelRentang(),
      }),
    [labelMetode, labelRentang, t],
  )

  /**
   * Seksi lembar — SATU perakit untuk layar dan berkas.
   *
   * Export tidak meminta ulang ke server: lembar ini memang tidak dipaginasi,
   * jadi yang ada di state SUDAH seluruh isinya. Berkasnya karena itu bukan
   * sekadar "cocok" dengan layar, melainkan dirakit dari baris yang sama persis.
   */
  const seksi = useCallback(
    (block: RekapDetailBlock): XlsxSection => {
      const kuitansi = kuitansiRekap(block.rows)

      // Baris pertama tiap kuitansi, dihitung sebagai posisi di dalam lembar
      // yang sudah direntangkan — dari pengelompokan yang SAMA dengan yang
      // menyusun barisnya, jadi yang disorot tidak mungkin bergeser satu baris
      // dari kuitansi yang dimaksud.
      const sorot: number[] = []
      let posisi = 0
      for (const k of kuitansi) {
        sorot.push(posisi)
        posisi += k.rows.length
      }

      return {
        // Nama tab memakai label metode apa adanya ("Transfer"/"Tunai"), bukan
        // versi huruf besarnya: huruf besar itu milik JUDUL di dalam lembar,
        // sedangkan tab pada arsip Binroh ditulis biasa.
        sheetName: t(`nafsulTransaksi.method_${block.payment_method}`),
        title: judulBlok(block),
        headers: KOLOM.map((k) => t(k)),
        // Tiap kuitansi baru diberi latar kuning di seluruh lebarnya — penanda
        // MULAINYA kuitansi, sama seperti garis tegas di layar.
        highlightRows: sorot,
        // Berkasnya TIDAK ikut melipat: lembar .xlsx dibaca dan dijumlahkan
        // dengan rumus, dan baris yang tersembunyi di baliknya tidak akan
        // pernah terbuka. Yang dipinjam dari layar cuma pengelompokannya —
        // kolom kuitansi tetap ditulis sekali di baris pertama tiap kuitansi.
        rows: kuitansi.flatMap((k) =>
          k.rows.map((row, i) => [
            i === 0 ? tanggal(row.date) : "",
            i === 0 ? row.transaction_number : "",
            i === 0 ? t(`nafsulLaporan.typeShort_${row.transaction_type}`) : "",
            i === 0 ? t(`nafsulTransaksi.method_${block.payment_method}`) : "",
            i === 0
              ? row.transaction_type === "pribadi"
                ? t("nafsulTransaksi.personal")
                : (row.group_leader_name ?? "")
              : "",
            row.member_name ?? "",
            row.member_number ?? "",
            // Angka dikirim sebagai NUMBER; formatnya diurus penulis .xlsx.
            Number(row.amount),
            Number(row.deduction),
          ]),
        ),
      }
    },
    [judulBlok, t, tanggal],
  )

  async function exportExcel() {
    setExporting(true)
    setGalat(null)
    try {
      // Diminta ulang ke server dengan `per_page` sebesar mungkin, BUKAN dirakit
      // dari `blocks` di state: sejak lembar ini dipaginasi, state cuma memuat
      // halaman yang sedang tampil, dan berkas yang berisi 50 baris dari 188
      // tidak akan ketahuan salah sampai ada yang menjumlahkannya.
      const penuh = await api<RekapDetailResponse>("/laporan/rekap-pembayaran", {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          search,
          payment_method: method,
          page: 1,
          per_page: PER_HALAMAN_EXPORT,
          // Bentuk DATAR: layar meminta kuitansi saja dan menyusulkan
          // anggotanya saat dibuka, sedangkan berkasnya harus memuat seluruh
          // anggota sekaligus.
          detail: 1,
        },
      })

      downloadXlsxSections(
        `${t("nafsulLaporan.fileRecap")}-${appliedFrom}_sd_${appliedTo}.xlsx`,
        penuh.blocks.map(seksi),
        KOLOM_NOMINAL,
        KOLOM_TENGAH,
      )
    } catch (e) {
      setGalat((e as Error).message || t("nafsulLaporan.exportFailed"))
    } finally {
      setExporting(false)
    }
  }

  // Halaman yang baru dibuka belum sempat memuat apa pun: `loading` masih false
  // dan `blocks` masih kosong, sehingga sesaat ia terbaca sebagai "tidak ada
  // data" padahal permintaannya belum berangkat. `!loaded` menutup celah itu.
  //
  // `!error` WAJIB ikut: permintaan yang gagal juga meninggalkan
  // `loaded = false`, dan tanpa syarat ini layarnya menggantung di "Memuat
  // data..." selamanya — tampak seperti jaringan lambat, padahal permintaannya
  // sudah selesai dan gagal.
  const memuat = loading || (!loaded && !error)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nafsulLaporan.title")}
        subtitle={t("nafsulLaporan.subtitle")}
      />

      <Card className="p-0">
        {/* Penyaring rekap — bulan, kata kunci, cara bayar. Ketiganya
            menentukan baris yang diminta ke server, jadi ketiganya berangkat
            bersama lewat satu tombol Cari. */}
        <form
          onSubmit={cari}
          className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 lg:flex-row lg:flex-wrap lg:items-end"
        >
          <Isian
            label={t("common.search")}
            htmlFor="laporan-cari"
            className="min-w-[240px] flex-1"
          >
            <div className="relative">
              {/* Kaca pembesar berganti pemintal selama permintaan berjalan:
                  lembarnya tidak dipaginasi, jadi pencarian yang sedang berjalan
                  tidak terlihat dari mana pun kecuali dari sini. */}
              {loading ? (
                <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#075489]" />
              ) : (
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              )}
              <Input
                id="laporan-cari"
                placeholder={t("nafsulLaporan.searchPlaceholder")}
                value={formCari}
                onChange={(e) => setFormCari(e.target.value)}
                className="pl-9"
              />
            </div>
          </Isian>

          {/* Satu-satunya penyaring waktu lembar ini. Sepotong saja diabaikan
              server: lembar ditutup baris total, dan rentang setengah terbuka
              membuat totalnya tidak punya batas yang bisa disebutkan. */}
          <DateRangeFields
            from={formDari}
            to={formSampai}
            onFromChange={setFormDari}
            onToChange={setFormSampai}
          />

          {/* Tanpa label di atasnya: pilihan kosongnya sudah berbunyi "Cara
              Bayar", jadi label terpisah hanya mengulang kata yang sama persis
              tepat di atasnya. */}
          <div className="w-full sm:w-48">
            <Select
              aria-label={t("nafsulTransaksi.allMethods")}
              value={formMetode}
              onChange={(e) => setFormMetode(e.target.value)}
            >
              <option value="">{t("nafsulTransaksi.allMethods")}</option>
              <option value="transfer">{t("nafsulTransaksi.method_transfer")}</option>
              <option value="cash">{t("nafsulTransaksi.method_cash")}</option>
              {/* Setoran 2014–2024 dari sistem lama tidak punya penanda cara
                  bayar sama sekali; tanpa pilihan ini, dua belas tahun data
                  tidak bisa ditelusuri dari layar ini. */}
              <option value="other">{t("nafsulTransaksi.method_other")}</option>
            </Select>
          </div>

          <Button
            type="submit"
            className="w-full justify-center bg-[#075489] text-white hover:bg-[#075489]/90 sm:w-auto"
          >
            <Search className="h-4 w-4" />
            {t("common.search")}
          </Button>

          {/* Unduhan tetap di baris penyaring — yang diunduh persis lembar hasil
              penyaringan di atasnya, jadi tombolnya berada di tempat
              penyaringan itu diputuskan. Tapi didorong ke TEPI KANAN dengan
              `ml-auto`: ia bukan bagian dari merangkai penyaring, melainkan
              tindakan atas hasilnya, dan berdiri menempel tombol Cari membuat
              keduanya terbaca sebagai sepasang pilihan yang setara. */}
          <Button
            type="button"
            variant="outline"
            onClick={exportExcel}
            disabled={exporting || memuat || blocks.length === 0}
            className="w-full justify-center sm:w-auto lg:ml-auto"
          >
            <Sheet className="h-4 w-4" />
            {exporting ? t("nafsulLaporan.exporting") : t("nafsulLaporan.exportExcel")}
          </Button>

          {galat && <p className="w-full text-sm text-red-600">{galat}</p>}
        </form>

        {memuat ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="space-y-3 py-16 text-center">
            <p className="text-sm text-red-600">{t(error)}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch(retryLaporan())}
            >
              {t("nafsulLaporan.retry")}
            </Button>
          </div>
        ) : blocks.length === 0 ? (
          // Kosong karena PENYARING dan kosong karena bulannya memang sepi
          // adalah dua keadaan berbeda: yang pertama diperbaiki dengan mengubah
          // kata kunci, yang kedua tidak bisa diperbaiki sama sekali. Kalimat
          // yang sama untuk keduanya membuat petugas mencari data yang hilang.
          <div className="py-16 text-center text-sm text-gray-400">
            {search || method ? t("nafsulLaporan.noResult") : t("nafsulLaporan.noData")}
          </div>
        ) : (
          <div className="space-y-8 px-5 py-5">
            {truncated && (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t("nafsulLaporan.recapTruncated")}
              </p>
            )}

            {blocks.map((block) => (
              <BlokRekap
                key={block.payment_method}
                block={block}
                tanggal={tanggal}
              />
            ))}

            {/* Satuannya SATU BARIS lembar — satu pasangan kuitansi+anggota,
                berapa pun rincian periode di dalamnya. */}
            <Pagination
              currentPage={page}
              totalPages={lastPage}
              totalItems={total}
              itemsPerPage={perPage}
              onPageChange={(p) => dispatch(setLaporanPage(p))}
            />
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * Draft lokal atas sebuah nilai commit.
 *
 * Menyetel ulang draft saat `commit` berganti identitas — pola resmi React
 * "menyesuaikan state saat render", bukan lewat `useEffect`: efek akan merender
 * dua kali untuk satu perubahan, dan aturan lint proyek ini memang melarang
 * `setState` di dalam efek.
 */
function useDraft<T>(commit: T) {
  const [draft, setDraft] = useState(commit)
  const [asal, setAsal] = useState(commit)

  if (asal !== commit) {
    setAsal(commit)
    setDraft(commit)
  }

  return [draft, setDraft] as const
}

/** Satu sel isian: label kecil di atas kotaknya. */
function Isian({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold uppercase tracking-wide text-gray-400"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`whitespace-nowrap px-4 py-2.5 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  )
}

/**
 * Satu blok cara bayar: SATU BARIS per kuitansi, rinciannya terbuka di bawahnya
 * sebagai tabel tersendiri saat baris kuitansinya diklik.
 *
 * Sebelum ini tiap anggota berdiri sebagai baris tabel yang sama, dan sebuah
 * kuitansi berisi dua puluh anggota memakan dua puluh baris lembar — halaman
 * berisi lima puluh baris lalu memuat tiga kuitansi saja, dan menelusuri setoran
 * satu hari berarti menggulir melewati nama-nama yang tidak sedang dicari.
 *
 * Rinciannya DIMINTA SAAT DIBUKA, tidak ikut terkirim bersama daftarnya: satu
 * halaman berisi 50 kuitansi bisa memuat ribuan baris anggota yang hampir
 * semuanya tidak pernah dilihat. Yang sudah pernah diambil disimpan di
 * `rincian`, jadi membuka-tutup baris yang sama tidak meminta ulang.
 *
 * Tabel rincian berdiri SENDIRI selebar tabel induk, bukan menumpang kolomnya:
 * kolom induk milik kuitansi (tanggal, nomor, jenis, cara bayar, ketua),
 * sedangkan rincian punya kolomnya sendiri (nama, no. anggota, nominal). Satu
 * kolom yang memuat dua satuan berbeda tergantung barisnya adalah kolom yang
 * tidak bisa dijumlah maupun diurutkan dengan benar oleh pembacanya.
 */
function BlokRekap({
  block,
  tanggal,
}: {
  block: RekapBlock
  tanggal: (value: string | null) => string
}) {
  const { t } = useLanguage()

  // Yang dibuka disimpan sebagai UUID kuitansi, bukan indeks baris: indeks
  // menunjuk baris yang berbeda begitu penyaring atau halaman berubah, sehingga
  // kuitansi yang tidak pernah disentuh tiba-tiba tampil terbuka.
  const [terbuka, setTerbuka] = useState<ReadonlySet<string>>(() => new Set())
  const [rincian, setRincian] = useState<Record<string, RekapRow[]>>({})
  const [memuat, setMemuat] = useState<ReadonlySet<string>>(() => new Set())
  const [galat, setGalat] = useState<Record<string, string>>({})

  // Permintaan yang sedang berjalan, di luar state: dipakai HANYA untuk menahan
  // permintaan kedua atas kuitansi yang sama (klik tutup-buka cepat), dan nilai
  // yang dibaca harus yang terkini pada saat itu juga — state masih memegang
  // nilai render sebelumnya.
  const berjalan = useRef(new Set<string>())

  // Ganti halaman / ganti penyaring → daftar kuitansinya berganti seluruhnya,
  // dan pilihan buka-tutup atas kuitansi yang sudah tidak ada di layar tidak
  // lagi berarti apa-apa. Disetel ulang saat render (pola resmi React
  // "menyesuaikan state saat render"), bukan lewat `useEffect` — efek merender
  // dua kali untuk satu perubahan, dan aturan lint proyek ini melarang
  // `setState` di dalamnya.
  //
  // `rincian` sengaja TIDAK ikut dibuang: isinya milik satu kuitansi tertentu
  // dan tidak berubah karena penyaring, jadi kembali ke halaman sebelumnya
  // tidak perlu meminta ulang apa yang sudah pernah diambil.
  const [asal, setAsal] = useState(block.rows)

  if (asal !== block.rows) {
    setAsal(block.rows)
    setTerbuka(new Set())
  }

  const tandai = (
    set: (f: (s: ReadonlySet<string>) => ReadonlySet<string>) => void,
    key: string,
    aktif: boolean,
  ) =>
    set((sebelum) => {
      const sesudah = new Set(sebelum)
      if (aktif) sesudah.add(key)
      else sesudah.delete(key)
      return sesudah
    })

  async function ambilRincian(k: RekapKuitansi) {
    // Sudah ada isinya, atau permintaannya sedang berjalan.
    if (rincian[k.uuid] || berjalan.current.has(k.uuid)) return

    berjalan.current.add(k.uuid)
    tandai(setMemuat, k.uuid, true)
    // Galat percobaan sebelumnya dibuang, bukan dibiarkan: kalau tidak, pesan
    // merahnya masih terpampang saat permintaan ulang sedang berjalan.
    setGalat((g) => {
      if (!(k.uuid in g)) return g
      const sisa = { ...g }
      delete sisa[k.uuid]
      return sisa
    })

    try {
      const data = await api<AnggotaKuitansiResponse>(
        `/laporan/rekap-pembayaran/${k.uuid}/anggota`,
      )
      setRincian((r) => ({ ...r, [k.uuid]: data.rows }))
    } catch (e) {
      setGalat((g) => ({
        ...g,
        [k.uuid]: (e as Error).message || t("nafsulLaporan.detailFailed"),
      }))
    } finally {
      berjalan.current.delete(k.uuid)
      tandai(setMemuat, k.uuid, false)
    }
  }

  function alihkan(k: RekapKuitansi) {
    const dibuka = terbuka.has(k.uuid)
    tandai(setTerbuka, k.uuid, !dibuka)
    // Diminta saat DIBUKA, bukan saat dirender: baris yang cuma dilewati tidak
    // pernah menimbulkan permintaan.
    if (!dibuka) void ambilRincian(k)
  }

  return (
    <section className="space-y-0">
      {/* Judul blok TIDAK dicetak di layar. Ia tetap ditulis ke berkas .xlsx —
          baris judul yang digabung di puncak tiap tab adalah bentuk lembar yang
          dipakai Binroh selama ini, sedangkan di layar tabelnya sudah cukup
          dikenali dari kolom Cara Bayar-nya sendiri. */}
      <div className="overflow-x-auto rounded-t-lg border-x border-t border-gray-200">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className={KEPALA}>
              {KOLOM_KUITANSI.map((kunci) => (
                <Th key={kunci}>{t(kunci)}</Th>
              ))}
            </tr>
          </thead>
          {/*
            TANPA `divide-y`: pemisah bawaan itu menggambar garis di antara SETIAP
            baris, termasuk antara baris kuitansi dan rinciannya sendiri —
            terbaca sebagai border-bottom yang tidak pernah diminta. Yang tersisa
            `border-t` pada baris kuitansi, yaitu batas antar kuitansi.
          */}
          <tbody>
            {block.rows.map((k, i) => {
              const dibuka = terbuka.has(k.uuid)

              return (
                <Fragment key={k.key}>
                  {/* Seluruh barisnya yang diklik, bukan panahnya saja: sasaran
                      seluas satu baris jauh lebih mudah dikenai daripada ikon
                      16px, dan tidak ada apa pun lain di baris ini yang bisa
                      diklik sehingga tidak ada yang direbut.

                      `i > 0` menahan garis atas di baris pertama tabel, yang
                      garisnya akan jatuh tepat di bawah garis bawah baris nama
                      kolom dan terbaca sebagai garis dobel. */}
                  <tr
                    onClick={() => alihkan(k)}
                    onKeyDown={(e) => {
                      // Spasi menggulung halaman kalau dibiarkan lewat.
                      if (e.key !== "Enter" && e.key !== " ") return
                      e.preventDefault()
                      alihkan(k)
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={dibuka}
                    className={`cursor-pointer bg-white hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#075489] ${
                      i > 0 ? "border-t border-gray-300" : ""
                    }`}
                  >
                    <td className={`${SEL} text-gray-600`}>
                      <span className="flex items-center gap-1.5">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                            dibuka ? "rotate-90" : ""
                          }`}
                        />
                        {tanggal(k.date)}
                      </span>
                    </td>
                    <td className={`${SEL} font-mono text-xs text-gray-700`}>
                      {k.transaction_number}
                    </td>
                    <td className={`${SEL} text-center font-medium text-gray-700`}>
                      {t(`nafsulLaporan.typeShort_${k.transaction_type}`)}
                    </td>
                    <td className={`${SEL} text-center text-gray-700`}>
                      {t(`nafsulTransaksi.method_${block.payment_method}`)}
                    </td>
                    <td className={`${SEL} text-gray-800`}>
                      {k.transaction_type === "pribadi" ? (
                        <span className="text-slate-500">
                          {t("nafsulTransaksi.personal")}
                        </span>
                      ) : (
                        k.group_leader_name || <Kosong />
                      )}
                    </td>
                  </tr>

                  {/* Rincian dirender bersyarat, BUKAN disembunyikan lewat
                      tinggi/`hidden` CSS: yang belum dibuka memang belum punya
                      isinya sama sekali. */}
                  {dibuka && (
                    <tr className="border-t border-gray-200 bg-gray-50/70">
                      {/* Selebar seluruh tabel induk — tabel di dalamnya punya
                          kolomnya sendiri dan tidak boleh terikat lebar kolom
                          kuitansi di atasnya. */}
                      <td colSpan={KOLOM_KUITANSI.length} className="px-4 py-3">
                        <TabelAnggota
                          rows={rincian[k.uuid]}
                          loading={memuat.has(k.uuid)}
                          error={galat[k.uuid]}
                          onRetry={() => void ambilRincian(k)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * Rincian anggota satu kuitansi — tabelnya sendiri, dengan kolomnya sendiri.
 *
 * Tiga keadaan sebelum barisnya ada (memuat, gagal, kosong) ditulis eksplisit:
 * baris yang dibuka lalu tidak menampilkan apa-apa tidak bisa dibedakan dari
 * kuitansi yang memang tidak punya anggota, dan yang gagal harus bisa dicoba
 * lagi tanpa menutup-buka barisnya.
 */
function TabelAnggota({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: RekapRow[] | undefined
  loading: boolean
  error: string | undefined
  onRetry: () => void
}) {
  const { t } = useLanguage()

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("nafsulLaporan.detailLoading")}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm">
        <span className="text-red-600">{t(error)}</span>
        <button
          type="button"
          // Klik tidak boleh naik ke baris kuitansi di atasnya — barisnya akan
          // ikut tertutup tepat saat rinciannya diminta lagi.
          onClick={(e) => {
            e.stopPropagation()
            onRetry()
          }}
          className="font-medium text-[#075489] hover:underline"
        >
          {t("nafsulLaporan.retry")}
        </button>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="py-4 text-sm text-gray-400">
        {t("nafsulLaporan.detailEmpty")}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className={KEPALA}>
            {KOLOM_ANGGOTA.map((kunci, i) => (
              <Th key={kunci} right={ANGGOTA_NOMINAL.includes(i)}>
                {t(kunci)}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className={`${SEL} font-medium text-gray-900`}>
                {row.member_name || <Kosong />}
              </td>
              <td className={`${SEL} font-mono text-xs text-gray-700`}>
                {row.member_number || <Kosong />}
              </td>
              <td className={SEL}>
                <CurrencyCell value={row.amount} className="text-gray-900" />
              </td>
              <td className={SEL}>
                <CurrencyCell value={row.deduction} className="text-gray-600" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

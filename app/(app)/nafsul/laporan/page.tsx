"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Search, Sheet } from "lucide-react"
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
  type RekapBlock,
  type RekapResponse,
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

/** Kolom lembar rekap, dari kiri ke kanan. Dipakai layar DAN berkas. */
const KOLOM = [
  "nafsulTransaksi.colDate",
  "nafsulLaporan.colPaymentNumber",
  "nafsulLaporan.colTransaction",
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
const KOLOM_NOMINAL = [6, 7]
const KOLOM_TENGAH = [2]

/**
 * Satu baris lembar beserta keputusan APA YANG DITAMPILKAN padanya.
 *
 * Lembar aslinya tidak mengulang kolom kuitansi di tiap baris: tanggal ditulis
 * sekali per HARI, dan nomor/jenis/ketua sekali per KUITANSI, sisanya dibiarkan
 * kosong. Itu bukan hiasan — pengulangan membuat batas antar kuitansi hilang,
 * dan pembacanya kehilangan tempat saat menelusuri kolom nominal ke bawah.
 *
 * Keputusannya dihitung SEKALI di sini lalu dipakai bersama oleh tabel di layar
 * dan oleh export. Kalau masing-masing menghitung sendiri, cepat atau lambat
 * yang satu mengosongkan baris yang tidak dikosongkan yang lain, dan berkasnya
 * tidak lagi cocok dengan lembar yang dilihat petugas saat menekan tombolnya.
 */
type BarisRekap = {
  row: RekapRow
  tampilTanggal: boolean
  tampilKuitansi: boolean
}

function barisRekap(rows: readonly RekapRow[]): BarisRekap[] {
  let tanggalSebelum: string | null = null
  let kuitansiSebelum: string | null = null

  return rows.map((row) => {
    const tampilTanggal = row.date !== tanggalSebelum
    const tampilKuitansi = row.transaction_number !== kuitansiSebelum
    tanggalSebelum = row.date
    kuitansiSebelum = row.transaction_number
    return { row, tampilTanggal, tampilKuitansi }
  })
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

  const judulBlok = useCallback(
    (block: RekapBlock) =>
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
    (block: RekapBlock): XlsxSection => {
      return {
        // Nama tab memakai label metode apa adanya ("Transfer"/"Tunai"), bukan
        // versi huruf besarnya: huruf besar itu milik JUDUL di dalam lembar,
        // sedangkan tab pada arsip Binroh ditulis biasa.
        sheetName: t(`nafsulTransaksi.method_${block.payment_method}`),
        title: judulBlok(block),
        headers: KOLOM.map((k) => t(k)),
        rows: barisRekap(block.rows).map(({ row, tampilTanggal, tampilKuitansi }) => [
          tampilTanggal ? tanggal(row.date) : "",
          tampilKuitansi ? row.transaction_number : "",
          tampilKuitansi ? t(`nafsulLaporan.typeShort_${row.transaction_type}`) : "",
          tampilKuitansi
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
      const penuh = await api<RekapResponse>("/laporan/rekap-pembayaran", {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          search,
          payment_method: method,
          page: 1,
          per_page: PER_HALAMAN_EXPORT,
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
 * Satu blok cara bayar: judul, tabel, lalu tiga baris total — susunan yang sama
 * persis dengan berkas .xlsx-nya.
 *
 * Dibuat menyerupai lembar rekapnya, bukan seperti tabel daftar biasa: layar
 * ini dipakai untuk MEMERIKSA rekap sebelum diunduh, jadi apa pun yang berbeda
 * antara keduanya baru ketahuan setelah berkasnya terlanjur dipakai.
 */
function BlokRekap({
  block,
  tanggal,
}: {
  block: RekapBlock
  tanggal: (value: string | null) => string
}) {
  const { t } = useLanguage()
  const baris = barisRekap(block.rows)

  return (
    <section className="space-y-0">
      {/* Judul blok TIDAK dicetak di layar. Ia tetap ditulis ke berkas .xlsx —
          baris judul yang digabung di puncak tiap tab adalah bentuk lembar yang
          dipakai Binroh selama ini, sedangkan di layar tabelnya sudah cukup
          dikenali dari penyaring cara bayar di atasnya. */}
      <div className="overflow-x-auto rounded-t-lg border-x border-t border-gray-200">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className={KEPALA}>
              {KOLOM.map((kunci, i) => (
                <Th key={kunci} right={KOLOM_NOMINAL.includes(i)}>
                  {t(kunci)}
                </Th>
              ))}
            </tr>
          </thead>
          {/*
            TANPA `divide-y`: pemisah bawaan itu menggambar garis di antara SETIAP
            baris, dan pada baris kepala kuitansi garis milik baris berikutnya
            muncul tepat di bawahnya — terbaca sebagai border-bottom yang tidak
            pernah diminta.

            Satu-satunya garis di badan tabel kini `border-t` pada baris kepala
            kuitansi, yaitu batas antar kuitansi. Baris anggota di dalam satu
            kuitansi memang tidak perlu dipisahkan garis: kolom kuitansi yang
            dikosongkan sudah menyatakan mereka satu kelompok.
          */}
          <tbody>
            {baris.map(({ row, tampilTanggal, tampilKuitansi }, i) => {
              // Kepala kuitansi: SATU warna untuk semua jenis. Yang membedakan
              // pribadi dari kelompok sudah ada di kolom Jenis ("P"/"K") dan
              // kolom Nama Ketua — warna kedua di sini cuma menambah kode yang
              // harus dihafal tanpa menjawab pertanyaan baru.
              //
              // Hanya pada baris pertama tiap kuitansi: baris berikutnya
              // mengosongkan keempat kolom itu sebagai tanda "sama dengan di
              // atas", dan mewarnainya membuat satu kuitansi berisi sepuluh
              // anggota terbaca seperti sepuluh kuitansi.
              const sorot = tampilKuitansi ? "bg-amber-100" : ""

              return (
              // Garis ATAS pada baris kepala kuitansi — satu-satunya garis tegas
              // di tabel ini, menandai MULAINYA kuitansi baru. Melintasi seluruh
              // lebar tabel, tidak berhenti di empat kolom berwarna.
              //
              // Di atas, bukan di bawah: garis bawah akan memisahkan kepala
              // kuitansi dari daftar anggotanya sendiri, padahal keduanya satu
              // kesatuan. Yang perlu dipisahkan justru kuitansi yang satu dari
              // kuitansi berikutnya.
              //
              // Garis pemisah bawaan antar baris (`divide-gray-50`) terlalu
              // samar untuk peran ini: batas antar anggota dan batas antar
              // kuitansi jadi terlihat sama tebal.
              <tr
                key={row.key}
                className={
                  // `i > 0`: baris PERTAMA tabel tidak diberi garis atas. Ia
                  // selalu kepala kuitansi, dan garisnya akan jatuh tepat di
                  // bawah garis bawah baris nama kolom — terbaca sebagai garis
                  // dobel di bawah header, bukan sebagai batas kuitansi.
                  tampilKuitansi && i > 0
                    ? "border-t border-gray-300"
                    : undefined
                }
              >
                {/* Kolom kuitansi sengaja dibiarkan KOSONG saat mengulang, bukan
                    diisi em dash seperti nilai null di tabel lain: di sini
                    kosongnya berarti "sama dengan baris di atas", bukan "tidak
                    ada datanya".

                    Empat kolom inilah yang disorot kuning pada kuitansi PRIBADI
                    — dan hanya di baris pertama kuitansinya, baris yang benar-
                    benar memuat nomor & jenisnya. Sorotan tidak diteruskan ke
                    kolom anggota & nominal: yang ditandai adalah kuitansinya,
                    bukan tiap anggota di dalamnya. */}
                <td className={`${SEL} ${sorot} text-gray-600`}>
                  {tampilTanggal ? tanggal(row.date) : ""}
                </td>
                <td className={`${SEL} ${sorot} font-mono text-xs text-gray-700`}>
                  {tampilKuitansi ? row.transaction_number : ""}
                </td>
                <td className={`${SEL} ${sorot} text-center font-medium text-gray-700`}>
                  {tampilKuitansi
                    ? t(`nafsulLaporan.typeShort_${row.transaction_type}`)
                    : ""}
                </td>
                <td className={`${SEL} ${sorot} text-gray-800`}>
                  {!tampilKuitansi ? (
                    ""
                  ) : row.transaction_type === "pribadi" ? (
                    <span className="text-slate-500">
                      {t("nafsulTransaksi.personal")}
                    </span>
                  ) : (
                    row.group_leader_name || <Kosong />
                  )}
                </td>
                <td className={`${SEL} font-medium text-gray-900`}>
                  {row.member_name || <Kosong />}
                </td>
                <td className={`${SEL} font-mono text-xs text-gray-700`}>
                  {row.member_number || <Kosong />}
                </td>
                <td className={SEL}>
                  <CurrencyCell
                    value={row.amount}
                    className="font-medium text-gray-900"
                  />
                </td>
                <td className={SEL}>
                  <CurrencyCell value={row.deduction} className="text-gray-600" />
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

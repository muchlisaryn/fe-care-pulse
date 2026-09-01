"use client"

import { useCallback, useEffect, useState } from "react"
import { Search, Sheet } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { CurrencyCell } from "@/components/atoms/CurrencyCell"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { SummaryBar } from "@/components/molecules/SummaryBar"
import { api } from "@/lib/nafsul/api"
import { formatDate } from "@/lib/nafsul/format"
import type { KetuaKelompok, Paginated, Tarif, Wilayah } from "@/lib/nafsul/types"
import { downloadXlsx } from "@/lib/excel"
import { localeOf, useLanguage } from "@/lib/i18n"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  EXPORT_PER_PAGE,
  PER_PAGE,
  fetchLaporanAnggota,
  fetchLaporanPenerimaan,
  paramsAnggota,
  paramsPenerimaan,
  setAnggotaFilters,
  setAnggotaPage,
  setLaporanTab,
  setPenerimaanFilters,
  setPenerimaanPage,
  retryLaporan,
  seedLaporanDefaults,
  type LaporanAnggotaRow,
  type LaporanPenerimaanRow,
  type LaporanTab,
} from "@/lib/store/slices/nafsulLaporanSlice"

/** Kelas satu sel tabel — dipakai kedua tab supaya tinggi barisnya sama. */
const SEL = "whitespace-nowrap px-4 py-2.5"

/** Sel kosong tidak pernah dibiarkan kosong: nilai null selalu jadi em dash. */
function Kosong() {
  return <span className="text-xs text-gray-400">—</span>
}

/**
 * Lencana cara bayar — warnanya sama dengan yang dipakai daftar transaksi,
 * supaya baris yang sama dikenali dari warna yang sama di kedua layar.
 */
function LencanaMetode({ metode }: { metode: string | null }) {
  const { t } = useLanguage()
  if (!metode) return <Kosong />

  const warna =
    { cash: "bg-amber-50 text-amber-700", transfer: "bg-sky-50 text-sky-700" }[metode] ??
    "bg-slate-100 text-slate-700"

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${warna}`}
    >
      {t(`nafsulTransaksi.method_${metode}`)}
    </span>
  )
}

/** Sudah divalidasi vs belum — `validation_at` adalah satu-satunya penandanya. */
function LencanaValidasi({ validatedAt }: { validatedAt: string | null }) {
  const { t } = useLanguage()
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        validatedAt ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {t(validatedAt ? "nafsulLaporan.validated" : "nafsulLaporan.unvalidated")}
    </span>
  )
}

export default function NafsulLaporanPage() {
  const { t, lang } = useLanguage()
  const dispatch = useAppDispatch()
  const { tab, seeded, penerimaan, anggota } = useAppSelector((s) => s.nafsulLaporan)

  // Draft penyaring — baru masuk Redux saat tombol Cari ditekan, sama seperti
  // kotak pencarian di halaman list lain. Ikut menyesuaikan saat nilai
  // commit-nya berganti, yang di sini terjadi tepat sekali: waktu bawaan
  // tanggal diisi dari jam peramban setelah mount.
  const [formPenerimaan, setFormPenerimaan] = useDraft(penerimaan.filters)
  const [formAnggota, setFormAnggota] = useDraft(anggota.filters)

  const [exporting, setExporting] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  // Pilihan dropdown tab Per Anggota. Diambil sekali saat halaman dibuka;
  // kegagalan salah satunya tidak menggagalkan yang lain — dropdown-nya cukup
  // tampil tanpa pilihan, dan laporannya tetap bisa dibuka tanpa menyaring.
  const [wilayah, setWilayah] = useState<Wilayah[]>([])
  const [ketua, setKetua] = useState<KetuaKelompok[]>([])
  const [tarif, setTarif] = useState<Tarif[]>([])

  useEffect(() => {
    let aktif = true
    ;(async () => {
      const [w, k, tr] = await Promise.all([
        api<Wilayah[]>("/wilayah", { params: { all: 1 } }).catch(() => null),
        api<KetuaKelompok[]>("/ketua-kelompok", { params: { all: 1, tanpa_pribadi: 1 } }).catch(
          () => null,
        ),
        api<Tarif[]>("/tarif", { params: { all: 1 } }).catch(() => null),
      ])
      if (!aktif) return
      setWilayah(w ?? [])
      setKetua(k ?? [])
      setTarif(tr ?? [])
    })()
    return () => {
      aktif = false
    }
  }, [])

  // Bawaan rentang tanggal diisi DI SINI, bukan di `initialState` slice.
  // Nilainya berasal dari jam peramban, dan efek tidak pernah jalan saat SSR —
  // jadi HTML server tidak memuat tanggal apa pun yang bisa berselisih dengan
  // hitungan peramban saat hidrasi. Reducernya menjaga diri agar hanya mengisi
  // sekali, sehingga kembali ke halaman ini tidak menimpa rentang yang sudah
  // diubah petugas.
  useEffect(() => {
    dispatch(seedLaporanDefaults())
  }, [dispatch])

  // Tiap tab memuat datanya sendiri, dan hanya saat ia yang sedang dibuka:
  // membuka laporan penerimaan tidak perlu ikut menarik seluruh rincian iuran
  // yang belum tentu dilihat. Keduanya menunggu `seeded` — berangkat lebih
  // dulu berarti meminta tanpa batas tanggal sama sekali.
  useEffect(() => {
    if (!seeded || tab !== "penerimaan") return
    if (penerimaan.loaded && !penerimaan.dirty) return
    dispatch(fetchLaporanPenerimaan())
  }, [seeded, tab, penerimaan.loaded, penerimaan.dirty, dispatch])

  useEffect(() => {
    if (!seeded || tab !== "anggota") return
    if (anggota.loaded && !anggota.dirty) return
    dispatch(fetchLaporanAnggota())
  }, [seeded, tab, anggota.loaded, anggota.dirty, dispatch])

  function cari(e: React.FormEvent) {
    e.preventDefault()
    if (tab === "penerimaan") {
      dispatch(setPenerimaanFilters({ ...formPenerimaan }))
    } else {
      dispatch(setAnggotaFilters({ ...formAnggota }))
    }
  }

  function gantiTab(next: LaporanTab) {
    dispatch(setLaporanTab(next))
  }

  const tanggal = useCallback(
    (value: string | null) => formatDate(value, localeOf(lang)),
    [lang],
  )

  /**
   * Unduh SELURUH baris sesuai penyaring yang sedang aktif — bukan halaman yang
   * kebetulan tampil. Parameternya dirakit fungsi yang sama dengan yang
   * mengisi tabel, hanya `per_page`-nya yang dibesarkan.
   */
  async function exportExcel() {
    setExporting(true)
    setGalat(null)
    try {
      const tanggalBerkas = new Date().toISOString().slice(0, 10)

      if (tab === "penerimaan") {
        const res = await api<Paginated<LaporanPenerimaanRow>>("/laporan/penerimaan", {
          params: paramsPenerimaan(penerimaan.filters, 1, EXPORT_PER_PAGE),
        })

        downloadXlsx(
          `${t("nafsulLaporan.fileReceipts")}-${tanggalBerkas}.xlsx`,
          t("nafsulLaporan.tabReceipts"),
          [
            t("nafsulTransaksi.colNumber"),
            t("nafsulTransaksi.colDate"),
            t("nafsulTransaksi.colType"),
            t("nafsulLaporan.colName"),
            t("nafsulLaporan.colLines"),
            t("nafsulTransaksi.colTotal"),
            t("nafsulLaporan.colMemberDeduction"),
            t("nafsulLaporan.colLeaderDeduction"),
            t("nafsulLaporan.colLeaderFee"),
            t("nafsulTransaksi.colPayment"),
            t("nafsulTransaksi.colMethod"),
            t("common.status"),
          ],
          res.data.map((r) => [
            r.transaction_number,
            tanggal(r.date),
            t(`nafsulTransaksi.tab_${r.transaction_type}`),
            r.transaction_type === "pribadi"
              ? t("nafsulTransaksi.personal")
              : (r.group_leader_name ?? ""),
            r.transactions_count,
            // Angka dikirim sebagai NUMBER, bukan teks berformat: begitu masuk
            // Excel ia harus bisa dijumlah dan diurutkan, dan "Rp 1.500.000"
            // hanyalah teks yang kebetulan berisi digit.
            Number(r.total),
            Number(r.member_deduction),
            Number(r.group_leader_deduction),
            Number(r.group_leader_fee),
            Number(r.payment),
            t(`nafsulTransaksi.method_${r.payment_method}`),
            t(r.validation_at ? "nafsulLaporan.validated" : "nafsulLaporan.unvalidated"),
          ]),
        )
      } else {
        const res = await api<Paginated<LaporanAnggotaRow>>("/laporan/per-anggota", {
          params: paramsAnggota(anggota.filters, 1, EXPORT_PER_PAGE),
        })

        downloadXlsx(
          `${t("nafsulLaporan.fileMembers")}-${tanggalBerkas}.xlsx`,
          t("nafsulLaporan.tabMembers"),
          [
            t("nafsulLaporan.colMemberNumber"),
            t("nafsulLaporan.colMemberName"),
            t("nafsulLaporan.colRegion"),
            t("nafsulLaporan.colLeader"),
            t("nafsulTransaksi.colPeriod"),
            t("nafsulLaporan.colRate"),
            t("nafsulLaporan.colAmount"),
            t("nafsulLaporan.colDiscount"),
            t("nafsulTransaksi.colTotal"),
            t("nafsulLaporan.colReceiptNumber"),
            t("nafsulLaporan.colPaidAt"),
            t("nafsulTransaksi.colMethod"),
            t("common.status"),
          ],
          res.data.map((r) => [
            r.member_number ?? "",
            r.member_name ?? "",
            r.region_name ?? "",
            r.group_leader_name ?? "",
            // Tarif sekali bayar memang tak berperiode; ditulis "-" agar jelas
            // kolomnya kosong karena tidak berlaku, bukan karena datanya hilang.
            r.payment_period ?? "-",
            [r.rate_code, r.rate_name].filter(Boolean).join(" — "),
            Number(r.amount),
            Number(r.discount),
            Number(r.total),
            r.transaction_number ?? "",
            tanggal(r.transaction_date),
            r.payment_method ? t(`nafsulTransaksi.method_${r.payment_method}`) : "",
            t(r.transaction_number ? "nafsulLaporan.paid" : "nafsulLaporan.unpaid"),
          ]),
        )
      }
    } catch (e) {
      setGalat((e as Error).message || t("nafsulLaporan.exportFailed"))
    } finally {
      setExporting(false)
    }
  }

  const aktif = tab === "penerimaan" ? penerimaan : anggota

  // Tab yang baru dibuka belum sempat memuat apa pun: `loading` masih false dan
  // `items` masih kosong, sehingga sesaat ia terbaca sebagai "tidak ada data"
  // padahal permintaannya belum berangkat. `!loaded` menutup celah satu render
  // itu — yang justru paling terlihat, karena muncul tepat saat tab ditekan.
  //
  // `!aktif.error` WAJIB ikut: permintaan yang gagal juga meninggalkan
  // `loaded = false`, dan tanpa syarat ini layarnya menggantung di "Memuat
  // data..." selamanya — tampak seperti jaringan lambat, padahal permintaannya
  // sudah selesai dan gagal.
  const memuat = !seeded || aktif.loading || (!aktif.loaded && !aktif.error)

  const ringkasan =
    tab === "penerimaan"
      ? penerimaan.summary && [
          { label: t("nafsulLaporan.sumReceipts"), value: String(penerimaan.summary.receipts) },
          { label: t("nafsulTransaksi.colTotal"), value: rupiah(penerimaan.summary.total) },
          {
            label: t("nafsulLaporan.colMemberDeduction"),
            value: rupiah(penerimaan.summary.member_deduction),
          },
          {
            label: t("nafsulLaporan.colLeaderDeduction"),
            value: rupiah(penerimaan.summary.group_leader_deduction),
          },
          {
            label: t("nafsulLaporan.colLeaderFee"),
            value: rupiah(penerimaan.summary.group_leader_fee),
          },
          {
            label: t("nafsulTransaksi.colPayment"),
            value: rupiah(penerimaan.summary.payment),
            emphasis: true,
          },
        ]
      : anggota.summary && [
          { label: t("nafsulLaporan.sumRows"), value: String(anggota.summary.rows) },
          { label: t("nafsulLaporan.sumMembers"), value: String(anggota.summary.members) },
          { label: t("nafsulLaporan.colAmount"), value: rupiah(anggota.summary.amount) },
          { label: t("nafsulLaporan.colDiscount"), value: rupiah(anggota.summary.discount) },
          {
            label: t("nafsulTransaksi.colTotal"),
            value: rupiah(anggota.summary.total),
            emphasis: true,
          },
        ]

  return (
    <div className="space-y-6">
      <PageHeader title={t("nafsulLaporan.title")} subtitle={t("nafsulLaporan.subtitle")} />

      {/* Pemilih tab: dua sudut pandang atas data yang sama, masing-masing
          menyimpan penyaring & halamannya sendiri. */}
      <div className="flex w-full gap-1 rounded-xl bg-gray-100 p-1 sm:w-auto sm:self-start">
        {(
          [
            ["penerimaan", t("nafsulLaporan.tabReceipts")],
            ["anggota", t("nafsulLaporan.tabMembers")],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => gantiTab(key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none ${
              tab === key
                ? "bg-white text-[#075489] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="p-0">
        <form onSubmit={cari} className="border-b border-gray-100 px-5 py-4">
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tab === "penerimaan" ? (
              <>
                <Isian label={t("nafsulLaporan.searchReceipt")} className="sm:col-span-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder={t("nafsulLaporan.searchReceiptPlaceholder")}
                      value={formPenerimaan.search}
                      onChange={(e) =>
                        setFormPenerimaan((f) => ({ ...f, search: e.target.value }))
                      }
                      className="pl-9"
                    />
                  </div>
                </Isian>

                <Isian label={t("nafsulTransaksi.dateFrom")}>
                  <Input
                    type="date"
                    value={formPenerimaan.dateFrom}
                    max={formPenerimaan.dateTo || undefined}
                    onChange={(e) =>
                      setFormPenerimaan((f) => ({ ...f, dateFrom: e.target.value }))
                    }
                  />
                </Isian>

                <Isian label={t("nafsulTransaksi.dateTo")}>
                  <Input
                    type="date"
                    value={formPenerimaan.dateTo}
                    min={formPenerimaan.dateFrom || undefined}
                    onChange={(e) => setFormPenerimaan((f) => ({ ...f, dateTo: e.target.value }))}
                  />
                </Isian>

                <Isian label={t("nafsulTransaksi.colType")}>
                  <Select
                    value={formPenerimaan.transactionType}
                    onChange={(e) =>
                      setFormPenerimaan((f) => ({ ...f, transactionType: e.target.value }))
                    }
                  >
                    <option value="">{t("nafsulLaporan.allTypes")}</option>
                    <option value="kelompok">{t("nafsulTransaksi.tab_kelompok")}</option>
                    <option value="pribadi">{t("nafsulTransaksi.tab_pribadi")}</option>
                  </Select>
                </Isian>

                <Isian label={t("nafsulTransaksi.colMethod")}>
                  <Select
                    value={formPenerimaan.paymentMethod}
                    onChange={(e) =>
                      setFormPenerimaan((f) => ({ ...f, paymentMethod: e.target.value }))
                    }
                  >
                    <option value="">{t("nafsulTransaksi.allMethods")}</option>
                    <option value="cash">{t("nafsulTransaksi.method_cash")}</option>
                    <option value="transfer">{t("nafsulTransaksi.method_transfer")}</option>
                    <option value="other">{t("nafsulTransaksi.method_other")}</option>
                  </Select>
                </Isian>

                <Isian label={t("common.status")}>
                  <Select
                    value={formPenerimaan.validation}
                    onChange={(e) =>
                      setFormPenerimaan((f) => ({ ...f, validation: e.target.value }))
                    }
                  >
                    <option value="">{t("nafsulLaporan.allStatuses")}</option>
                    <option value="validated">{t("nafsulLaporan.validated")}</option>
                    <option value="unvalidated">{t("nafsulLaporan.unvalidated")}</option>
                  </Select>
                </Isian>

              </>
            ) : (
              <>
                <Isian label={t("nafsulLaporan.searchMember")} className="sm:col-span-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder={t("nafsulLaporan.searchMemberPlaceholder")}
                      value={formAnggota.search}
                      onChange={(e) => setFormAnggota((f) => ({ ...f, search: e.target.value }))}
                      className="pl-9"
                    />
                  </div>
                </Isian>

                {/* Rentang PERIODE IURAN — bulan yang dibayar, bukan tanggal
                    uangnya diterima. Keduanya kerap berbeda: iuran Januari bisa
                    saja disetor pada Maret. */}
                <Isian label={t("nafsulLaporan.periodFrom")}>
                  <Input
                    type="month"
                    value={formAnggota.periodFrom}
                    max={formAnggota.periodTo || undefined}
                    onChange={(e) => setFormAnggota((f) => ({ ...f, periodFrom: e.target.value }))}
                  />
                </Isian>

                <Isian label={t("nafsulLaporan.periodTo")}>
                  <Input
                    type="month"
                    value={formAnggota.periodTo}
                    min={formAnggota.periodFrom || undefined}
                    onChange={(e) => setFormAnggota((f) => ({ ...f, periodTo: e.target.value }))}
                  />
                </Isian>

                <Isian label={t("nafsulLaporan.colRegion")}>
                  <SelectSearch
                    options={[
                      { value: "", label: t("nafsulLaporan.allRegions") },
                      ...wilayah.map((w) => ({ value: w.kode, label: w.nama })),
                    ]}
                    value={formAnggota.regionCode}
                    onChange={(v) => setFormAnggota((f) => ({ ...f, regionCode: v }))}
                    placeholder={t("nafsulLaporan.allRegions")}
                    triggerClassName="py-2"
                  />
                </Isian>

                <Isian label={t("nafsulLaporan.colLeader")}>
                  <SelectSearch
                    options={[
                      { value: "", label: t("nafsulLaporan.allLeaders") },
                      ...ketua.map((k) => ({ value: k.noketua, label: k.nama })),
                    ]}
                    value={formAnggota.groupLeaderCode}
                    onChange={(v) => setFormAnggota((f) => ({ ...f, groupLeaderCode: v }))}
                    placeholder={t("nafsulLaporan.allLeaders")}
                    triggerClassName="py-2"
                  />
                </Isian>

                <Isian label={t("nafsulLaporan.colRate")}>
                  <SelectSearch
                    options={[
                      { value: "", label: t("nafsulLaporan.allRates") },
                      ...tarif.map((r) => ({ value: r.kode, label: r.nama })),
                    ]}
                    value={formAnggota.rateCode}
                    onChange={(v) => setFormAnggota((f) => ({ ...f, rateCode: v }))}
                    placeholder={t("nafsulLaporan.allRates")}
                    triggerClassName="py-2"
                  />
                </Isian>

                <Isian label={t("common.status")}>
                  <Select
                    value={formAnggota.status}
                    onChange={(e) => setFormAnggota((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="">{t("nafsulLaporan.allStatuses")}</option>
                    <option value="paid">{t("nafsulLaporan.paid")}</option>
                    <option value="unpaid">{t("nafsulLaporan.unpaid")}</option>
                  </Select>
                </Isian>

              </>
            )}
          </div>

          {/* Peringatan yang hanya muncul saat memang berlaku: penyaring periode
              membandingkan kolom bulan/tahun, dan tarif sekali bayar tidak punya
              keduanya — barisnya karena itu selalu tersaring keluar. Tanpa
              keterangan ini, iuran sekali bayar tampak hilang tanpa sebab. */}
          {tab === "anggota" && (formAnggota.periodFrom || formAnggota.periodTo) && (
            <p className="mt-3 text-xs text-gray-400">{t("nafsulLaporan.periodNote")}</p>
          )}

          {/* Satu baris aksi untuk KEDUA tab.
              Tombol Cari sempat ditaruh sebagai sel terakhir grid filter, dan
              letaknya jadi ikut sisa sel yang kebetulan tersisa — mepet kanan di
              tab Penerimaan, tapi sendirian di kiri baris ketiga di tab Per
              Anggota yang filternya satu lebih banyak. Di luar grid, tempatnya
              tetap sama berapa pun jumlah filternya. */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {galat ? <p className="text-sm text-red-600">{galat}</p> : <span />}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                onClick={exportExcel}
                disabled={exporting || memuat}
                className="w-full justify-center sm:w-auto"
              >
                <Sheet className="h-4 w-4" />
                {exporting ? t("nafsulLaporan.exporting") : t("nafsulLaporan.exportExcel")}
              </Button>

              <Button
                type="submit"
                className="w-full justify-center bg-[#075489] text-white hover:bg-[#075489]/90 sm:w-auto"
              >
                <Search className="h-4 w-4" />
                {t("common.search")}
              </Button>
            </div>
          </div>
        </form>

        {/* Rekap berdiri DI LUAR tabel karena cakupannya juga di luar halaman:
            angkanya menjumlah seluruh baris hasil saring. */}
        {memuat || !ringkasan ? null : <SummaryBar items={ringkasan} />}

        {memuat ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : aktif.error ? (
          <div className="space-y-3 py-16 text-center">
            <p className="text-sm text-red-600">{t(aktif.error)}</p>
            <Button type="button" variant="outline" onClick={() => dispatch(retryLaporan(tab))}>
              {t("nafsulLaporan.retry")}
            </Button>
          </div>
        ) : aktif.items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {t("nafsulLaporan.noData")}
          </div>
        ) : (
          // Kolomnya banyak; tabel diberi lebar minimum dan pembungkusnya digeser
          // horizontal — lebih baik digeser daripada kolom terhimpit sampai
          // angkanya terpotong.
          <div className="overflow-x-auto">
            {tab === "penerimaan" ? (
              <TabelPenerimaan rows={penerimaan.items} tanggal={tanggal} />
            ) : (
              <TabelAnggota rows={anggota.items} tanggal={tanggal} />
            )}
          </div>
        )}

        <Pagination
          currentPage={aktif.page}
          totalPages={aktif.totalPages}
          totalItems={aktif.totalItems}
          itemsPerPage={PER_PAGE}
          onPageChange={(p) =>
            dispatch(tab === "penerimaan" ? setPenerimaanPage(p) : setAnggotaPage(p))
          }
        />
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

/** Satu sel filter: label kecil di atas isiannya. */
function Isian({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Rupiah untuk baris rekap — bentuk teks, bukan komponen sel tabel. */
function rupiah(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`whitespace-nowrap px-4 py-2.5 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  )
}

const KEPALA =
  "border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400"

function TabelPenerimaan({
  rows,
  tanggal,
}: {
  rows: LaporanPenerimaanRow[]
  tanggal: (value: string | null) => string
}) {
  const { t } = useLanguage()

  return (
    <table className="w-full min-w-[1280px] text-sm">
      <thead>
        <tr className={KEPALA}>
          <Th>{t("nafsulTransaksi.colNumber")}</Th>
          <Th>{t("nafsulTransaksi.colDate")}</Th>
          <Th>{t("nafsulTransaksi.colType")}</Th>
          <Th>{t("nafsulLaporan.colName")}</Th>
          <Th right>{t("nafsulLaporan.colLines")}</Th>
          <Th right>{t("nafsulTransaksi.colTotal")}</Th>
          <Th right>{t("nafsulLaporan.colMemberDeduction")}</Th>
          <Th right>{t("nafsulLaporan.colLeaderDeduction")}</Th>
          <Th right>{t("nafsulLaporan.colLeaderFee")}</Th>
          <Th right>{t("nafsulTransaksi.colPayment")}</Th>
          <Th>{t("nafsulTransaksi.colMethod")}</Th>
          <Th>{t("common.status")}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r) => (
          <tr key={r.uuid}>
            <td className={`${SEL} font-mono text-xs text-gray-700`}>{r.transaction_number}</td>
            <td className={`${SEL} text-gray-600`}>{tanggal(r.date)}</td>
            <td className={SEL}>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.transaction_type === "pribadi"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-[#075489]/10 text-[#075489]"
                }`}
              >
                {t(`nafsulTransaksi.tab_${r.transaction_type}`)}
              </span>
            </td>
            <td className={`${SEL} text-gray-800`}>
              {/* Setoran perorangan memang tidak punya ketua kelompok; menuliskan
                  nama ketua penampung di sini hanya menyesatkan. */}
              {r.transaction_type === "pribadi" ? (
                <span className="text-slate-500">{t("nafsulTransaksi.personal")}</span>
              ) : (
                r.group_leader_name || <Kosong />
              )}
            </td>
            <td className={`${SEL} text-right tabular-nums text-gray-600`}>
              {r.transactions_count}
            </td>
            <td className={SEL}>
              <CurrencyCell value={r.total} className="text-gray-700" />
            </td>
            <td className={SEL}>
              <CurrencyCell value={r.member_deduction} className="text-gray-600" />
            </td>
            <td className={SEL}>
              <CurrencyCell value={r.group_leader_deduction} className="text-gray-600" />
            </td>
            <td className={SEL}>
              <CurrencyCell value={r.group_leader_fee} className="text-gray-600" />
            </td>
            <td className={SEL}>
              <CurrencyCell value={r.payment} className="font-semibold text-gray-900" />
            </td>
            <td className={SEL}>
              <LencanaMetode metode={r.payment_method} />
            </td>
            <td className={SEL}>
              <LencanaValidasi validatedAt={r.validation_at} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TabelAnggota({
  rows,
  tanggal,
}: {
  rows: LaporanAnggotaRow[]
  tanggal: (value: string | null) => string
}) {
  const { t } = useLanguage()

  return (
    <table className="w-full min-w-[1380px] text-sm">
      <thead>
        <tr className={KEPALA}>
          <Th>{t("nafsulLaporan.colMemberNumber")}</Th>
          <Th>{t("nafsulLaporan.colMemberName")}</Th>
          <Th>{t("nafsulLaporan.colRegion")}</Th>
          <Th>{t("nafsulLaporan.colLeader")}</Th>
          <Th>{t("nafsulTransaksi.colPeriod")}</Th>
          <Th>{t("nafsulLaporan.colRate")}</Th>
          <Th right>{t("nafsulLaporan.colAmount")}</Th>
          <Th right>{t("nafsulLaporan.colDiscount")}</Th>
          <Th right>{t("nafsulTransaksi.colTotal")}</Th>
          <Th>{t("nafsulLaporan.colReceiptNumber")}</Th>
          <Th>{t("nafsulLaporan.colPaidAt")}</Th>
          <Th>{t("common.status")}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map((r) => (
          <tr key={r.uuid}>
            <td className={`${SEL} font-mono text-xs text-gray-700`}>
              {r.member_number || <Kosong />}
            </td>
            <td className={`${SEL} font-medium text-gray-900`}>{r.member_name || <Kosong />}</td>
            <td className={`${SEL} text-gray-700`}>{r.region_name || <Kosong />}</td>
            <td className={`${SEL} text-gray-700`}>{r.group_leader_name || <Kosong />}</td>
            <td className={`${SEL} tabular-nums text-gray-700`}>
              {/* Tarif sekali bayar memang tak berperiode — bukan data yang hilang. */}
              {r.payment_period || <Kosong />}
            </td>
            <td className={`${SEL} text-gray-700`}>{r.rate_name || <Kosong />}</td>
            <td className={SEL}>
              <CurrencyCell value={r.amount} className="text-gray-700" />
            </td>
            <td className={SEL}>
              <CurrencyCell value={r.discount} className="text-gray-600" />
            </td>
            <td className={SEL}>
              <CurrencyCell value={r.total} className="font-semibold text-gray-900" />
            </td>
            <td className={`${SEL} font-mono text-xs text-gray-700`}>
              {r.transaction_number || <Kosong />}
            </td>
            <td className={`${SEL} text-gray-600`}>
              {r.transaction_date ? tanggal(r.transaction_date) : <Kosong />}
            </td>
            <td className={SEL}>
              {/* Ada nomor kuitansi = uangnya sudah masuk. Baris tanpa kuitansi
                  masih berupa tagihan, dan itulah yang dicari saat menelusuri
                  siapa yang belum menyetor. */}
              <span
                className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.transaction_number
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {t(r.transaction_number ? "nafsulLaporan.paid" : "nafsulLaporan.unpaid")}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BadgeCheck,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  LockOpen,
  Printer,
  Search,
  Upload,
  User,
  Users,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { Modal } from "@/components/molecules/Modal"
import { Pagination } from "@/components/molecules/Pagination"
import ImportTransaksiModal from "@/components/nafsul/ImportTransaksiModal"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchTransaksi,
  setTransaksiSearch,
  setTransaksiPaymentMethod,
  setTransaksiDateRange,
  setTransaksiPage,
  invalidateTransaksi,
  PER_PAGE,
  type TransaksiHeader,
} from "@/lib/store/slices/nafsulTransaksiSlice"
import { api, apiBlob, ApiError } from "@/lib/nafsul/api"
import { formatDate } from "@/lib/nafsul/format"
import { localeOf, useLanguage } from "@/lib/i18n"

/**
 * Sel rupiah pada tabel: "Rp" dipatok di kiri, angka di kanan (justify-between)
 * agar antar-baris "Rp"-nya sejajar di kiri dan digitnya sejajar di kanan —
 * tidak ikut bergeser saat panjang angkanya berbeda.
 */
function SelRupiah({ nilai, className }: { nilai: string | number; className?: string }) {
  const angka = Number(nilai)
  if (!Number.isFinite(angka)) {
    return <span className={`tabular-nums ${className ?? ""}`}>—</span>
  }
  return (
    <span className={`flex justify-between gap-3 tabular-nums ${className ?? ""}`}>
      <span>Rp</span>
      <span>{angka.toLocaleString("id-ID", { maximumFractionDigits: 0 })}</span>
    </span>
  )
}

export default function NafsulTransaksiPage() {
  // `lang` ikut diambil supaya nama bulan pada kolom tanggal mengikuti
  // bahasa yang sedang dipilih, bukan dipatok ke Indonesia.
  const { t, lang } = useLanguage()
  const dispatch = useAppDispatch()
  const {
    items,
    totalItems,
    totalPages,
    page,
    search,
    paymentMethod,
    dateFrom,
    dateTo,
    loading,
    loaded,
    dirty,
  } = useAppSelector((s) => s.nafsulTransaksi)

  const [searchInput, setSearchInput] = useState(search)
  const [metodeInput, setMetodeInput] = useState(paymentMethod)
  // Draft rentang tanggal — baru masuk Redux saat tombol Cari ditekan, sama
  // seperti kotak pencarian di sebelahnya.
  const [dariInput, setDariInput] = useState(dateFrom)
  const [sampaiInput, setSampaiInput] = useState(dateTo)

  const [galat, setGalat] = useState<string | null>(null)
  const [imporTerbuka, setImporTerbuka] = useState(false)

  // Pilihan jenis kuitansi sebelum masuk ke formnya. Kelompok dan pribadi kini
  // dua halaman terpisah, jadi tombol Tambah harus menanyakan yang mana dulu.
  const [pilihJenis, setPilihJenis] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TransaksiHeader | null>(null)
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null)

  const [validasiTarget, setValidasiTarget] = useState<TransaksiHeader | null>(null)
  const [validatingUuid, setValidatingUuid] = useState<string | null>(null)
  const [pesanSukses, setPesanSukses] = useState<string | null>(null)

  // Pratinjau biling. `bilingUrl` adalah object URL blob — wajib dibebaskan
  // saat modal ditutup dan saat komponen dilepas, kalau tidak blob PDF-nya
  // menetap di memori tab sampai halaman ditinggalkan.
  const [bilingRow, setBilingRow] = useState<TransaksiHeader | null>(null)
  const [bilingUrl, setBilingUrl] = useState<string | null>(null)
  const [bilingLoading, setBilingLoading] = useState(false)
  const [bilingError, setBilingError] = useState<string | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchTransaksi())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setTransaksiSearch(searchInput))
    dispatch(setTransaksiPaymentMethod(metodeInput))
    dispatch(setTransaksiDateRange({ from: dariInput, to: sampaiInput }))
  }

  async function handleDelete() {
    if (!deleteTarget || deletingUuid !== null) return
    setDeletingUuid(deleteTarget.uuid)
    try {
      await api(`/transaksi/header/${deleteTarget.uuid}`, { method: "DELETE" })
      dispatch(invalidateTransaksi())
      setDeleteTarget(null)
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"))
    } finally {
      setDeletingUuid(null)
    }
  }

  /**
   * Kunci / buka kunci kuitansi — satu tombol, dua arah, mengikuti keadaan
   * barisnya. Endpointnya memang dua supaya membuka kunci jadi tindakan
   * tersendiri, bukan efek samping yang bisa menumpang pada aksi lain.
   *
   * Nama pemeriksa & waktunya ditetapkan SERVER dari pengguna yang login, bukan
   * dikirim dari sini — jejak pemeriksaan tidak boleh bisa disetel klien.
   * Daftarnya di-invalidate supaya lencana & tombol Ubah/Hapus langsung ikut
   * berubah.
   */
  async function handleValidasi() {
    if (!validasiTarget || validatingUuid !== null) return
    const membuka = validasiTarget.validation_at !== null
    setValidatingUuid(validasiTarget.uuid)
    try {
      const hasil = await api<{ message: string }>(
        `/transaksi/header/${validasiTarget.uuid}/${membuka ? "batal-validasi" : "validasi"}`,
        { method: "POST" }
      )
      dispatch(invalidateTransaksi())
      setValidasiTarget(null)
      setPesanSukses(hasil.message)
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"))
    } finally {
      setValidatingUuid(null)
    }
  }

  /**
   * Buka pratinjau biling: ambil PDF sebagai blob (supaya token Bearer ikut
   * terkirim), lalu tampilkan lewat object URL di iframe.
   */
  async function bukaBiling(row: TransaksiHeader) {
    setBilingRow(row)
    setBilingError(null)
    setBilingLoading(true)
    setBilingUrl((lama) => {
      if (lama) URL.revokeObjectURL(lama)
      return null
    })
    try {
      const { blob } = await apiBlob(`/transaksi/header/${row.uuid}/biling`)
      setBilingUrl(URL.createObjectURL(blob))
    } catch (e) {
      setBilingError((e as ApiError).message ?? t("nafsulTransaksi.billingFailed"))
    } finally {
      setBilingLoading(false)
    }
  }

  function tutupBiling() {
    setBilingRow(null)
    setBilingUrl((lama) => {
      if (lama) URL.revokeObjectURL(lama)
      return null
    })
    setBilingError(null)
  }

  function unduhBiling() {
    if (!bilingUrl || !bilingRow) return
    const a = document.createElement("a")
    a.href = bilingUrl
    a.download = `biling-${bilingRow.transaction_number}.pdf`
    a.click()
  }

  // Bebaskan object URL saat komponen dilepas — tutupBiling() hanya terpanggil
  // bila penggunanya benar-benar menutup modalnya.
  useEffect(() => {
    return () => {
      if (bilingUrl) URL.revokeObjectURL(bilingUrl)
    }
  }, [bilingUrl])

  const columns: Column<TransaksiHeader>[] = [
    {
      // Tanggal uang DITERIMA (`date`), bukan `created_at`. Keduanya sering
      // berbeda — setoran Sabtu baru diinput Senin, dan kuitansi hasil impor
      // bertanggal bertahun-tahun ke belakang — dan yang dicari orang di daftar
      // kuitansi selalu tanggal penerimaannya.
      header: t("nafsulTransaksi.colDate"),
      className: "whitespace-nowrap",
      cell: (row) =>
        row.date ? (
          <span className="text-gray-700">{formatDate(row.date, localeOf(lang))}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      header: t("nafsulTransaksi.colNumber"),
      cell: (row) => (
        <div className="leading-tight">
          <span className="font-medium tabular-nums text-gray-900">
            {row.transaction_number}
          </span>
          {/* Penanda pemeriksaan menempel pada nomornya, bukan jadi kolom
              sendiri — daftar ini sengaja dijaga tetap ringkas. */}
          {row.validation_at ? (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
              <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
              {row.validation_by
                ? t("nafsulTransaksi.validatedBy", { name: row.validation_by })
                : t("nafsulTransaksi.validated")}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      header: t("nafsulTransaksi.colName"),
      cell: (row) =>
        // Kuitansi pribadi TIDAK menampilkan nama ketua penampungnya — bagi
        // petugas, setoran perorangan memang tidak punya ketua kelompok, dan
        // menuliskan nama penampung di sini hanya menyesatkan. Yang ditampilkan
        // nama anggota pertamanya, dengan "(+n)" bila kuitansi itu memuat
        // anggota lain — satu kuitansi pribadi boleh berisi lebih dari satu orang.
        row.transaction_type === "pribadi" ? (
          row.member_name ? (
            <span className="text-gray-700">
              {row.member_name}
              {row.members_count > 1 ? (
                <span
                  className="ml-1 text-xs text-gray-400"
                  title={t("nafsulTransaksi.othersCount", {
                    count: row.members_count - 1,
                  })}
                >
                  (+{row.members_count - 1})
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-slate-500">{t("nafsulTransaksi.personal")}</span>
          )
        ) : (
          row.group_leader_name || <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      header: t("nafsulTransaksi.colType"),
      cell: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.transaction_type === "pribadi"
              ? "bg-slate-100 text-slate-700"
              : "bg-[#075489]/10 text-[#075489]"
          }`}
        >
          {t(`nafsulTransaksi.tab_${row.transaction_type}`)}
        </span>
      ),
    },
    {
      header: t("nafsulTransaksi.colTotal"),
      className: "text-right",
      // Total rincian DIKURANGI potongan anggota apa adanya
      // (`member_deduction_input`, angka yang diketik petugas).
      //
      // Hanya tampilan: kolom `total` di database tetap menyimpan jumlah
      // rincian tanpa potongan, karena `balance` di server sudah menguranginya
      // sekali — kalau potongannya ikut disimpan di kolom itu, ia terhitung
      // dua kali.
      cell: (row) => (
        <SelRupiah
          nilai={Number(row.total) - Number(row.member_deduction_input)}
          className="text-gray-700"
        />
      ),
    },
    {
      header: t("nafsulTransaksi.colPayment"),
      className: "text-right",
      cell: (row) => (
        <SelRupiah nilai={row.payment} className="font-semibold text-gray-900" />
      ),
    },
    {
      header: t("nafsulTransaksi.colMethod"),
      cell: (row) => (
        <span
          className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
            {
              cash: "bg-amber-50 text-amber-700",
              transfer: "bg-sky-50 text-sky-700",
              other: "bg-slate-100 text-slate-700",
            }[row.payment_method]
          }`}
        >
          {t(`nafsulTransaksi.method_${row.payment_method}`)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("nafsulTransaksi.title")}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {t("nafsulTransaksi.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImporTerbuka(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t("nafsulMaster.importExcel")}
          </Button>
          <Button
            onClick={() => setPilihJenis(true)}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {t("nafsulTransaksi.add")}
          </Button>
        </div>
      </div>

      <ImportTransaksiModal
        open={imporTerbuka}
        onClose={() => setImporTerbuka(false)}
        // Daftar di-cache Redux; tanpa ini kuitansi hasil impor tidak muncul
        // sampai halaman dibuka ulang.
        onSelesai={() => dispatch(invalidateTransaksi())}
      />

      <Card className="p-0">
        <div className="border-b border-gray-100 px-5 py-4">
          {/*
            Susunannya sama dengan penyaring Order Instrumen: tiap isian
            berlabel, sebaris di layar lebar (`lg:items-end` merapatkan semuanya
            ke garis bawah yang sama), dan membungkus ke bawah saat ruangnya
            kurang — bukan memampatkan kotak pencarian sampai nomor kuitansi
            yang diketik tidak lagi terlihat utuh.
          */}
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
          >
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="transaksi-cari">{t("common.search")}</Label>
              <div className="relative">
                {loading ? (
                  <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#075489]" />
                ) : (
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                )}
                <Input
                  id="transaksi-cari"
                  placeholder={t("nafsulTransaksi.searchPlaceholder")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/*
              Tanpa Label di atasnya: pilihan kosongnya sudah berbunyi "Cara
              Bayar", jadi label terpisah cuma mengulang kata yang sama persis
              tepat di atasnya.
            */}
            <div className="w-full sm:w-48">
              <Select
                aria-label={t("nafsulTransaksi.colMethod")}
                value={metodeInput}
                onChange={(e) => setMetodeInput(e.target.value)}
              >
                <option value="">{t("nafsulTransaksi.allMethods")}</option>
                <option value="cash">{t("nafsulTransaksi.method_cash")}</option>
                <option value="transfer">{t("nafsulTransaksi.method_transfer")}</option>
                <option value="other">{t("nafsulTransaksi.method_other")}</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transaksi-dari">{t("nafsulTransaksi.dateFrom")}</Label>
              <Input
                id="transaksi-dari"
                type="date"
                value={dariInput}
                // Batas atas mengikuti isian "sampai": rentang terbalik tidak
                // pernah punya hasil, dan lebih baik tidak bisa dipilih daripada
                // menghasilkan tabel kosong yang tampak seperti data hilang.
                max={sampaiInput || undefined}
                onChange={(e) => setDariInput(e.target.value)}
                className="sm:w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transaksi-sampai">{t("nafsulTransaksi.dateTo")}</Label>
              <Input
                id="transaksi-sampai"
                type="date"
                value={sampaiInput}
                min={dariInput || undefined}
                onChange={(e) => setSampaiInput(e.target.value)}
                className="sm:w-44"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                className="shrink-0 bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {t("common.search")}
              </Button>
            </div>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {t("common.loading")}
          </div>
        ) : (
          <DataTable
            rowNumberOffset={(page - 1) * PER_PAGE}
            actionsAlign="center"
            columns={columns}
            data={items}
            extraActions={[
              {
                // Satu tombol dua arah, dan ikonnya menggambarkan AKSI-nya —
                // bukan keadaan barisnya: Validasi memakai gembok TERKUNCI
                // (menekannya mengunci), Batal Validasi memakai gembok TERBUKA
                // (menekannya membuka kunci).
                label: (row) =>
                  row.validation_at
                    ? t("nafsulTransaksi.unvalidate")
                    : t("nafsulTransaksi.validate"),
                icon: (row) =>
                  row.validation_at ? (
                    <LockOpen className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-emerald-600" />
                  ),
                onClick: (row) => setValidasiTarget(row),
              },
              {
                // Hanya untuk kuitansi yang sudah divalidasi — biling adalah
                // dokumen final, dan kuitansi yang belum diperiksa isinya masih
                // bisa bergeser. `visible`, bukan `disabled`: tombol mati yang
                // tidak pernah bisa ditekan pada baris yang belum divalidasi
                // cuma jadi teka-teki. Server menolaknya juga.
                label: t("nafsulTransaksi.printBilling"),
                icon: () => <Printer className="h-3.5 w-3.5 text-[#075489]" />,
                visible: (row) => row.validation_at !== null,
                onClick: (row) => bukaBiling(row),
              },
            ]}
            // Tombol Ubah sengaja TIDAK ditawarkan di daftar ini. Halaman
            // editnya sendiri (`/nafsul/transaksi/{uuid}/edit`) masih hidup dan
            // bisa dibuka lewat tautan langsung, jadi ini menyembunyikan
            // jalannya — bukan mencabut kemampuannya.
            onDelete={(row) => setDeleteTarget(row)}
            // Kuitansi yang SUDAH divalidasi tidak boleh lagi dihapus: jejak
            // pemeriksaannya jadi tak ada artinya kalau isinya masih bisa
            // bergeser sesudahnya. Buka kuncinya dulu lewat tombol gembok.
            // Server menolaknya juga — ini hanya supaya tombolnya tidak
            // ditawarkan.
            canDelete={(row) => row.validation_at === null}
            isRowLoading={(row) =>
              deletingUuid === row.uuid || validatingUuid === row.uuid
            }
            emptyMessage={t("nafsulTransaksi.empty")}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={PER_PAGE}
          onPageChange={(p) => dispatch(setTransaksiPage(p))}
        />
      </Card>

      {/* Pratinjau biling PDF */}
      <Modal
        open={bilingRow !== null}
        onClose={tutupBiling}
        title={
          bilingRow
            ? t("nafsulTransaksi.billingTitle", { number: bilingRow.transaction_number })
            : ""
        }
        size="lg"
        panelClassName="max-w-4xl"
        footer={
          <>
            <Button variant="outline" onClick={tutupBiling}>
              {t("common.close")}
            </Button>
            <Button
              onClick={unduhBiling}
              disabled={!bilingUrl}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              <Download className="h-4 w-4" /> {t("nafsulTransaksi.billingDownload")}
            </Button>
          </>
        }
      >
        {bilingLoading ? (
          <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("nafsulTransaksi.billingLoading")}
          </div>
        ) : bilingError ? (
          <div className="flex h-[70vh] items-center justify-center px-6 text-center text-sm text-red-600">
            {bilingError}
          </div>
        ) : bilingUrl ? (
          <iframe
            src={bilingUrl}
            title={t("nafsulTransaksi.billingPreview")}
            className="h-[70vh] w-full rounded-lg border"
          />
        ) : null}
      </Modal>

      {/*
        Pilihan jenis kuitansi. Dua tautan, bukan dua tab di dalam satu form:
        jenisnya menentukan isian yang muncul (ketua kelompok, potongan & jasa
        ketua) dan tersimpan di header, jadi lebih baik dipilih SEBELUM ada yang
        diketik daripada dikunci di tengah pengisian.
      */}
      <Modal
        open={pilihJenis}
        onClose={() => setPilihJenis(false)}
        title={t("nafsulTransaksi.pickTypeTitle")}
        size="sm"
      >
        <div className="space-y-2.5">
          {(
            [
              {
                tipe: "kelompok" as const,
                href: "/nafsul/transaksi/baru/kelompok",
                icon: Users,
              },
              {
                tipe: "pribadi" as const,
                href: "/nafsul/transaksi/baru/pribadi",
                icon: User,
              },
            ]
          ).map(({ tipe, href, icon: Ikon }) => (
            <Link
              key={tipe}
              href={href}
              onClick={() => setPilihJenis(false)}
              className="flex items-center gap-3 rounded-xl border border-[#075489]/25 bg-[#075489]/5 px-4 py-3 transition-colors hover:border-[#075489] hover:bg-[#075489]/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#075489] text-white">
                <Ikon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 font-medium text-[#075489]">
                {t("nafsulTransaksi.tab_" + tipe)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#075489]/60" />
            </Link>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingUuid !== null}
      />

      {/*
        Dua-duanya dikonfirmasi dulu: mengunci menempelkan nama pemeriksa pada
        kuitansi, membuka kunci menghapus nama itu dan mengembalikan hak ubah &
        hapus. Tidak ada yang boleh terjadi karena salah klik.
      */}
      <ConfirmDialog
        open={validasiTarget !== null}
        onClose={() => setValidasiTarget(null)}
        onConfirm={handleValidasi}
        loading={validatingUuid !== null}
        // Bukan aksi hapus: tanpa ini tombolnya merah dan bertuliskan "Hapus".
        tone="primary"
        confirmLabel={
          validasiTarget?.validation_at
            ? t("nafsulTransaksi.unvalidate")
            : t("nafsulTransaksi.validate")
        }
        title={
          validasiTarget?.validation_at
            ? t("nafsulTransaksi.unvalidateTitle")
            // Nomornya pindah ke judul. Keterangannya kini pertanyaan polos
            // tanpa nomor, dan dialog konfirmasi untuk tindakan yang mengunci
            // kuitansi tidak boleh menyembunyikan kuitansi MANA yang dikunci.
            : t("nafsulTransaksi.validateTitle", {
                number: validasiTarget?.transaction_number ?? "",
              })
        }
        description={
          validasiTarget?.validation_at
            ? t("nafsulTransaksi.unvalidateConfirm", {
                number: validasiTarget?.transaction_number ?? "",
                name: validasiTarget?.validation_by ?? "—",
              })
            : t("nafsulTransaksi.validateConfirm", {
                number: validasiTarget?.transaction_number ?? "",
              })
        }
      />

      <ResultDialog
        open={pesanSukses !== null}
        onClose={() => setPesanSukses(null)}
        variant="success"
        description={pesanSukses ?? ""}
      />

      <ResultDialog
        open={galat !== null}
        onClose={() => setGalat(null)}
        variant="error"
        description={galat ?? ""}
      />

    </div>
  )
}

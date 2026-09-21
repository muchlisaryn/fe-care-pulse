"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Loader2,
  Lock,
  LockOpen,
  Printer,
  Search,
  Upload,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/atoms/Button";
import { CurrencyCell } from "@/components/atoms/CurrencyCell";
import { Input } from "@/components/atoms/Input";
import { Label } from "@/components/atoms/Label";
import { Select } from "@/components/atoms/Select";
import { Card } from "@/components/molecules/Card";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { ResultDialog } from "@/components/molecules/ResultDialog";
import { Modal } from "@/components/molecules/Modal";
import { Pagination } from "@/components/molecules/Pagination";
import ImportTransaksiModal from "@/components/nafsul/ImportTransaksiModal";
import BilingModal from "@/components/nafsul/BilingModal";
import RincianBiling from "@/components/nafsul/RincianBiling";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  fetchTransaksi,
  setTransaksiSearch,
  setTransaksiPaymentMethod,
  setTransaksiDateRange,
  setTransaksiPage,
  invalidateTransaksi,
  clearTransaksiBaru,
  PER_PAGE,
  type BarisBiling,
  type TransaksiHeader,
  type TransaksiRincian,
} from "@/lib/store/slices/nafsulTransaksiSlice";
import { api, ApiError } from "@/lib/nafsul/api";
import { formatCurrency, formatDate } from "@/lib/nafsul/format";
import { localeOf, useLanguage } from "@/lib/i18n";

export default function NafsulTransaksiPage() {
  // `lang` ikut diambil supaya nama bulan pada kolom tanggal mengikuti
  // bahasa yang sedang dipilih, bukan dipatok ke Indonesia.
  const { t, lang } = useLanguage();
  const router = useRouter();
  const dispatch = useAppDispatch();
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
    baruDibuat,
  } = useAppSelector((s) => s.nafsulTransaksi);

  const [searchInput, setSearchInput] = useState(search);
  const [metodeInput, setMetodeInput] = useState(paymentMethod);
  // Draft rentang tanggal — baru masuk Redux saat tombol Cari ditekan, sama
  // seperti kotak pencarian di sebelahnya.
  const [dariInput, setDariInput] = useState(dateFrom);
  const [sampaiInput, setSampaiInput] = useState(dateTo);

  const [galat, setGalat] = useState<string | null>(null);
  const [imporTerbuka, setImporTerbuka] = useState(false);

  // Pilihan jenis kuitansi sebelum masuk ke formnya. Kelompok dan pribadi kini
  // dua halaman terpisah, jadi tombol Tambah harus menanyakan yang mana dulu.
  const [pilihJenis, setPilihJenis] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TransaksiHeader | null>(
    null,
  );
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);

  const [validasiTarget, setValidasiTarget] = useState<TransaksiHeader | null>(
    null,
  );
  const [validatingUuid, setValidatingUuid] = useState<string | null>(null);
  /**
   * Kuitansi yang baru saja dikunci, selagi lembar bilingnya ditawarkan.
   *
   * Satu dialog saja untuk satu tindakan: pemberitahuan berhasil dan tawaran
   * mencetak digabung, supaya petugas tidak perlu menutup sesuatu dua kali
   * sebelum bisa mengerjakan apa pun.
   */
  const [tawarCetak, setTawarCetak] = useState<TransaksiHeader | null>(null);
  const [pesanSukses, setPesanSukses] = useState<string | null>(null);

  // Daftar anggota di balik chip "(+n)" pada kolom Nama.
  //
  // Nama-namanya TIDAK ikut dimuat bersama daftar kuitansi: response index cuma
  // membawa `member_name` (anggota pertama) + `members_count`. Rinciannya baru
  // ditembak saat chipnya diklik, satu kuitansi saja — daftar 25 baris tidak
  // perlu menanggung 25 permintaan detail yang mungkin tak satupun dibuka.
  const [anggotaRow, setAnggotaRow] = useState<TransaksiHeader | null>(null);
  const [anggotaList, setAnggotaList] = useState<TransaksiRincian[] | null>(
    null,
  );
  const [anggotaLoading, setAnggotaLoading] = useState(false);
  const [anggotaError, setAnggotaError] = useState<string | null>(null);
  // Hasil yang sudah pernah diambil disimpan per-uuid supaya membuka ulang
  // kuitansi yang sama tidak menembak API lagi. `useRef`, bukan state: isinya
  // tidak boleh memicu render sendiri.
  const anggotaCache = useRef<Map<string, TransaksiRincian[]>>(new Map());

  // Baris lipatan: rincian kuitansi dalam susunan LEMBAR BILING — satu baris
  // per anggota, periodenya sudah dipadatkan jadi rentang. Bentuknya disamakan
  // dengan lembar yang dipegang penyetor supaya yang dilihat petugas di layar
  // dan yang dipegang anggota bisa dibandingkan baris per baris.
  //
  // Hanya SATU baris boleh terbuka sekaligus: membuka yang lain menutup yang
  // sebelumnya. Beberapa lipatan terbuka bersamaan mendorong baris-baris
  // berikutnya jauh ke bawah, dan daftarnya jadi lebih sulit dibaca daripada
  // sebelum dibuka.
  const [rincianUuid, setRincianUuid] = useState<string | null>(null);
  const [rincianList, setRincianList] = useState<BarisBiling[] | null>(null);
  const [rincianLoading, setRincianLoading] = useState(false);
  const [rincianError, setRincianError] = useState<string | null>(null);
  // Sama seperti `anggotaCache`: membuka ulang kuitansi yang sama tidak
  // menembak API lagi.
  const rincianCache = useRef<Map<string, BarisBiling[]>>(new Map());

  // Anggota yang sedang dikeluarkan dari sebuah kuitansi lewat baris lipatannya.
  // Header-nya ikut disimpan: pesan konfirmasi menyebut nomor kuitansinya, dan
  // penghapusannya perlu tahu kuitansi mana yang rinciannya disusun ulang.
  const [buangAnggota, setBuangAnggota] = useState<{
    header: TransaksiHeader;
    baris: BarisBiling;
  } | null>(null);
  const [membuangMember, setMembuangMember] = useState<number | null>(null);

  // Kuitansi yang lembar bilingnya sedang dibuka. Pengambilan PDF, object URL
  // & pembebasannya dipegang `BilingModal` — lihat komponennya.
  const [bilingRow, setBilingRow] = useState<TransaksiHeader | null>(null);

  useEffect(() => {
    if (loaded && !dirty) return;
    dispatch(fetchTransaksi());
  }, [loaded, dirty, dispatch]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    dispatch(setTransaksiSearch(searchInput));
    dispatch(setTransaksiPaymentMethod(metodeInput));
    dispatch(setTransaksiDateRange({ from: dariInput, to: sampaiInput }));
  }

  async function handleDelete() {
    if (!deleteTarget || deletingUuid !== null) return;
    setDeletingUuid(deleteTarget.uuid);
    try {
      await api(`/transaksi/header/${deleteTarget.uuid}`, { method: "DELETE" });
      dispatch(invalidateTransaksi());
      setDeleteTarget(null);
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"));
    } finally {
      setDeletingUuid(null);
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
  async function handleValidasi(target?: TransaksiHeader) {
    // Barisnya boleh dioper langsung: kuitansi yang barusan dibuat ditawari
    // validasi lewat dialognya sendiri, dan menyetel `validasiTarget` dulu
    // berarti menunggu satu render sebelum permintaannya bisa dikirim.
    const baris = target ?? validasiTarget;
    if (!baris || validatingUuid !== null) return;
    const membuka = baris.validation_at !== null;
    setValidatingUuid(baris.uuid);
    try {
      const hasil = await api<{ message: string }>(
        `/transaksi/header/${baris.uuid}/${membuka ? "batal-validasi" : "validasi"}`,
        { method: "POST" },
      );
      dispatch(invalidateTransaksi());
      dispatch(clearTransaksiBaru());
      setValidasiTarget(null);

      // Baru MENGUNCI: bilingnya kini boleh dicetak, dan menawarkannya di sini
      // menghemat satu langkah mencari kuitansi yang sama lagi di daftar.
      // Membuka kunci tidak ditawari apa-apa — yang terjadi justru kebalikannya,
      // bilingnya tidak lagi bisa dicetak.
      if (membuka) {
        setPesanSukses(hasil.message);
        return;
      }

      setTawarCetak(baris);
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"));
    } finally {
      setValidatingUuid(null);
    }
  }

  /**
   * Keluarkan SELURUH rincian milik satu anggota dari sebuah kuitansi.
   *
   * Dikerjakan lewat `PUT` header dengan rincian yang tersisa, BUKAN lewat
   * `DELETE /transaksi/{uuid}` per baris: endpoint per-baris tidak menyentuh
   * headernya, jadi `total` & `balance` kuitansi akan membeku di angka yang
   * sudah tidak cocok dengan isinya. Lewat header, servernya yang menjumlah
   * ulang — persis seperti yang terjadi di halaman edit.
   *
   * Rinciannya ditembak ulang lebih dulu (`show`) karena daftar hanya membawa
   * ringkasan per anggota; kiriman `transactions` harus memuat baris yang
   * DIPERTAHANKAN, bukan yang dibuang.
   */
  async function handleBuangAnggota() {
    if (!buangAnggota || membuangMember !== null) return;
    const { header, baris } = buangAnggota;

    setMembuangMember(baris.member_id);
    try {
      const detail = await api<TransaksiHeader>(
        `/transaksi/header/${header.uuid}`,
      );
      const sisa = (detail.transactions ?? []).filter(
        (r) => r.member_id !== baris.member_id,
      );

      // Kuitansi tanpa rincian ditolak server, dan memang tidak punya arti.
      // Dihentikan di sini supaya pesannya menyebut jalan keluarnya (hapus
      // kuitansinya) alih-alih memantulkan galat validasi yang tidak menolong.
      if (sisa.length === 0) {
        setBuangAnggota(null);
        setGalat(
          t("nafsulTransaksi.detailRemoveLast", { member: baris.nama }),
        );
        return;
      }

      // KOTOR & diskonnya terpisah, sama seperti yang dihitung server:
      // `total` menyimpan yang sebelum diskon, `member_deduction` jumlah
      // diskonnya. Keduanya dikirim agar payload lengkap; server menghitung
      // ulang dari rincian yang ikut dikirim di bawah.
      const totalSisa = sisa.reduce((n, r) => n + Number(r.amount), 0);
      const diskonSisa = sisa.reduce((n, r) => n + Number(r.discount), 0);

      const sesudah = await api<TransaksiHeader>(`/transaksi/header/${header.uuid}`, {
        method: "PUT",
        body: {
          date: detail.date,
          transaction_type: detail.transaction_type,
          // Dikirim untuk memenuhi validasi; angka yang DIPAKAI dihitung ulang
          // server dari rinciannya.
          total: totalSisa,
          // Pembayaran dibiarkan apa adanya: yang berubah isi kuitansinya,
          // bukan uang yang sudah diterima. Selisihnya muncul sendiri di
          // `balance` supaya petugas melihat kuitansinya kini lebih bayar dan
          // bisa membetulkannya di halaman edit.
          member_deduction: diskonSisa,
          group_leader_fee_percent:
            detail.transaction_type === "kelompok"
              ? Number(detail.group_leader_fee_percent)
              : 0,
          payment: Number(detail.payment),
          payment_method: detail.payment_method,
          transactions: sisa.map((r) => ({
            uuid: r.uuid,
            member_id: r.member_id,
            rate_id: r.rate_id,
            payment_period: r.payment_period,
            amount: Number(r.amount),
            discount: Number(r.discount),
          })),
        },
      });

      // Dua singgahan ini memegang isi kuitansi yang barusan berubah; tanpa
      // dibuang, membuka ulang barisnya akan menampilkan anggota yang sudah
      // tidak ada di sana.
      rincianCache.current.delete(header.uuid);
      anggotaCache.current.delete(header.uuid);
      dispatch(invalidateTransaksi());
      setBuangAnggota(null);

      // Membuang rincian menurunkan tagihan tanpa menyentuh uang yang sudah
      // diterima, jadi kuitansi yang tadinya pas bisa jadi lebih bayar. Itu
      // disebutkan di pesan berhasilnya — kalau tidak, selisihnya baru
      // ketahuan jauh belakangan saat kuitansinya dibuka lagi.
      const sisaSelisih = Math.round(Number(sesudah.balance) * 100) / 100;
      const catatan =
        sisaSelisih === 0
          ? ""
          : " " +
            t(
              sisaSelisih > 0
                ? "nafsulTransaksi.editRemovedShort"
                : "nafsulTransaksi.editRemovedExtra",
              { amount: formatCurrency(Math.abs(sisaSelisih), localeOf(lang)) },
            );

      setPesanSukses(
        t("nafsulTransaksi.detailRemoved", {
          member: baris.nama,
          number: header.transaction_number,
        }) + catatan,
      );

      // Baris lipatannya masih terbuka di layar — isinya diperbarui di tempat,
      // bukan dibiarkan menampilkan daftar lama sampai ditutup lalu dibuka lagi.
      if (rincianUuid === header.uuid) {
        setRincianLoading(true);
        try {
          const hasil = await api<{ data: BarisBiling[] }>(
            `/transaksi/header/${header.uuid}/rincian-biling`,
          );
          rincianCache.current.set(header.uuid, hasil.data);
          setRincianList(hasil.data);
        } finally {
          setRincianLoading(false);
        }
      }
    } catch (e) {
      setBuangAnggota(null);
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"));
    } finally {
      setMembuangMember(null);
    }
  }

  /**
   * Buka daftar anggota sebuah kuitansi. Modalnya dibuka SEKARANG (dengan
   * keadaan memuat) lalu isinya menyusul — menunggu response dulu baru membuka
   * membuat chipnya terasa tidak merespons saat jaringan lambat.
   */
  const bukaAnggota = useCallback(async (row: TransaksiHeader) => {
    setAnggotaRow(row);
    setAnggotaError(null);

    const cached = anggotaCache.current.get(row.uuid);
    if (cached) {
      setAnggotaList(cached);
      return;
    }

    setAnggotaList(null);
    setAnggotaLoading(true);
    try {
      const detail = await api<TransaksiHeader & { transactions?: TransaksiRincian[] }>(
        `/transaksi/header/${row.uuid}`,
      );
      // Satu anggota bisa punya beberapa baris rincian (mis. iuran 3 bulan),
      // sedangkan `members_count` menghitung anggota BERBEDA. Tanpa dedup ini
      // panjang daftarnya tidak akan cocok dengan angka pada chipnya.
      const unik = new Map<number, TransaksiRincian>();
      for (const r of detail.transactions ?? []) {
        if (!unik.has(r.member_id)) unik.set(r.member_id, r);
      }
      const daftar = Array.from(unik.values());
      anggotaCache.current.set(row.uuid, daftar);
      setAnggotaList(daftar);
    } catch (e) {
      setAnggotaError(
        e instanceof ApiError ? e.message : t("nafsulTransaksi.membersFailed"),
      );
    } finally {
      setAnggotaLoading(false);
    }
  }, [t]);

  function tutupAnggota() {
    setAnggotaRow(null);
    setAnggotaList(null);
    setAnggotaError(null);
  }

  /**
   * Buka/tutup baris lipatan sebuah kuitansi.
   *
   * Menekan panah baris yang sedang terbuka akan menutupnya — panah yang sama
   * bekerja dua arah, sesuai dengan ikonnya yang ikut berubah.
   *
   * Isinya baru ditembak saat panahnya ditekan, bukan ikut dimuat bersama
   * daftarnya: alasannya sama dengan chip "(+n)" di atas — 25 baris yang boleh
   * jadi tak satu pun dibuka tidak perlu menanggung 25 permintaan detail.
   */
  const bukaRincian = useCallback(async (row: TransaksiHeader) => {
    if (rincianUuid === row.uuid) {
      setRincianUuid(null);
      return;
    }

    setRincianUuid(row.uuid);
    setRincianError(null);

    const cached = rincianCache.current.get(row.uuid);
    if (cached) {
      setRincianList(cached);
      return;
    }

    setRincianList(null);
    setRincianLoading(true);
    try {
      const hasil = await api<{ data: BarisBiling[] }>(
        `/transaksi/header/${row.uuid}/rincian-biling`,
      );
      rincianCache.current.set(row.uuid, hasil.data);
      setRincianList(hasil.data);
    } catch (e) {
      setRincianError(
        e instanceof ApiError ? e.message : t("nafsulTransaksi.detailFailed"),
      );
    } finally {
      setRincianLoading(false);
    }
  }, [rincianUuid, t]);

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
          <span className="text-gray-700">
            {formatDate(row.date, localeOf(lang))}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      header: t("nafsulTransaksi.colNumber"),
      // Nomornya saja. Keterangan "Divalidasi oleh …" yang dulu menempel di
      // bawahnya sudah dilepas: status kuncinya tetap terbaca dari tombol
      // gembok di kolom Aksi (yang berubah jadi "Batal Validasi") dan dari
      // tersedianya tombol Cetak Biling, jadi barisnya tidak perlu tinggi dua
      // kali demi mengulangi hal yang sama.
      cell: (row) => (
        <span className="font-medium tabular-nums text-gray-900">
          {row.transaction_number}
        </span>
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
                <button
                  type="button"
                  onClick={() => bukaAnggota(row)}
                  className="ml-1 rounded text-xs text-gray-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-[#075489] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#075489]/40"
                  title={t("nafsulTransaksi.othersCount", {
                    count: row.members_count - 1,
                  })}
                >
                  (+{row.members_count - 1})
                </button>
              ) : null}
            </span>
          ) : (
            <span className="text-slate-500">
              {t("nafsulTransaksi.personal")}
            </span>
          )
        ) : (
          row.group_leader_name || (
            <span className="text-xs text-gray-400">—</span>
          )
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
      /*
        BERSIH — `total` yang kotor dikurangi potongan anggota.

        Kolom `total` menyimpan yang KOTOR (Σ nominal sebelum diskon) dan
        diskonnya dilaporkan terpisah di `member_deduction`; itu dua angka yang
        perlu dipisah di halaman edit & lembar biling supaya potongannya bisa
        ditelusuri. Tapi di daftar ini tidak ada kolom potongan, jadi angka
        kotor berdiri sendiri tanpa keterangan dan terbaca lebih besar daripada
        yang sebenarnya ditagihkan.

        Dihitung di layar, bukan disimpan sebagai kolom ketiga: dua kolom yang
        menjawab pertanyaan yang sama cepat atau lambat berselisih, dan yang ini
        selalu turunan langsung dari keduanya.
      */
      cell: (row) => (
        <CurrencyCell
          value={Number(row.total) - Number(row.member_deduction)}
          className="text-gray-700"
        />
      ),
    },
    {
      header: t("nafsulTransaksi.colPayment"),
      className: "text-right",
      cell: (row) => (
        <CurrencyCell
          value={row.payment}
          className="font-semibold text-gray-900"
        />
      ),
    },
    {
      // Siapa yang memeriksa kuitansi ini. Dulu menempel sebagai keterangan di
      // bawah nomornya, yang membuat tiap baris setinggi dua baris; sebagai
      // kolom sendiri ia bisa dibaca menurun dan dibandingkan antar-kuitansi.
      //
      // Kosong = BELUM divalidasi, ditulis "—" seperti sel kosong lain di
      // aplikasi — bukan dibiarkan benar-benar kosong, yang terbaca seperti
      // data yang gagal dimuat.
      header: t("nafsulTransaksi.colValidator"),
      className: "whitespace-nowrap",
      cell: (row) =>
        row.validation_by ? (
          <span className="text-gray-700">{row.validation_by}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
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
  ];

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
                <option value="transfer">
                  {t("nafsulTransaksi.method_transfer")}
                </option>
                <option value="other">
                  {t("nafsulTransaksi.method_other")}
                </option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transaksi-dari">
                {t("nafsulTransaksi.dateFrom")}
              </Label>
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
              <Label htmlFor="transaksi-sampai">
                {t("nafsulTransaksi.dateTo")}
              </Label>
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
            // `rowNumberOffset` tidak lagi dipakai: kolom "No" sudah berganti
            // jadi kolom panah begitu `renderExpanded` diberikan.
            actionsAlign="center"
            // Empat aksi per baris (Validasi, Cetak Biling, Ubah, Hapus) —
            // dilipat jadi satu tombol titik-tiga supaya kolom Aksi tidak
            // lebih lebar daripada datanya sendiri.
            actionsAsMenu
            columns={columns}
            data={items}
            isRowExpanded={(row) => rincianUuid === row.uuid}
            onToggleExpand={bukaRincian}
            renderExpanded={(row) => (
              <RincianBiling
                baris={rincianUuid === row.uuid ? rincianList : null}
                loading={rincianLoading}
                error={rincianError}
                // Tombol Ubah & Hapus per anggota hanya untuk kuitansi yang
                // BELUM divalidasi; server menolaknya juga.
                tervalidasi={row.validation_at !== null}
                memberSedangDihapus={membuangMember}
                // Ubah membuka halaman edit kuitansi ini dengan rincian anggota
                // yang ditekan langsung disorot — di sanalah nominal, diskon &
                // periodenya bisa diperbaiki, jadi tidak perlu layar kedua yang
                // mengulang formulir yang sama.
                onEdit={(b) =>
                  router.push(
                    `/nafsul/transaksi/${row.uuid}/edit?anggota=${b.member_id}`,
                  )
                }
                onDelete={(b) => setBuangAnggota({ header: row, baris: b })}
              />
            )}
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
                onClick: (row) => setBilingRow(row),
              },
            ]}
            // Ubah membuka halaman edit kuitansi ini — tempat rincian bisa
            // ditambah, dikoreksi & dibuang. Ikut masuk ke tombol titik-tiga
            // bersama aksi lainnya.
            onEdit={(row) => router.push(`/nafsul/transaksi/${row.uuid}/edit`)}
            // Sama alasannya dengan Hapus di bawah: kuitansi yang SUDAH
            // divalidasi tidak boleh lagi diubah, dan server menolaknya juga.
            canEdit={(row) => row.validation_at === null}
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

      {/* Daftar anggota sebuah kuitansi — isinya diambil saat dibuka */}
      <Modal
        open={anggotaRow !== null}
        onClose={tutupAnggota}
        title={
          anggotaRow
            ? t("nafsulTransaksi.membersTitle", {
                number: anggotaRow.transaction_number,
              })
            : ""
        }
        size="md"
        footer={
          <Button variant="outline" onClick={tutupAnggota}>
            {t("common.close")}
          </Button>
        }
      >
        {anggotaLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("nafsulTransaksi.membersLoading")}
          </div>
        ) : anggotaError ? (
          <div className="py-10 text-center text-sm text-red-600">
            {anggotaError}
          </div>
        ) : anggotaList && anggotaList.length > 0 ? (
          <ol className="divide-y divide-gray-100">
            {anggotaList.map((r, i) => (
              <li key={r.member_id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-gray-400">
                  {i + 1}
                </span>
                <User className="h-4 w-4 shrink-0 text-gray-300" />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm text-gray-800">
                    {r.member_name ?? "—"}
                  </p>
                  {r.member_number ? (
                    <p className="text-[11px] tabular-nums text-gray-400">
                      {r.member_number}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="py-10 text-center text-sm text-gray-400">
            {t("nafsulTransaksi.membersEmpty")}
          </div>
        )}
      </Modal>

      {/*
        Kuitansi yang barusan dibuat di halaman lain: transaksinya sudah
        selesai dan petugas sudah kembali ke sini, baru penawaran validasinya
        muncul. Menutupnya cukup membuang titipannya — kuitansinya sudah
        tersimpan, dan gemboknya tetap ada di kolom Aksi.
      */}
      <ResultDialog
        open={baruDibuat !== null}
        onClose={() => dispatch(clearTransaksiBaru())}
        variant="success"
        title={t("nafsulTransaksi.createdTitle", {
          number: baruDibuat?.transaction_number ?? "",
        })}
        description={t("nafsulTransaksi.createdValidateNow")}
        secondaryLabel={t("nafsulTransaksi.validate")}
        onSecondary={() => baruDibuat && handleValidasi(baruDibuat)}
        actionLabel={t("nafsulTransaksi.validateLater")}
      />

      {/* Berhasil dikunci — dialog HASIL (ikon centang), bukan dialog konfirmasi:
          yang barusan terjadi sudah selesai, dan bentuk bertanya membuatnya
          terbaca seperti tindakan yang masih menunggu kepastian. Lembar
          bilingnya ditawarkan sebagai langkah lanjutan di dialog yang sama. */}
      <ResultDialog
        open={tawarCetak !== null}
        onClose={() => setTawarCetak(null)}
        variant="success"
        title={t("nafsulTransaksi.validatedTitle", {
          number: tawarCetak?.transaction_number ?? "",
        })}
        // Pesan server sengaja TIDAK dipakai di sini: isinya mengulang judul
        // ("Kuitansi X berhasil divalidasi"), jadi yang terbaca cuma kalimat
        // yang sama dua kali. Yang berguna justru langkah berikutnya.
        description={t("nafsulTransaksi.createdPrintNow")}
        secondaryLabel={t("nafsulTransaksi.printBilling")}
        onSecondary={() => {
          if (tawarCetak) setBilingRow(tawarCetak);
          setTawarCetak(null);
        }}
      />

      <BilingModal
        uuid={bilingRow?.uuid ?? null}
        nomor={bilingRow?.transaction_number ?? ""}
        onClose={() => setBilingRow(null)}
      />

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
          {[
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
          ].map(({ tipe, href, icon: Ikon }) => (
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

      {/* Mengeluarkan anggota membuang SELURUH rincian iurannya sekaligus —
          bisa belasan baris — jadi nama & nomor kuitansinya disebut di dialog
          supaya yang ditekan terlihat sebelum terjadi. */}
      <ConfirmDialog
        open={buangAnggota !== null}
        onClose={() => setBuangAnggota(null)}
        onConfirm={handleBuangAnggota}
        loading={membuangMember !== null}
        confirmLabel={t("nafsulTransaksi.detailRemoveConfirmLabel")}
        title={t("nafsulTransaksi.detailRemoveTitle")}
        description={t("nafsulTransaksi.detailRemoveConfirm", {
          member: buangAnggota?.baris.nama ?? "—",
          number: buangAnggota?.header.transaction_number ?? "—",
        })}
      />

      {/*
        Dua-duanya dikonfirmasi dulu: mengunci menempelkan nama pemeriksa pada
        kuitansi, membuka kunci menghapus nama itu dan mengembalikan hak ubah &
        hapus. Tidak ada yang boleh terjadi karena salah klik.
      */}
      <ConfirmDialog
        open={validasiTarget !== null}
        onClose={() => setValidasiTarget(null)}
        // Dibungkus, bukan dioper langsung: `onClick` React menyerahkan objek
        // event sebagai argumen pertama, dan itu akan terbaca sebagai baris
        // yang hendak divalidasi.
        onConfirm={() => handleValidasi()}
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
            ? // Nomornya ikut di judul pada KEDUA arah: dialog untuk tindakan
              // yang mengunci/membuka kuitansi tidak boleh menyembunyikan
              // kuitansi MANA yang sedang dikenai tindakan itu.
              t("nafsulTransaksi.unvalidateTitle", {
                number: validasiTarget?.transaction_number ?? "",
              })
            : t("nafsulTransaksi.validateTitle", {
                number: validasiTarget?.transaction_number ?? "",
              })
        }
        description={
          validasiTarget?.validation_at
            ? t("nafsulTransaksi.unvalidateConfirm")
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
  );
}

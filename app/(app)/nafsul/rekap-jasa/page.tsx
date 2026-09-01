"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Printer,
  ReceiptText,
  Search,
} from "lucide-react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { SelectSearch } from "@/components/atoms/SelectSearch";
import { Card } from "@/components/molecules/Card";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { DateRangeFields } from "@/components/molecules/DateRangeFields";
import { Modal } from "@/components/molecules/Modal";
import { PageHeader } from "@/components/molecules/PageHeader";
import { Pagination } from "@/components/molecules/Pagination";
import { ResultDialog } from "@/components/molecules/ResultDialog";
import { api, apiBlob, ApiError } from "@/lib/nafsul/api";
import { downloadXlsx } from "@/lib/excel";
import { rentangSebulanTerakhir } from "@/lib/dateRange";
import { formatDate } from "@/lib/nafsul/format";
import type { KetuaKelompok, Paginated } from "@/lib/nafsul/types";
import { localeOf, useLanguage } from "@/lib/i18n";

const PER_PAGE = 25;

/**
 * Banyaknya ketua yang ditawarkan dropdown sekali muat. Sengaja sedikit: daftar
 * ketua bisa panjang, dan menariknya utuh hanya untuk sebuah penyaring membuat
 * halaman menunggu data yang hampir seluruhnya tak jadi dipakai. Sisanya dicari
 * lewat kotak pencarian di dalam dropdown, yang menembak server.
 */
const KETUA_PER_PAGE = 10;

/**
 * Ukuran halaman saat menarik SELURUH baris untuk export / unduh massal.
 * Besar supaya jumlah permintaannya sedikit, tapi tidak tanpa batas — satu
 * respons raksasa lebih mudah gagal di tengah jalan daripada beberapa yang wajar.
 */
const EXPORT_PER_PAGE = 500;

/** "sepuluh ribu rupiah" → "Sepuluh Ribu Rupiah". */
function judulKata(teks: string): string {
  return teks.replace(/\p{L}/gu, (huruf) => huruf.toUpperCase());
}

/**
 * Satu baris jasa ketua. Bentuknya mengikuti RekapJasaController::transform —
 * `leader_fee` & `leader_fee_words` DIHITUNG DI SERVER, bukan di sini: nominal
 * dan kalimat terbilangnya harus sama persis dengan yang nanti tercetak di
 * dokumen, dan dua tempat yang menghitung sendiri-sendiri pasti berselisih.
 */
type RekapJasaRow = {
  uuid: string;
  transaction_number: string;
  date: string | null;
  group_leader_name: string | null;
  validation_at: string | null;
  /** Angka pembentuk jasa ketua: (total - member_deduction) x percent / 100. */
  total: string;
  member_deduction: string;
  fee_base: string;
  group_leader_fee_percent: string;
  leader_fee: string;
  /**
   * Terbilang jasa ketua. Tetap diambil dari server meski kolomnya TIDAK
   * ditampilkan di tabel — dipakai saat dokumennya dicetak, dan menghapusnya
   * dari sini berarti menghitung ulang kalimatnya di tempat lain.
   */
  leader_fee_words: string;
};

/**
 * Sel rupiah: "Rp" dipatok di kiri, angka di kanan — sama seperti daftar
 * transaksi, supaya antar-baris "Rp"-nya sejajar dan digitnya rata kanan.
 */
function SelRupiah({ nilai }: { nilai: string | number }) {
  const angka = Number(nilai);
  if (!Number.isFinite(angka)) {
    return <span className="tabular-nums">—</span>;
  }
  return (
    <span className="flex justify-between gap-3 tabular-nums">
      <span>Rp</span>
      <span>{angka.toLocaleString("id-ID", { maximumFractionDigits: 0 })}</span>
    </span>
  );
}

export default function NafsulRekapJasaPage() {
  const { t, lang } = useLanguage();

  // Rentang bawaan sebulan terakhir, dihitung sekali lewat inisialisasi malas.
  // Tanpa itu `rentangSebulanTerakhir()` ikut jalan di tiap render — hasilnya
  // sama, tapi kerjanya sia-sia.
  const [awal] = useState(() => rentangSebulanTerakhir());

  const [items, setItems] = useState<RekapJasaRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  // Draft penyaring — baru diterapkan saat tombol Cari ditekan, sama seperti
  // daftar transaksi. Mengetik satu huruf tidak boleh menembak API.
  const [searchInput, setSearchInput] = useState("");
  const [ketuaInput, setKetuaInput] = useState("");
  const [dariInput, setDariInput] = useState(awal.from);
  const [sampaiInput, setSampaiInput] = useState(awal.to);
  const [search, setSearch] = useState("");
  const [ketua, setKetua] = useState("");
  const [dateFrom, setDateFrom] = useState(awal.from);
  const [dateTo, setDateTo] = useState(awal.to);

  // Pilihan ketua kelompok — sehalaman (10 baris), dicari di server.
  const [ketuaOpts, setKetuaOpts] = useState<KetuaKelompok[]>([]);
  const [ketuaQuery, setKetuaQuery] = useState("");
  const [ketuaLoading, setKetuaLoading] = useState(true);
  // Ketua yang sedang terpilih, disimpan terpisah dari hasil pencarian: begitu
  // kata kunci berubah ia bisa tidak ada lagi di 10 baris yang dikembalikan
  // server, dan tanpa salinan ini labelnya berubah jadi kosong padahal
  // penyaringnya masih aktif.
  const [ketuaTerpilih, setKetuaTerpilih] = useState<KetuaKelompok | null>(null);

  // Pratinjau biling. `bilingUrl` adalah object URL blob — wajib dibebaskan saat
  // modal ditutup dan saat komponen dilepas, kalau tidak blob PDF-nya menetap di
  // memori tab sampai halaman ditinggalkan.
  // Dokumen yang sedang dipratinjau. Menyimpan judul & nama berkasnya sekaligus
  // karena modal ini melayani DUA dokumen (biling & kuitansi jasa) — kalau cuma
  // menyimpan barisnya, judul dan nama unduhannya harus ditebak dari tempat lain.
  const [bilingRow, setBilingRow] = useState<{
    row: RekapJasaRow;
    judul: string;
    namaBerkas: string;
  } | null>(null);
  const [bilingUrl, setBilingUrl] = useState<string | null>(null);
  const [bilingLoading, setBilingLoading] = useState(false);
  const [bilingError, setBilingError] = useState<string | null>(null);

  // Cetak langsung (tanpa membuka pratinjau). Baris yang sedang disiapkan
  // ditandai supaya tombolnya berubah jadi keadaan memuat.
  const [cetakUuid, setCetakUuid] = useState<string | null>(null);
  // Iframe tersembunyi tempat PDF-nya dimuat sebelum dialog cetak dipanggil.
  // Disimpan agar bisa dibersihkan saat halaman ditinggalkan — iframe yang
  // tertinggal menahan blob PDF-nya di memori tab.
  const bingkaiCetak = useRef<{ frame: HTMLIFrameElement; url: string }[]>([]);

  // Export Excel & unduh massal kuitansi (satu PDF).
  const [exportLoading, setExportLoading] = useState(false);
  const [unduhLoading, setUnduhLoading] = useState(false);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<RekapJasaRow>>("/rekap-jasa", {
        params: {
          page,
          per_page: PER_PAGE,
          search: search || undefined,
          group_leader: ketua || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setItems(res.data);
      setTotalItems(res.total);
      setTotalPages(res.last_page);
    } catch (e) {
      setItems([]);
      setTotalItems(0);
      setTotalPages(1);
      setGalat(
        e instanceof ApiError ? e.message : t("nafsulRekapJasa.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, ketua, dateFrom, dateTo, t]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Isi dropdown ketua: 10 baris pertama saat dibuka, lalu hasil pencarian
  // server tiap kata kuncinya berubah. Ditunda 300 ms supaya mengetik satu kata
  // tidak jadi satu permintaan per huruf; muat pertama (kata kunci kosong) tidak
  // ditunda agar dropdown tidak terasa kosong sesaat setelah halaman terbuka.
  useEffect(() => {
    let aktif = true;
    const jeda = setTimeout(
      () => {
        setKetuaLoading(true);
        api<Paginated<KetuaKelompok>>("/ketua-kelompok", {
          params: {
            page: 1,
            per_page: KETUA_PER_PAGE,
            search: ketuaQuery || undefined,
          },
        })
          .then((res) => {
            if (aktif) setKetuaOpts(res.data);
          })
          .catch(() => {
            // Dropdown gagal dimuat bukan alasan menutup halaman: daftarnya
            // tetap bisa dibaca, hanya penyaring ketuanya yang kosong.
            if (aktif) setKetuaOpts([]);
          })
          .finally(() => {
            if (aktif) setKetuaLoading(false);
          });
      },
      ketuaQuery ? 300 : 0,
    );
    return () => {
      aktif = false;
      clearTimeout(jeda);
    };
  }, [ketuaQuery]);

  // Bebaskan object URL terakhir & iframe cetak saat halaman ditinggalkan.
  useEffect(() => {
    const bingkai = bingkaiCetak.current;
    return () => {
      setBilingUrl((lama) => {
        if (lama) URL.revokeObjectURL(lama);
        return null;
      });
      for (const { frame, url } of bingkai) {
        frame.remove();
        URL.revokeObjectURL(url);
      }
      bingkai.length = 0;
    };
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setKetua(ketuaInput);
    setDateFrom(dariInput);
    setDateTo(sampaiInput);
    // Penyaring berubah → hasilnya beda, jadi kembali ke halaman pertama.
    // Tanpa ini pencarian yang hasilnya sedikit bisa mendarat di halaman kosong.
    setPage(1);
  }

  /**
   * Buka pratinjau sebuah dokumen di modal — pola yang sama dengan halaman
   * Transaksi: dokumennya ditampilkan dulu di iframe, baru diunduh kalau memang
   * jadi dipakai. Melayani biling maupun kuitansi jasa.
   */
  async function bukaPratinjau(
    row: RekapJasaRow,
    path: string,
    judul: string,
    namaBerkas: string,
  ) {
    setBilingRow({ row, judul, namaBerkas });
    setBilingError(null);
    setBilingLoading(true);
    setBilingUrl((lama) => {
      if (lama) URL.revokeObjectURL(lama);
      return null;
    });
    try {
      const { blob } = await apiBlob(path);
      setBilingUrl(URL.createObjectURL(blob));
    } catch (e) {
      setBilingError(
        e instanceof ApiError ? e.message : t("nafsulRekapJasa.pdfFailed"),
      );
    } finally {
      setBilingLoading(false);
    }
  }

  /**
   * Tarik SELURUH baris yang cocok dengan penyaring sekarang, lintas halaman.
   *
   * Export dan unduh massal harus mencakup seluruh hasil penyaringan, bukan
   * hanya 25 baris yang kebetulan sedang tampil — kalau tidak, berkas yang
   * diserahkan ke orang lain diam-diam kehilangan sebagian datanya.
   */
  async function ambilSemuaBaris(): Promise<RekapJasaRow[]> {
    const kumpulan: RekapJasaRow[] = [];
    let halaman = 1;
    let terakhir = 1;

    do {
      const res = await api<Paginated<RekapJasaRow>>("/rekap-jasa", {
        params: {
          page: halaman,
          per_page: EXPORT_PER_PAGE,
          search: search || undefined,
          group_leader: ketua || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      kumpulan.push(...res.data);
      terakhir = res.last_page;
      halaman += 1;
    } while (halaman <= terakhir);

    return kumpulan;
  }

  async function exportExcel() {
    setExportLoading(true);
    try {
      const baris = await ambilSemuaBaris();
      if (baris.length === 0) {
        setGalat(t("nafsulRekapJasa.exportEmpty"));
        return;
      }

      downloadXlsx(
        `Rekap-Jasa-Koordinator-${dateFrom || "awal"}_sd_${dateTo || "akhir"}.xlsx`,
        t("nafsulRekapJasa.title"),
        [
          t("nafsulRekapJasa.colDate"),
          t("nafsulRekapJasa.colNumber"),
          t("nafsulRekapJasa.colLeader"),
          t("nafsulRekapJasa.colFee"),
          t("nafsulRekapJasa.colWords"),
        ],
        baris.map((r) => [
          r.date ?? "",
          r.transaction_number,
          r.group_leader_name ?? "",
          // Angka, bukan teks berformat: supaya bisa dijumlahkan di Excel.
          Number(r.leader_fee),
          // Huruf besar tiap kata, sama dengan yang tercetak di kuitansi —
          // nilai mentah dari server sengaja huruf kecil semua.
          judulKata(r.leader_fee_words),
        ]),
      );
    } catch (e) {
      setGalat(
        e instanceof ApiError ? e.message : t("nafsulRekapJasa.exportFailed"),
      );
    } finally {
      setExportLoading(false);
    }
  }

  /**
   * Unduh SATU berkas PDF berisi kuitansi jasa seluruh baris hasil penyaringan,
   * satu kuitansi per halaman.
   *
   * Dirakit di server, bukan dengan menembak endpoint per baris lalu mengunduh
   * puluhan berkas: yang dibawa petugas ke ketua-ketua kelompok adalah setumpuk
   * lembar untuk ditandatangani, dan satu dokumen yang tinggal dicetak jauh
   * lebih mudah diurus. Penyaring yang dikirim sama persis dengan daftar, jadi
   * isinya selalu sama dengan yang sedang tampil.
   */
  async function unduhSemuaKuitansi() {
    setUnduhLoading(true);
    try {
      const { blob, nama } = await apiBlob("/rekap-jasa/kuitansi", {
        search: search || undefined,
        group_leader: ketua || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        nama ?? `Kuitansi-Jasa_${dateFrom || "awal"}_sd_${dateTo || "akhir"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Server membalas 422 dengan pesannya sendiri saat penyaringnya tidak
      // menyisakan baris apa pun — tampilkan apa adanya.
      setGalat(
        e instanceof ApiError ? e.message : t("nafsulRekapJasa.exportFailed"),
      );
    } finally {
      setUnduhLoading(false);
    }
  }

  /**
   * Cetak biling langsung, tanpa membuka pratinjau.
   *
   * PDF-nya dimuat ke iframe tersembunyi lalu `print()` dipanggil dari sana —
   * bukan `window.open(url)`: permintaan jendela baru tidak membawa header
   * Authorization, jadi yang sampai ke layar 401, bukan dokumennya. Lagipula
   * pop-up seperti itu lazim diblokir peramban.
   */
  async function cetakDokumen(row: RekapJasaRow, path: string) {
    setCetakUuid(row.uuid);
    try {
      const { blob } = await apiBlob(path);
      const url = URL.createObjectURL(blob);

      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.position = "fixed";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.style.visibility = "hidden";
      frame.src = url;

      frame.onload = () => {
        // `focus()` dulu: di sebagian peramban dialog cetak tidak muncul kalau
        // yang aktif masih dokumen induknya.
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };

      bingkaiCetak.current.push({ frame, url });
      document.body.appendChild(frame);
    } catch (e) {
      setGalat(
        e instanceof ApiError ? e.message : t("nafsulRekapJasa.pdfFailed"),
      );
    } finally {
      setCetakUuid(null);
    }
  }

  function tutupBiling() {
    setBilingRow(null);
    setBilingUrl((lama) => {
      if (lama) URL.revokeObjectURL(lama);
      return null;
    });
    setBilingError(null);
  }

  function unduhBiling() {
    if (!bilingUrl || !bilingRow) return;
    const a = document.createElement("a");
    a.href = bilingUrl;
    a.download = bilingRow.namaBerkas;
    a.click();
  }

  const labelKetua = (k: KetuaKelompok) =>
    k.nama ? `${k.nama} (${k.noketua})` : k.noketua;

  // Ketua terpilih disisipkan di depan bila ia tidak ada di hasil pencarian
  // sekarang — kalau tidak, pilihan yang sedang aktif tampil sebagai kosong.
  const ketuaTampil =
    ketuaTerpilih &&
    !ketuaOpts.some((k) => k.noketua === ketuaTerpilih.noketua)
      ? [ketuaTerpilih, ...ketuaOpts]
      : ketuaOpts;

  const ketuaOptions = [
    { value: "", label: t("nafsulRekapJasa.allLeaders") },
    ...ketuaTampil.map((k) => ({ value: k.noketua, label: labelKetua(k) })),
  ];

  const columns: Column<RekapJasaRow>[] = [
    {
      header: t("nafsulRekapJasa.colDate"),
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
      header: t("nafsulRekapJasa.colNumber"),
      className: "whitespace-nowrap",
      cell: (row) => (
        <span className="font-medium tabular-nums text-gray-900">
          {row.transaction_number}
        </span>
      ),
    },
    {
      header: t("nafsulRekapJasa.colLeader"),
      cell: (row) =>
        row.group_leader_name || (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      header: t("nafsulRekapJasa.colFee"),
      className: "text-right whitespace-nowrap",
      cell: (row) => (
        <span className="font-semibold text-gray-900">
          <SelRupiah nilai={row.leader_fee} />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nafsulRekapJasa.title")}
        subtitle={t("nafsulRekapJasa.subtitle")}
      />

      <Card className="p-0">
        {/* Filter — SATU baris di layar lebar: pencarian (2) + ketua (2) +
            rentang tanggal (2) + tombol Cari (1), total 7 kolom. Di layar sedang
            jadi dua kolom, di ponsel menumpuk. `items-end` menyejajarkan tombol
            dengan dasar input, bukan dengan label di atasnya. */}
        <form
          onSubmit={handleSearch}
          className="border-b border-gray-100 px-5 py-4"
        >
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-7">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulRekapJasa.searchLabel")}
              </label>
              <div className="relative">
                {loading ? (
                  <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#075489]" />
                ) : (
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                )}
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("nafsulRekapJasa.searchPlaceholder")}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulRekapJasa.colLeader")}
              </label>
              {/* Opsi bernilai kosong = kembali ke semua ketua (SelectSearch di
                  app ini tidak punya tombol clear sendiri). */}
              <SelectSearch
                options={ketuaOptions}
                value={ketuaInput}
                onChange={(v) => {
                  setKetuaInput(v);
                  setKetuaTerpilih(
                    ketuaTampil.find((k) => k.noketua === v) ?? null,
                  );
                }}
                // Mengisi ini mematikan penyaringan lokal SelectSearch: opsinya
                // sudah hasil pencarian server, jadi ketua yang cocok lewat kode
                // pun tidak ikut tersaring lagi di sisi klien.
                onQueryChange={setKetuaQuery}
                loading={ketuaLoading}
                placeholder={t("nafsulRekapJasa.allLeaders")}
                searchPlaceholder={t("nafsulRekapJasa.searchLeader")}
                triggerClassName="py-2"
              />
            </div>

            <DateRangeFields
              fromLabel={t("nafsulRekapJasa.from")}
              toLabel={t("nafsulRekapJasa.to")}
              from={dariInput}
              to={sampaiInput}
              onFromChange={setDariInput}
              onToChange={setSampaiInput}
            />

            <Button
              type="submit"
              className="w-full bg-[#075489] text-white hover:bg-[#075489]/90 sm:col-span-2 lg:col-span-1"
            >
              <Search className="mr-2 h-4 w-4" />
              {t("common.search")}
            </Button>
          </div>
        </form>

        <div className="p-5">
          {/* Aksi seluruh hasil — mencakup SEMUA baris yang cocok penyaring,
              bukan hanya halaman yang sedang tampil. */}
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={exportExcel}
              disabled={exportLoading || unduhLoading}
            >
              {exportLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              {t("nafsulRekapJasa.exportExcel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={unduhSemuaKuitansi}
              disabled={exportLoading || unduhLoading}
            >
              {unduhLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {unduhLoading
                ? t("nafsulRekapJasa.downloadPreparing")
                : t("nafsulRekapJasa.downloadAllReceipts")}
            </Button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {t("common.loading")}
            </div>
          ) : (
            <DataTable
              rowNumberOffset={(page - 1) * PER_PAGE}
              columns={columns}
              data={items}
              // Tiga aksi per baris: deretan tombol membuat kolom Aksi lebih
              // lebar daripada datanya sendiri, jadi dilipat ke satu tombol.
              actionsAsMenu
              extraActions={[
                {
                  // Hanya kuitansi yang sudah divalidasi: biling adalah dokumen
                  // final dan endpointnya menolak kuitansi yang belum diperiksa.
                  // `visible`, bukan `disabled` — tombol mati yang tidak pernah
                  // bisa ditekan cuma jadi teka-teki.
                  label: t("nafsulRekapJasa.previewPdf"),
                  icon: () => <Eye className="h-3.5 w-3.5 text-[#075489]" />,
                  visible: (row) => row.validation_at !== null,
                  onClick: (row) =>
                    bukaPratinjau(
                      row,
                      `/transaksi/header/${row.uuid}/biling`,
                      t("nafsulRekapJasa.pdfTitle", {
                        number: row.transaction_number,
                      }),
                      `Biling-${row.transaction_number}.pdf`,
                    ),
                },
                {
                  // Langsung ke dialog cetak — untuk petugas yang sudah tahu
                  // isinya dan tidak perlu melihat pratinjaunya dulu.
                  label: (row) =>
                    cetakUuid === row.uuid
                      ? t("nafsulRekapJasa.printing")
                      : t("nafsulRekapJasa.print"),
                  icon: () => (
                    <Printer className="h-3.5 w-3.5 text-[#075489]" />
                  ),
                  visible: (row) => row.validation_at !== null,
                  disabled: (row) => cetakUuid === row.uuid,
                  onClick: (row) =>
                    cetakDokumen(row, `/transaksi/header/${row.uuid}/biling`),
                },
                {
                  // Dokumen BERBEDA dari biling: tanda terima bahwa ketua
                  // kelompoknya sudah menerima komisi atas setoran itu.
                  //
                  // Dibuka sebagai PRATINJAU, mengikuti pola halaman Transaksi —
                  // lembar yang akan ditandatangani orang lain sebaiknya dilihat
                  // dulu sebelum kertasnya terlanjur keluar dari printer.
                  //
                  // Tanpa `visible` — sengaja muncul di SETIAP baris, termasuk
                  // kuitansi yang belum divalidasi: komisi bisa diserahkan
                  // sebelum setorannya sempat diperiksa, dan endpointnya pun
                  // tidak lagi menuntut validasi.
                  label: t("nafsulRekapJasa.printReceipt"),
                  icon: () => (
                    <ReceiptText className="h-3.5 w-3.5 text-[#075489]" />
                  ),
                  onClick: (row) =>
                    bukaPratinjau(
                      row,
                      `/rekap-jasa/${row.uuid}/kuitansi`,
                      t("nafsulRekapJasa.receiptTitle", {
                        number: row.transaction_number,
                      }),
                      `Kuitansi-Jasa-${row.transaction_number}.pdf`,
                    ),
                },
              ]}
              emptyMessage={t("nafsulRekapJasa.empty")}
            />
          )}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={PER_PAGE}
            onPageChange={setPage}
          />
        </div>
      </Card>

      {/* Pratinjau biling PDF */}
      <Modal
        open={bilingRow !== null}
        onClose={tutupBiling}
        title={bilingRow?.judul ?? ""}
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
              className="bg-[#075489] text-white hover:bg-[#075489]/90"
            >
              <Download className="mr-2 h-4 w-4" />
              {t("nafsulRekapJasa.pdfDownload")}
            </Button>
          </>
        }
      >
        {bilingLoading ? (
          <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("nafsulRekapJasa.pdfLoading")}
          </div>
        ) : bilingError ? (
          <div className="flex h-[70vh] items-center justify-center px-6 text-center text-sm text-red-600">
            {bilingError}
          </div>
        ) : bilingUrl ? (
          <iframe
            src={bilingUrl}
            title={t("nafsulRekapJasa.pdfPreview")}
            className="h-[70vh] w-full rounded-lg border"
          />
        ) : null}
      </Modal>

      <ResultDialog
        open={galat !== null}
        onClose={() => setGalat(null)}
        variant="error"
        description={galat ?? ""}
      />
    </div>
  );
}

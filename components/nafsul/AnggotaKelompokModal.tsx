"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Printer, Search } from "lucide-react";
import { api, apiBlob, ApiError } from "@/lib/nafsul/api";
import type { Anggota, KetuaKelompok, Paginated } from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Modal } from "@/components/molecules/Modal";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { Pagination } from "@/components/molecules/Pagination";
import { downloadXlsx } from "@/lib/excel";
import { localeOf, useLanguage, useT } from "@/lib/i18n";

const PER_PAGE = 10;

const pesanGagal = (err: unknown) =>
  err instanceof ApiError ? err.message : "nafsulAnggota.modalLoadFailed";

/**
 * Daftar anggota satu kelompok di dalam modal.
 *
 * Anggota ditarik per halaman saat modal dibuka — bukan ikut dimuat bersama
 * daftar kelompoknya, yang akan berarti menarik ribuan baris sekaligus hanya
 * untuk berjaga-jaga kalau salah satu kelompok dibuka.
 *
 * Kolom "Tipe" tidak ditampilkan: seluruh baris di sini sudah pasti Kelompok.
 */
export default function AnggotaKelompokModal({
  ketua,
  onClose,
}: {
  /** Kelompok yang sedang dilihat; `null` menutup modal. */
  ketua: KetuaKelompok | null;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <Modal
      open={ketua !== null}
      onClose={onClose}
      title={ketua ? `${t("nafsulAnggota.modalTitle")} — ${ketua.nama}` : t("nafsulAnggota.modalTitle")}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          {t("nafsulAnggota.close")}
        </Button>
      }
    >
      {/* `key` membuat isinya dipasang ulang tiap ganti kelompok, jadi pencarian
          & halaman kembali ke awal tanpa perlu me-reset state satu per satu. */}
      {ketua && <IsiModal key={ketua.noketua} ketua={ketua} />}
    </Modal>
  );
}

function IsiModal({ ketua }: { ketua: KetuaKelompok }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState<Paginated<Anggota> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // `draft` = isian kotak cari; `dicari` = kata kunci yang sedang ditampilkan.
  const [draft, setDraft] = useState("");
  const [dicari, setDicari] = useState("");

  const [mengekspor, setMengekspor] = useState(false);
  const [mencetak, setMencetak] = useState(false);
  /** Object URL pratinjau PDF; wajib dibebaskan saat ditutup & saat dilepas. */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const ambil = (halaman: number, search: string) =>
    api<Paginated<Anggota>>("/anggota", {
      params: {
        noketua: ketua.noketua,
        search,
        // Diurutkan per NOMOR ANGGOTA, bukan nama (bawaan server): nomornya
        // berurut sesuai kapan orangnya mendaftar, dan itu urutan yang sama
        // dengan lembar cetaknya — kertas & layar jadi bisa dibandingkan
        // baris per baris.
        sort: "no_anggota",
        page: halaman,
        per_page: PER_PAGE,
      },
    });

  useEffect(() => {
    let aktif = true;

    ambil(1, "")
      .then((res) => aktif && setData(res))
      .catch((err) => aktif && setError(pesanGagal(err)));

    return () => {
      aktif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function muat(halaman: number, search: string) {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      setData(await ambil(halaman, search));
      setDicari(search);
    } catch (err) {
      setError(pesanGagal(err));
    } finally {
      setLoading(false);
    }
  }

  function handleCari(e: React.FormEvent) {
    e.preventDefault();
    muat(1, draft);
  }

  /** Sel kosong seragam dengan tabel lain di aplikasi. */
  const kosong = <span className="text-xs text-gray-400">—</span>;

  const kolom: Column<Anggota>[] = [
    {
      header: t("nafsulAnggota.colMemberNo"),
      className: "whitespace-nowrap font-mono text-xs",
      cell: (a) => a.no_anggota ?? kosong,
    },
    { header: t("nafsulAnggota.colName"), cell: (a) => a.nama },
    { header: t("nafsulAnggotaForm.address"), cell: (a) => a.alamat ?? kosong },
    { header: t("nafsulAnggotaForm.note"), cell: (a) => a.keterangan ?? kosong },
    {
      header: t("nafsulAnggota.colLastPeriod"),
      className: "whitespace-nowrap tabular-nums",
      // Tiga keadaan, bukan dua: `undefined` berarti kolom periodenya memang
      // tidak dikirim, sedangkan `null` berarti anggotanya belum pernah bayar.
      cell: (a) =>
        a.periode_terakhir_bayar === undefined
          ? kosong
          : (a.periode_terakhir_bayar ?? (
              <span className="text-xs text-gray-400">
                {t("nafsulAnggota.neverPaid")}
              </span>
            )),
    },
  ];

  /**
   * Seluruh anggota kelompok ini untuk diekspor — bukan halaman yang sedang
   * terbuka.
   *
   * Kata kunci pencarian yang sedang aktif ikut dibawa: petugas yang menyaring
   * dulu lalu menekan Unduh mengharapkan berkasnya berisi yang barusan ia
   * lihat. `per_page` besar, bukan `all=1`: bentuk yang kedua sengaja tidak
   * menyertakan kolom periode iuran terakhir.
   */
  async function unduhExcel() {
    if (mengekspor) return;

    setMengekspor(true);
    setError(null);

    try {
      const semua = await api<Paginated<Anggota>>("/anggota", {
        params: {
          noketua: ketua.noketua,
          search: dicari,
          sort: "no_anggota",
          page: 1,
          per_page: 5000,
        },
      });

      downloadXlsx(
        `anggota-${ketua.noketua}.xlsx`,
        t("nafsulAnggota.modalTitle"),
        [
          t("nafsulAnggota.colMemberNo"),
          t("nafsulAnggota.colName"),
          t("nafsulAnggotaForm.address"),
          t("nafsulAnggotaForm.note"),
          t("nafsulAnggota.colLastPeriod"),
        ],
        semua.data.map((a) => [
          a.no_anggota,
          a.nama,
          a.alamat,
          a.keterangan,
          a.periode_terakhir_bayar,
        ]),
      );
    } catch (err) {
      setError(pesanGagal(err));
    } finally {
      setMengekspor(false);
    }
  }

  /**
   * Buka pratinjau PDF-nya.
   *
   * Diambil sebagai BLOB, bukan dipasang langsung sebagai `src` iframe:
   * endpoint-nya butuh token Bearer, dan iframe tidak bisa mengirim header.
   */
  async function cetakPdf() {
    if (mencetak) return;

    setMencetak(true);
    setError(null);

    try {
      const { blob } = await apiBlob(
        `/ketua-kelompok/${ketua.noketua}/cetak-anggota`,
        { search: dicari },
      );
      setPdfUrl((lama) => {
        if (lama) URL.revokeObjectURL(lama);

        return URL.createObjectURL(blob);
      });
    } catch (err) {
      setError(pesanGagal(err));
    } finally {
      setMencetak(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          {t("nafsulMaster.leaderNo")}{" "}
          <span className="font-mono text-xs">{ketua.noketua}</span> ·{" "}
          {t("nafsulAnggota.membersCount", {
            count: (ketua.anggota_count ?? 0).toLocaleString(localeOf(lang)),
          })}
        </p>

        <form onSubmit={handleCari} className="flex gap-2 sm:w-80">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={t("nafsulAnggota.modalSearch")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {loading ? "..." : t("common.search")}
          </Button>
        </form>
      </div>

      {/*
        Dua tombol berdampingan, bukan satu tombol "Cetak" yang membuka menu:
        pilihannya cuma dua dan keduanya sama-sama sering dipakai, jadi satu
        lapis menu di depannya hanya menambah satu klik tanpa menyederhanakan
        apa pun.

        Keduanya mencakup SELURUH anggota kelompok ini — bukan halaman yang
        kebetulan sedang terbuka — dan ikut menghormati kata kunci pencarian
        yang sedang aktif.
      */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={cetakPdf}
          disabled={mencetak}
          className="gap-1.5"
        >
          <Printer className="h-4 w-4" />
          {mencetak ? t("common.loading") : t("nafsulAnggota.printPdf")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={unduhExcel}
          disabled={mengekspor}
          className="gap-1.5"
        >
          <FileSpreadsheet className="h-4 w-4" />
          {mengekspor ? t("common.loading") : t("nafsulAnggota.downloadExcel")}
        </Button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t(error)}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        {/*
          Kolomnya disusun di sini, tidak memakai `TabelAnggota`: yang dicari
          orang saat membuka daftar satu kelompok adalah alamat, keterangan &
          sampai kapan iurannya terbayar — bukan jenis kelamin atau siapa yang
          mendaftarkannya. Kolom yang sama persis juga yang tercetak di PDF &
          Excel, supaya kertas, berkas, dan layar bisa dibandingkan baris per
          baris.
        */}
        <DataTable<Anggota>
          columns={kolom}
          data={data?.data ?? []}
          rowNumberOffset={((data?.current_page ?? 1) - 1) * PER_PAGE}
          emptyMessage={
            dicari
              ? t("nafsulAnggota.modalNoMatch")
              : t("nafsulAnggota.modalEmpty")
          }
        />

        {data && (
          <Pagination
            currentPage={data.current_page}
            totalPages={data.last_page}
            totalItems={data.total}
            itemsPerPage={PER_PAGE}
            onPageChange={(halaman) => muat(halaman, dicari)}
          />
        )}
      </div>

      {/* Pratinjau PDF — modal di atas modal, sengaja tanpa kepala sendiri
          supaya tidak ada dua tombol tutup yang tidak jelas mana miliknya. */}
      <Modal
        open={pdfUrl !== null}
        onClose={() => {
          setPdfUrl((lama) => {
            if (lama) URL.revokeObjectURL(lama);

            return null;
          });
        }}
        title={t("nafsulAnggota.printTitle", { name: ketua.nama })}
        size="lg"
        panelClassName="max-w-4xl"
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPdfUrl((lama) => {
                if (lama) URL.revokeObjectURL(lama);

                return null;
              });
            }}
          >
            {t("common.close")}
          </Button>
        }
      >
        {pdfUrl && (
          <iframe
            src={pdfUrl}
            title={t("nafsulAnggota.printTitle", { name: ketua.nama })}
            className="h-[70vh] w-full rounded-lg border"
          />
        )}
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import { kunciJenisKelamin } from "@/lib/nafsul/format";
import { localeOf, useLanguage } from "@/lib/i18n";
import type { KetuaKelompok, Paginated } from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { Pagination } from "@/components/molecules/Pagination";
import AnggotaKelompokModal from "@/components/nafsul/AnggotaKelompokModal";

const PER_PAGE = 15;

/**
 * Satu permintaan halaman ketua — tanpa menyentuh state.
 *
 * `search` disaring SERVER dan mencakup kode maupun nama ketua, jadi petugas
 * boleh mengetik yang mana pun yang ia ingat. Menyaring di browser tidak bisa:
 * daftarnya berpaginasi, dan membuang baris setelah diterima akan menyisakan
 * halaman yang tampak kosong padahal masih ada kelompok lain di belakangnya.
 */
const ambil = (halaman: number, search: string) =>
  api<Paginated<KetuaKelompok>>("/ketua-kelompok", {
    params: {
      tanpa_pribadi: 1,
      search: search || undefined,
      page: halaman,
      per_page: PER_PAGE,
    },
  });

/** Pesan galat: pakai pesan asli dari server, atau KUNCI kamus sebagai cadangan. */
const pesanGagal = (err: unknown) =>
  err instanceof ApiError ? err.message : "nafsulAnggota.leaderLoadFailed";

/**
 * Daftar master ketua kelompok (di luar ketua penampung anggota perorangan),
 * lengkap dengan jumlah anggota tiap kelompok.
 *
 * Data diambil per halaman — server hanya mengirim 15 baris sekali jalan, dan
 * `anggota_count` dihitung lewat COUNT, bukan dengan memuat anggotanya.
 */
export default function DaftarKetuaKelompok() {
  const [data, setData] = useState<Paginated<KetuaKelompok> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Kelompok yang anggotanya sedang dibuka di modal. */
  const [dilihat, setDilihat] = useState<KetuaKelompok | null>(null);

  // `draft` = isian kotak cari; `dicari` = kata kunci yang sedang ditampilkan.
  // Dipisah supaya mengetik di kotaknya tidak ikut mengubah data yang tampil —
  // satu kali Cari = satu permintaan, bukan satu permintaan per huruf.
  const [draft, setDraft] = useState("");
  const [dicari, setDicari] = useState("");

  // Muat halaman pertama.
  useEffect(() => {
    let aktif = true;

    ambil(1, "")
      .then((res) => aktif && setData(res))
      .catch((err) => aktif && setError(pesanGagal(err)))
      .finally(() => aktif && setLoading(false));

    return () => {
      aktif = false;
    };
  }, []);

  async function muat(halaman: number, search: string) {
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
    // Selalu kembali ke halaman 1: kata kunci baru punya jumlah halamannya
    // sendiri, dan halaman 7 dari hasil sebelumnya bisa saja sudah tidak ada.
    muat(1, draft);
  }

  const { t, lang } = useLanguage();

  const columns: Column<KetuaKelompok>[] = [
    { header: t("nafsulAnggota.leaderColNo"), className: "font-mono text-xs", cell: (k) => k.noketua },
    { header: t("nafsulAnggota.colName"), className: "font-medium", cell: (k) => k.nama },
    {
      header: t("nafsulAnggota.colGender"),
      cell: (k) => {
        const kunci = kunciJenisKelamin(k.jenis_kelamin);
        return kunci ? t(kunci) : <span className="text-gray-400 text-xs">—</span>;
      },
    },
    {
      header: t("nafsulMaster.phone"),
      cell: (k) => k.telepon ?? <span className="text-gray-400 text-xs">—</span>,
    },
    {
      header: t("nafsulAnggota.leaderColTotal"),
      className: "text-right tabular-nums",
      cell: (k) => (k.anggota_count ?? 0).toLocaleString(localeOf(lang)),
    },
  ];

  return (
    <div>
      <form
        onSubmit={handleCari}
        className="mb-4 flex gap-2 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t("nafsulAnggota.leaderSearchPlaceholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="shrink-0 bg-[#075489] hover:bg-[#075489]/90 text-white"
        >
          {loading ? t("nafsulMaster.loading") : t("common.search")}
        </Button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t(error)}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("nafsulMaster.loading")}</div>
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            hideRowNumber
            emptyMessage={t(
              data === null
                ? "nafsulAnggota.leaderLoadFailedShort"
                : dicari
                  ? "nafsulAnggota.leaderNoMatch"
                  : "nafsulAnggota.leaderEmpty",
            )}
            extraActions={[{ label: t("nafsulAnggota.viewMembers"), onClick: (k) => setDilihat(k) }]}
          />
        )}

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

      <AnggotaKelompokModal ketua={dilihat} onClose={() => setDilihat(null)} />
    </div>
  );
}

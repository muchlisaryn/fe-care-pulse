"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import type { Anggota, KetuaKelompok, Paginated } from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Modal } from "@/components/molecules/Modal";
import { Pagination } from "@/components/molecules/Pagination";
import TabelAnggota from "@/components/nafsul/TabelAnggota";
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

  const ambil = (halaman: number, search: string) =>
    api<Paginated<Anggota>>("/anggota", {
      params: { noketua: ketua.noketua, search, page: halaman, per_page: PER_PAGE },
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

      {error && (
        <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t(error)}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <TabelAnggota
          // Tabel ini sudah berada di dalam modal; lihat `tampilkanRiwayat`.
          tampilkanRiwayat={false}
          rows={data?.data ?? []}
          loading={data === null && !error}
          tampilkanTipe={false}
          pesanKosong={
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
    </>
  );
}

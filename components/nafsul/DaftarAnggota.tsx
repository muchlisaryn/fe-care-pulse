"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import type { Anggota, Paginated } from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Input } from "@/components/atoms/Input";
import { Pagination } from "@/components/molecules/Pagination";
import { ResultDialog } from "@/components/molecules/ResultDialog";
import TabelAnggota from "@/components/nafsul/TabelAnggota";
import { Select } from "@/components/atoms/Select";
import { apiErrorMessage } from "@/lib/apiError";
import { useT } from "@/lib/i18n";

const PER_PAGE = 15;

export type TipeAnggota = "pribadi" | "kelompok";

interface Filter {
  search: string;
  tipe: string;
}

const pesanGagal = (err: unknown) =>
  err instanceof ApiError ? err.message : "nafsulAnggota.loadFailed";

/**
 * Tabel anggota beserta pencarian & paginasinya.
 *
 * Dipakai dua halaman: daftar seluruh anggota, dan halaman per tipe. Bila
 * `tipeTetap` diisi, tipe dikunci ke nilai itu dan pilihan tipenya disembunyikan
 * — halaman itu memang hanya menampilkan satu tipe.
 *
 * Tidak ada debounce: filter baru berlaku setelah tombol "Cari" ditekan, jadi
 * satu kali cari = satu kali permintaan, bukan satu permintaan per huruf.
 */
export default function DaftarAnggota({ tipeTetap }: { tipeTetap?: TipeAnggota }) {
  const t = useT();
  const filterAwal: Filter = { search: "", tipe: tipeTetap ?? "" };

  // `draft` = isian filter di layar; `terapkan` = filter yang sedang ditampilkan.
  // Dipisah supaya mengetik di kotak cari tidak ikut mengubah data yang tampil.
  const [draft, setDraft] = useState<Filter>(filterAwal);
  const [terapkan, setTerapkan] = useState<Filter>(filterAwal);

  const [data, setData] = useState<Paginated<Anggota> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Anggota | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{
    variant: "success" | "error";
    description: string;
  } | null>(null);

  /** Permintaan murni, tanpa menyentuh state — dipakai muat awal & `muat()`. */
  const ambil = (filter: Filter, halaman: number) =>
    api<Paginated<Anggota>>("/anggota", {
      params: {
        search: filter.search,
        tipe: tipeTetap ?? filter.tipe,
        page: halaman,
        per_page: PER_PAGE,
      },
    });

  // Muat awal: tanpa filter (selain tipe yang dikunci), halaman pertama.
  useEffect(() => {
    let aktif = true;

    ambil({ search: "", tipe: tipeTetap ?? "" }, 1)
      .then((res) => aktif && setData(res))
      .catch((err) => aktif && setError(pesanGagal(err)))
      .finally(() => aktif && setLoading(false));

    return () => {
      aktif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipeTetap]);

  async function muat(filter: Filter, halaman: number) {
    setLoading(true);
    setError(null);

    try {
      const res = await ambil(filter, halaman);
      setData(res);
      setTerapkan(filter);
    } catch (err) {
      setError(pesanGagal(err));
    } finally {
      setLoading(false);
    }
  }

  function handleCari(e: React.FormEvent) {
    e.preventDefault();
    muat(draft, 1);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      await api(`/anggota/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setResult({ variant: "success", description: t("nafsulAnggota.deletedOk") });
      // Tetap di halaman yang sama dengan filter yang sedang tampil.
      muat(terapkan, data?.current_page ?? 1);
    } catch (err) {
      setDeleteTarget(null);
      setResult({
        variant: "error",
        description: apiErrorMessage(err, t("nafsulAnggota.deleteFailed")),
      });
    } finally {
      setDeleting(false);
    }
  }

  const set = (field: keyof Filter, value: string) =>
    setDraft((f) => ({ ...f, [field]: value }));

  return (
    <div>
      {/*
        Flex, bukan grid: jumlah filternya sedikit dan lebarnya tidak seragam,
        jadi grid berkolom tetap malah membuat tombol terjepit di sisa kolom.
      */}
      <form
        onSubmit={handleCari}
        className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t("nafsulAnggota.searchPlaceholder")}
            value={draft.search}
            onChange={(e) => set("search", e.target.value)}
            className="pl-9"
          />
        </div>

        {!tipeTetap && (
          <Select
            value={draft.tipe}
            onChange={(e) => set("tipe", e.target.value)}
            className="sm:w-52"
          >
            <option value="">{t("nafsulAnggota.allTypes")}</option>
            <option value="pribadi">{t("nafsulCommon.personal")}</option>
            <option value="kelompok">{t("nafsulCommon.group")}</option>
          </Select>
        )}

        {/*
          suppressHydrationWarning: server mengirim `disabled=""` yang BENAR (state
          awal loading=true), tetapi ekstensi peramban (pengisi formulir / pengelola
          kata sandi) kerap melucuti atribut `disabled` pada tombol form sebelum
          React sempat menghidrasi — memicu peringatan mismatch palsu. Dibatasi ke
          tombol ini saja, bukan di atom Button, agar mismatch nyata di tempat lain
          tetap terdeteksi.
        */}
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={loading}
            suppressHydrationWarning
            className="flex-1 sm:flex-none bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {loading ? t("nafsulAnggota.loading") : t("common.search")}
          </Button>
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t(error)}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <TabelAnggota
          rows={data?.data ?? []}
          loading={loading}
          onDelete={(a) => setDeleteTarget(a)}
          pesanKosong={
            data === null
              ? t("nafsulAnggota.retryHint", { search: t("common.search") })
              : t("nafsulAnggota.emptyFilter")
          }
        />

        {data && (
          <Pagination
            currentPage={data.current_page}
            totalPages={data.last_page}
            totalItems={data.total}
            itemsPerPage={PER_PAGE}
            onPageChange={(halaman) => muat(terapkan, halaman)}
          />
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={
          deleteTarget
            ? t("nafsulAnggota.confirmDelete", { name: deleteTarget.nama })
            : undefined
        }
      />

      <ResultDialog
        open={result !== null}
        onClose={() => setResult(null)}
        variant={result?.variant ?? "success"}
        description={result?.description}
      />
    </div>
  );
}

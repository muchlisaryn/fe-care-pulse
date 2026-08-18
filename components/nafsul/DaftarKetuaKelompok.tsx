"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/nafsul/api";
import { jenisKelamin } from "@/lib/nafsul/format";
import type { KetuaKelompok, Paginated } from "@/lib/nafsul/types";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { Pagination } from "@/components/molecules/Pagination";
import AnggotaKelompokModal from "@/components/nafsul/AnggotaKelompokModal";

const PER_PAGE = 15;

/** Satu permintaan halaman ketua — tanpa menyentuh state. */
const ambil = (halaman: number) =>
  api<Paginated<KetuaKelompok>>("/ketua-kelompok", {
    params: { tanpa_pribadi: 1, page: halaman, per_page: PER_PAGE },
  });

const pesanGagal = (err: unknown) =>
  err instanceof ApiError ? err.message : "Gagal memuat data ketua kelompok.";

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

  // Muat halaman pertama.
  useEffect(() => {
    let aktif = true;

    ambil(1)
      .then((res) => aktif && setData(res))
      .catch((err) => aktif && setError(pesanGagal(err)))
      .finally(() => aktif && setLoading(false));

    return () => {
      aktif = false;
    };
  }, []);

  async function muat(halaman: number) {
    setLoading(true);
    setError(null);

    try {
      setData(await ambil(halaman));
    } catch (err) {
      setError(pesanGagal(err));
    } finally {
      setLoading(false);
    }
  }

  const columns: Column<KetuaKelompok>[] = [
    { header: "No. Ketua Kelompok", className: "font-mono text-xs", cell: (k) => k.noketua },
    { header: "Nama", className: "font-medium", cell: (k) => k.nama },
    { header: "Jenis Kelamin", cell: (k) => jenisKelamin(k.jenis_kelamin) },
    {
      header: "Telepon",
      cell: (k) => k.telepon ?? <span className="text-gray-400 text-xs">—</span>,
    },
    {
      header: "Total Anggota",
      className: "text-right tabular-nums",
      cell: (k) => (k.anggota_count ?? 0).toLocaleString("id-ID"),
    },
  ];

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            hideRowNumber
            emptyMessage={data === null ? "Data gagal dimuat." : "Belum ada kelompok."}
            extraActions={[{ label: "Lihat Anggota", onClick: (k) => setDilihat(k) }]}
          />
        )}

        {data && (
          <Pagination
            currentPage={data.current_page}
            totalPages={data.last_page}
            totalItems={data.total}
            itemsPerPage={PER_PAGE}
            onPageChange={muat}
          />
        )}
      </div>

      <AnggotaKelompokModal ketua={dilihat} onClose={() => setDilihat(null)} />
    </div>
  );
}

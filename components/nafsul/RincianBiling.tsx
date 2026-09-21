"use client";

import { Pencil, Trash2 } from "lucide-react";
import { RowActionsMenu } from "@/components/molecules/RowActionsMenu";
import { useT } from "@/lib/i18n";
import type { BarisBiling } from "@/lib/store/slices/nafsulTransaksiSlice";

type RincianBilingProps = {
  /** `null` selagi dimuat, atau saat baris ini bukan baris yang sedang terbuka. */
  baris: BarisBiling[] | null;
  loading: boolean;
  error: string | null;
  /**
   * Aksi per ANGGOTA. Kolom Aksi baru muncul bila keduanya diisi — di tempat
   * yang hanya menampilkan rincian (mis. pratinjau) kolomnya tidak ada sama
   * sekali, bukan ada tapi kosong.
   */
  onEdit?: (baris: BarisBiling) => void;
  onDelete?: (baris: BarisBiling) => void;
  /**
   * Kuitansi yang sudah divalidasi TIDAK menampilkan tombol apa pun — isinya
   * tidak boleh bergeser setelah diperiksa, dan server menolaknya juga. Alasan
   * hilangnya tombol dijelaskan lewat satu baris keterangan di bawah tabel,
   * supaya tidak terbaca seperti fitur yang rusak.
   */
  tervalidasi?: boolean;
  /** Anggota yang rinciannya sedang dibuang — barisnya dikunci selama itu. */
  memberSedangDihapus?: number | null;
};

/**
 * Isi baris lipatan daftar transaksi: rincian kuitansi dalam susunan LEMBAR
 * BILING — satu baris per anggota, periode sudah dipadatkan jadi rentang.
 *
 * Susunan kolomnya sengaja dibuat sama persis dengan lembar biling yang
 * tercetak (No. Anggota · Nama · Periode · Kunjungan · Jumlah · Potongan),
 * supaya layar dan kertas bisa dibandingkan baris per baris. Semua angkanya
 * datang sudah jadi dari server; tidak ada yang dihitung di sini.
 */
export default function RincianBiling({
  baris,
  loading,
  error,
  onEdit,
  onDelete,
  tervalidasi = false,
  memberSedangDihapus = null,
}: RincianBilingProps) {
  const t = useT();
  const adaAksi = !!(onEdit && onDelete);
  const tampilkanAksi = adaAksi && !tervalidasi;

  if (loading) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        {t("nafsulTransaksi.detailLoading")}
      </p>
    );
  }

  if (error) {
    return <p className="py-4 text-center text-sm text-red-600">{error}</p>;
  }

  if (!baris || baris.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        {t("nafsulTransaksi.detailEmpty")}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        {/* `min-w`: tujuh kolom yang dimampatkan ke lebar ponsel membuat nama
            anggota pecah per huruf. Lebih baik digulir. */}
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulTransaksi.detailMemberNo")}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulTransaksi.detailMemberName")}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulTransaksi.detailPeriod")}
              </th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulTransaksi.detailVisit")}
              </th>
              {/* Rupiah rata KANAN — kolom angka yang rata kiri tidak bisa
                  dibandingkan sekilas antar-barisnya. */}
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulTransaksi.detailAmount")}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("nafsulTransaksi.detailDeduction")}
              </th>
              {tampilkanAksi && (
                <th className="w-24 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {t("nafsulTransaksi.detailActions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {baris.map((b, i) => (
              <tr key={i} className={memberSedangDihapus === b.member_id ? "opacity-60" : undefined}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">
                  {b.no_anggota ?? (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-800">{b.nama}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">
                  {b.periode}
                </td>
                <td className="px-3 py-2 text-center">
                  {/* Hurufnya ("B"/"L") ditampilkan sama seperti di lembar
                      tercetak; artinya dijelaskan lewat `title`, bukan ditulis
                      panjang di kolomnya yang cuma selebar satu huruf. */}
                  <span
                    title={
                      b.kunjungan === "B"
                        ? t("nafsulTransaksi.visitNew")
                        : t("nafsulTransaksi.visitOld")
                    }
                    className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${
                      b.kunjungan === "B"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {b.kunjungan}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                  {b.jumlah}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-600">
                  {b.potongan}
                </td>
                {tampilkanAksi && (
                  <td className="whitespace-nowrap px-3 py-2">
                    {/* Dilipat jadi satu tombol titik-tiga, sama seperti kolom
                        Aksi tabel induknya. Deretan tombol per baris membuat
                        kolomnya lebih lebar daripada datanya, dan baris lipatan
                        ini sudah berbagi lebar dengan tabel di atasnya.

                        Menunya dirender lewat portal, jadi panelnya tidak
                        terpotong tepi baris lipatan yang ber-`overflow`. */}
                    <div className="flex justify-center">
                      <RowActionsMenu
                        disabled={memberSedangDihapus === b.member_id}
                        items={[
                          {
                            label: t("nafsulTransaksi.detailEditMember", {
                              member: b.nama,
                            }),
                            icon: <Pencil className="h-3.5 w-3.5" />,
                            onClick: () => onEdit!(b),
                          },
                          {
                            label: t("nafsulTransaksi.detailDeleteMember", {
                              member: b.nama,
                            }),
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            tone: "danger",
                            onClick: () => onDelete!(b),
                          },
                        ]}
                      />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tombolnya hilang karena kuitansinya terkunci, bukan karena tidak ada.
          Tanpa kalimat ini petugas mengira baris lipatan kuitansi tervalidasi
          kehilangan fiturnya. */}
      {adaAksi && tervalidasi && (
        <p className="border-t border-gray-100 bg-gray-50/70 px-3 py-2 text-[11px] text-gray-500">
          {t("nafsulTransaksi.detailValidatedHint")}
        </p>
      )}
    </div>
  );
}

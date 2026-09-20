"use client";

import { useT } from "@/lib/i18n";
import type { BarisBiling } from "@/lib/store/slices/nafsulTransaksiSlice";

type RincianBilingProps = {
  /** `null` selagi dimuat, atau saat baris ini bukan baris yang sedang terbuka. */
  baris: BarisBiling[] | null;
  loading: boolean;
  error: string | null;
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
}: RincianBilingProps) {
  const t = useT();

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
        <table className="w-full text-sm">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {baris.map((b, i) => (
              <tr key={i}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

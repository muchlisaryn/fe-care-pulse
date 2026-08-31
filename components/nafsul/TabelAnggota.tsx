"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { formatDate, kunciJenisKelamin } from "@/lib/nafsul/format";
import { localeOf, useLanguage } from "@/lib/i18n";
import type { Anggota } from "@/lib/nafsul/types";
import { cetakKartuAnggota } from "@/lib/nafsul/kartuAnggota";
import { Badge } from "@/components/atoms/Badge";
import { DataTable, type Column, type ExtraAction } from "@/components/molecules/DataTable";
import RiwayatIuranModal from "@/components/nafsul/RiwayatIuranModal";

/** Sel kosong seragam dengan tabel lain di aplikasi. */
function Kosong() {
  return <span className="text-gray-400 text-xs">—</span>;
}

/**
 * Nama ketua penampung anggota perorangan. Dicocokkan **persis** — master
 * ketua juga memuat nama orang yang kebetulan mengandung kata ini
 * (mis. "Filosa Idham Pribadi"), yang jelas bukan penampung perorangan.
 */
const KETUA_PRIBADI = "pribadi";

/** Pribadi = tanpa ketua, atau ketuanya bernama tepat "Pribadi". */
export function tipeAnggota(a: Anggota): "Pribadi" | "Kelompok" {
  const ketua = a.ketua?.nama?.trim().toLowerCase();
  return !ketua || ketua === KETUA_PRIBADI ? "Pribadi" : "Kelompok";
}

/**
 * Tabel anggota — kolomnya sama di mana pun dipakai: halaman daftar anggota
 * maupun modal anggota per kelompok. Dijadikan satu komponen supaya kolomnya
 * tidak perlu diselaraskan manual tiap kali berubah.
 *
 * Tombol Hapus hanya muncul bila `onDelete` diisi; di dalam modal tindakan
 * merusak sengaja tidak disediakan.
 */
export default function TabelAnggota({
  rows,
  loading,
  pesanKosong,
  onDelete,
  tampilkanTipe = true,
  tampilkanAksi = true,
  tampilkanRiwayat = true,
}: {
  rows: Anggota[];
  loading: boolean;
  pesanKosong?: ReactNode;
  onDelete?: (a: Anggota) => void;
  /** Kolom Tipe dimatikan bila seluruh baris sudah pasti setipe. */
  tampilkanTipe?: boolean;
  /** Kolom Aksi dimatikan pada tampilan yang hanya untuk dilihat. */
  tampilkanAksi?: boolean;
  /**
   * Kolom "Periode Terakhir Bayar" beserta modal riwayatnya.
   *
   * Dimatikan saat tabel ini sendiri sudah berada DI DALAM modal (anggota per
   * kelompok): modal di atas modal menumpuk lapisan gelap dan menyisakan dua
   * tombol tutup yang tidak jelas mana miliknya.
   */
  tampilkanRiwayat?: boolean;
}) {
  const router = useRouter();
  const { t, lang } = useLanguage();

  // Anggota yang riwayatnya sedang dibuka. Namanya ikut disimpan supaya judul
  // modal tidak berkedip kosong sementara datanya masih dimuat.
  const [riwayat, setRiwayat] = useState<{ id: number; nama: string } | null>(null);

  const columns: Column<Anggota>[] = [
    {
      header: t("nafsulAnggota.colMemberNo"),
      className: "font-mono text-xs",
      cell: (a) => a.no_anggota ?? <Kosong />,
    },
    {
      header: t("nafsulAnggota.colName"),
      cell: (a) => (
        <Link
          href={`/nafsul/master/anggota/${a.id}/edit`}
          className="font-medium text-emerald-700 hover:underline"
        >
          {a.nama}
        </Link>
      ),
    },
    {
      header: t("nafsulAnggota.colGender"),
      cell: (a) => {
        const kunci = kunciJenisKelamin(a.jenis_kelamin);
        return kunci ? t(kunci) : <Kosong />;
      },
    },
    { header: t("nafsulAnggota.colRegion"), cell: (a) => a.wilayah?.nama ?? <Kosong /> },
    ...(tampilkanTipe
      ? [
          {
            header: t("nafsulAnggota.colType"),
            cell: (a: Anggota) => (
              <Badge variant={tipeAnggota(a) === "Kelompok" ? "info" : "default"}>
                {t(tipeAnggota(a) === "Kelompok" ? "nafsulCommon.group" : "nafsulCommon.personal")}
              </Badge>
            ),
          },
        ]
      : []),
    {
      header: t("nafsulAnggota.colVisit"),
      className: "whitespace-nowrap",
      cell: (a: Anggota) => {
        // TURUNAN dari periode terakhir bayar, BUKAN dari kolom `kunjungan`
        // (DB: `members.visit`) yang kebetulan bernama sama. Kolom itu null di
        // seluruh baris dan tidak pernah diisi apa pun; membacanya akan membuat
        // semua anggota tampil kosong.
        //
        // Tiga keadaan, bukan dua. `undefined` berarti kolom periodenya memang
        // tidak dikirim (pemanggil `all=1`) — menampilkannya sebagai "B" akan
        // menyatakan seluruh anggota berstatus baru, padahal yang sebenarnya
        // terjadi adalah datanya tidak ditanyakan.
        if (a.periode_terakhir_bayar === undefined) return <Kosong />;

        const baru = a.periode_terakhir_bayar === null;

        const arti = t(
          baru ? "nafsulAnggota.visitNew" : "nafsulAnggota.visitOld"
        );

        // `title` dipasang di pembungkusnya, bukan di Badge: Badge sengaja hanya
        // menerima children/variant/className, dan menambah atribut lewat sana
        // berarti mengubah atom yang dipakai seluruh aplikasi demi satu kolom.
        return (
          <span title={arti}>
            <Badge variant={baru ? "info" : "default"} className="font-mono font-semibold">
              {baru ? "B" : "L"}
            </Badge>
          </span>
        );
      },
    },
    ...(tampilkanRiwayat
      ? [
          {
            header: t("nafsulAnggota.colLastPeriod"),
            className: "whitespace-nowrap",
            cell: (a: Anggota) =>
              a.periode_terakhir_bayar ? (
                // Tombol, bukan tautan: yang dibuka modal di halaman yang sama,
                // dan hasil pencarian di belakangnya tidak boleh ikut hilang.
                <button
                  type="button"
                  onClick={() => setRiwayat({ id: a.id, nama: a.nama })}
                  className="rounded font-mono text-xs font-medium text-[#075489] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075489]/40"
                >
                  {a.periode_terakhir_bayar}
                </button>
              ) : (
                // Belum pernah membayar: riwayatnya kosong, jadi tidak ada yang
                // perlu dibuka — teksnya dibiarkan mati, bukan tombol yang
                // membuka modal berisi tabel kosong.
                <span className="text-gray-400 text-xs">
                  {t("nafsulAnggota.neverPaid")}
                </span>
              ),
          },
        ]
      : []),
    { header: t("nafsulAnggota.colCreatedBy"), cell: (a) => a.created_by ?? <Kosong /> },
    {
      header: t("nafsulAnggota.colCreatedAt"),
      className: "whitespace-nowrap",
      cell: (a) => formatDate(a.created_at, localeOf(lang)),
    },
  ];

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">{t("nafsulMaster.loading")}</div>
    );
  }

  // Cetak kartu peserta — muncul di KIRI tombol Ubah (extraActions dirender lebih
  // dulu). Hanya pada tampilan aksi penuh, bukan di modal anggota per kelompok.
  const aksiCetak: ExtraAction<Anggota>[] = [
    {
      label: t("nafsulAnggota.printCard"),
      onClick: (a) => cetakKartuAnggota(a),
      icon: () => <Printer className="h-3.5 w-3.5" />,
      className: "gap-1 text-[#075489]",
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        hideRowNumber
        autoWidth
        actionsAlign="center"
        emptyMessage={pesanKosong ?? t("nafsulAnggota.empty")}
        extraActions={tampilkanAksi ? aksiCetak : undefined}
        onEdit={
          tampilkanAksi ? (a) => router.push(`/nafsul/master/anggota/${a.id}/edit`) : undefined
        }
        onDelete={tampilkanAksi && onDelete ? onDelete : undefined}
      />

      <RiwayatIuranModal
        anggotaId={riwayat?.id ?? null}
        nama={riwayat?.nama ?? ""}
        onClose={() => setRiwayat(null)}
      />
    </>
  );
}

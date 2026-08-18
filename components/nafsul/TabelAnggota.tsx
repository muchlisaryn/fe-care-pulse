"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { formatDate, kunciJenisKelamin } from "@/lib/nafsul/format";
import { localeOf, useLanguage } from "@/lib/i18n";
import type { Anggota } from "@/lib/nafsul/types";
import { Badge } from "@/components/atoms/Badge";
import { DataTable, type Column } from "@/components/molecules/DataTable";

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
}: {
  rows: Anggota[];
  loading: boolean;
  pesanKosong?: ReactNode;
  onDelete?: (a: Anggota) => void;
  /** Kolom Tipe dimatikan bila seluruh baris sudah pasti setipe. */
  tampilkanTipe?: boolean;
  /** Kolom Aksi dimatikan pada tampilan yang hanya untuk dilihat. */
  tampilkanAksi?: boolean;
}) {
  const router = useRouter();
  const { t, lang } = useLanguage();

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

  return (
    <DataTable
      columns={columns}
      data={rows}
      hideRowNumber
      emptyMessage={pesanKosong ?? t("nafsulAnggota.empty")}
      onEdit={
        tampilkanAksi ? (a) => router.push(`/nafsul/master/anggota/${a.id}/edit`) : undefined
      }
      onDelete={tampilkanAksi && onDelete ? onDelete : undefined}
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Users } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import { Button } from "@/components/atoms/Button";
import { PageHeader } from "@/components/molecules/PageHeader";
import { StatCard } from "@/components/molecules/StatCard";
import DaftarAnggota, { type TipeAnggota } from "@/components/nafsul/DaftarAnggota";
import { localeOf, useLanguage } from "@/lib/i18n";

/** Jumlah anggota per tipe — dihitung server dengan COUNT, bukan dari isi daftar. */
interface Statistik {
  pribadi: number;
  kelompok: number;
  total: number;
}

/** `judul` menyimpan KUNCI kamus, bukan kalimat jadi — ikut berganti saat bahasa diubah. */
const KARTU: { tipe: TipeAnggota; judul: string; ikon: typeof User }[] = [
  { tipe: "pribadi", judul: "nafsulAnggota.statPersonal", ikon: User },
  { tipe: "kelompok", judul: "nafsulAnggota.statGroup", ikon: Users },
];

export default function AnggotaListPage() {
  const { t, lang } = useLanguage();
  const [statistik, setStatistik] = useState<Statistik | null>(null);
  const [errorStatistik, setErrorStatistik] = useState<string | null>(null);

  useEffect(() => {
    let aktif = true;

    api<Statistik>("/anggota/statistik")
      .then((s) => aktif && setStatistik(s))
      .catch(
        (err) =>
          aktif &&
          setErrorStatistik(
            err instanceof ApiError ? err.message : "nafsulAnggota.statFailed"
          )
      );

    return () => {
      aktif = false;
    };
  }, []);

  return (
    <div>
      <PageHeader
        className="mb-5"
        title={t("nafsulAnggota.title")}
        subtitle={t("nafsulAnggota.subtitle")}
        action={
          <Button asChild className="bg-[#075489] hover:bg-[#075489]/90 text-white">
            <Link href="/nafsul/master/anggota/baru">{t("nafsulAnggota.addMember")}</Link>
          </Button>
        }
      />

      {/* Angka kartu berasal dari COUNT di server; kliknya membuka halaman
          tersendiri per tipe, bukan menyaring tabel di bawahnya. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {KARTU.map(({ tipe, judul, ikon }) => (
          <Link
            key={tipe}
            href={`/nafsul/master/anggota/tipe/${tipe}`}
            className="rounded-xl transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075489]/40"
          >
            <StatCard
              title={t(judul)}
              value={statistik ? statistik[tipe].toLocaleString(localeOf(lang)) : "…"}
              change={t("nafsulAnggota.clickDetail")}
              icon={ikon}
            />
          </Link>
        ))}
      </div>

      {errorStatistik && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t(errorStatistik)}
        </div>
      )}

      <DaftarAnggota />
    </div>
  );
}

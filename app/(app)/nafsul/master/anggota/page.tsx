"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Users } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import { Button } from "@/components/atoms/Button";
import { PageHeader } from "@/components/molecules/PageHeader";
import { StatCard } from "@/components/molecules/StatCard";
import DaftarAnggota, { type TipeAnggota } from "@/components/nafsul/DaftarAnggota";

/** Jumlah anggota per tipe — dihitung server dengan COUNT, bukan dari isi daftar. */
interface Statistik {
  pribadi: number;
  kelompok: number;
  total: number;
}

const KARTU: { tipe: TipeAnggota; judul: string; ikon: typeof User }[] = [
  { tipe: "pribadi", judul: "Total Anggota Pribadi", ikon: User },
  { tipe: "kelompok", judul: "Total Anggota Kelompok", ikon: Users },
];

export default function AnggotaListPage() {
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
            err instanceof ApiError ? err.message : "Jumlah anggota gagal dimuat."
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
        title="Anggota"
        subtitle="Kelola data anggota & pendaftaran anggota baru"
        action={
          <Button asChild>
            <Link href="/nafsul/master/anggota/baru">+ Tambah Anggota</Link>
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
              title={judul}
              value={statistik ? statistik[tipe].toLocaleString("id-ID") : "…"}
              change="Klik untuk lihat detail"
              icon={ikon}
            />
          </Link>
        ))}
      </div>

      {errorStatistik && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorStatistik}
        </div>
      )}

      <DaftarAnggota />
    </div>
  );
}

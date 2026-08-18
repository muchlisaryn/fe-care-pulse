"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/molecules/PageHeader";
import DaftarAnggota, { type TipeAnggota } from "@/components/nafsul/DaftarAnggota";
import DaftarKetuaKelompok from "@/components/nafsul/DaftarKetuaKelompok";
import { useT } from "@/lib/i18n";

/** Berisi KUNCI kamus, bukan kalimat jadi — ikut berganti saat bahasa diubah. */
const JUDUL: Record<TipeAnggota, { title: string; subtitle: string }> = {
  pribadi: {
    title: "nafsulAnggota.personalTitle",
    subtitle: "nafsulAnggota.personalSubtitle",
  },
  kelompok: {
    title: "nafsulAnggota.groupTitle",
    subtitle: "nafsulAnggota.groupSubtitle",
  },
};

/**
 * Halaman per tipe, dibuka dari kartu ringkasan di halaman Anggota.
 *
 * Keduanya menampilkan hal yang berbeda: tipe "pribadi" langsung berisi daftar
 * anggotanya, sedangkan "kelompok" berisi daftar kelompoknya lebih dulu —
 * anggotanya dibuka per kelompok.
 */
export default function AnggotaTipePage({
  params,
}: {
  params: Promise<{ tipe: string }>;
}) {
  const t = useT();
  const { tipe } = use(params);

  if (tipe !== "pribadi" && tipe !== "kelompok") {
    notFound();
  }

  const { title, subtitle } = JUDUL[tipe];

  return (
    <div>
      <Link
        href="/nafsul/master/anggota"
        className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-emerald-700"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("nafsulCommon.allMembers")}
      </Link>

      <PageHeader className="mb-5" title={t(title)} subtitle={t(subtitle)} />

      {tipe === "kelompok" ? <DaftarKetuaKelompok /> : <DaftarAnggota tipeTetap={tipe} />}
    </div>
  );
}

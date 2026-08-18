"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { api } from "@/lib/nafsul/api";
import type { Anggota } from "@/lib/nafsul/types";
import AnggotaForm from "@/components/nafsul/AnggotaForm";
import { PageHeader } from "@/components/molecules/PageHeader";


export default function AnggotaEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [anggota, setAnggota] = useState<Anggota | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Anggota>(`/anggota/${id}`)
      .then(setAnggota)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-slate-400 text-sm">Memuat...</div>;
  if (!anggota) return <div className="text-slate-400 text-sm">Data tidak ditemukan.</div>;

  return (
    <div>
      <Link
        href="/nafsul/master/anggota"
        className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-emerald-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Data Anggota
      </Link>

      {/* Nama tidak diulang di subjudul — sudah tampil di isian "Nama Lengkap". */}
      <PageHeader className="mb-5" title="Edit Anggota" />
      <AnggotaForm anggota={anggota} />
    </div>
  );
}

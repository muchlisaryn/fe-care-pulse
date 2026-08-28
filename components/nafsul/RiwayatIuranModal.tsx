"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import { Badge } from "@/components/atoms/Badge";
import { Modal } from "@/components/molecules/Modal";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { useT } from "@/lib/i18n";

/** Satu baris iuran anggota. `no_kuitansi` null = tercatat tapi belum dibayar. */
interface BarisRiwayat {
  id: number;
  uuid: string;
  periode: string | null;
  tarif: string | null;
  kode_tarif: string | null;
  nominal: string;
  diskon: string;
  total: string;
  no_kuitansi: string | null;
  tanggal: string | null;
  metode: string | null;
  divalidasi: boolean;
}

interface Riwayat {
  anggota: { id: number; no_anggota: string | null; nama: string };
  ringkasan: {
    jumlah_baris: number;
    total_dibayar: string;
    periode_terakhir: string | null;
  };
  riwayat: BarisRiwayat[];
}

/** Angka desimal dari API ("7000.00") → "Rp 7.000". */
function rupiah(nilai: string | number): string {
  const angka = Number(nilai);
  if (!Number.isFinite(angka)) return "—";
  return `Rp ${angka.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

function Kosong() {
  return <span className="text-gray-400 text-xs">—</span>;
}

/**
 * Riwayat iuran seorang anggota.
 *
 * Dibuka dari kolom "Periode Terakhir Bayar" di master anggota: angka di kolom
 * itu hanya menjawab "sampai kapan", dan pertanyaan berikutnya selalu "lalu apa
 * saja" — modal ini yang menjawabnya tanpa memindahkan pengguna ke halaman lain
 * dan kehilangan hasil pencariannya.
 *
 * Datanya ditarik saat modal DIBUKA, bukan ikut dimuat bersama daftar
 * anggotanya. Seorang anggota bisa punya ratusan baris iuran (yang terbanyak di
 * data ini 187), dan menyertakannya untuk 15 anggota sekaligus berarti ribuan
 * baris yang hampir seluruhnya tidak pernah dilihat.
 */
export default function RiwayatIuranModal({
  anggotaId,
  nama,
  onClose,
}: {
  /** Null = modal tertutup. Berubah nilainya → riwayatnya dimuat ulang. */
  anggotaId: number | null;
  nama: string;
  onClose: () => void;
}) {
  const t = useT();
  const [data, setData] = useState<Riwayat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (anggotaId === null) return;

    // Penanda supaya balasan permintaan LAMA tidak menimpa yang baru bila
    // pengguna cepat membuka anggota lain sebelum yang pertama selesai.
    let aktif = true;

    setLoading(true);
    setError(null);
    setData(null);

    api<Riwayat>(`/anggota/${anggotaId}/riwayat-transaksi`)
      .then((r) => aktif && setData(r))
      .catch((e) => {
        if (!aktif) return;
        setError(e instanceof ApiError ? e.message : t("nafsulAnggota.historyFailed"));
      })
      .finally(() => {
        if (aktif) setLoading(false);
      });

    return () => {
      aktif = false;
    };
  }, [anggotaId, t]);

  const columns: Column<BarisRiwayat>[] = [
    {
      header: t("nafsulAnggota.histPeriod"),
      className: "whitespace-nowrap font-mono text-xs",
      // Tarif sekali bayar tidak berperiode — dikatakan, bukan dikosongkan,
      // supaya tidak terbaca sebagai data yang hilang.
      cell: (b) =>
        b.periode ?? (
          <span className="text-gray-400 text-xs">{t("nafsulAnggota.histOneTime")}</span>
        ),
    },
    {
      header: t("nafsulAnggota.histRate"),
      cell: (b) => b.tarif ?? <Kosong />,
    },
    {
      header: t("nafsulAnggota.histAmount"),
      className: "whitespace-nowrap text-right tabular-nums",
      cell: (b) => rupiah(b.total),
    },
    {
      header: t("nafsulAnggota.histReceipt"),
      className: "whitespace-nowrap",
      cell: (b) =>
        b.no_kuitansi ? (
          <span className="font-mono text-xs">{b.no_kuitansi}</span>
        ) : (
          <Badge variant="warning">{t("nafsulAnggota.histUnpaid")}</Badge>
        ),
    },
    {
      header: t("nafsulAnggota.histStatus"),
      cell: (b) =>
        !b.no_kuitansi ? (
          <Kosong />
        ) : b.divalidasi ? (
          <Badge variant="success">{t("nafsulAnggota.histValidated")}</Badge>
        ) : (
          <Badge variant="default">{t("nafsulAnggota.histUnvalidated")}</Badge>
        ),
    },
  ];

  return (
    <Modal
      open={anggotaId !== null}
      onClose={onClose}
      title={t("nafsulAnggota.historyTitle", { name: nama })}
      size="lg"
      panelClassName="max-w-3xl"
    >
      {loading ? (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("nafsulMaster.loading")}
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-red-600">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Ringkas
              label={t("nafsulAnggota.histLastPeriod")}
              nilai={data.ringkasan.periode_terakhir ?? "—"}
            />
            <Ringkas
              label={t("nafsulAnggota.histRowCount")}
              nilai={String(data.ringkasan.jumlah_baris)}
            />
            <Ringkas
              label={t("nafsulAnggota.histTotalPaid")}
              nilai={rupiah(data.ringkasan.total_dibayar)}
            />
          </div>

          {/*
            Daftarnya bisa ratusan baris, jadi dibatasi tingginya dan digulung di
            dalam modal — kalau tidak, modalnya sendiri yang memanjang melewati
            layar dan tombol tutupnya ikut terdorong hilang.
          */}
          <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200">
            <DataTable
              columns={columns}
              data={data.riwayat}
              hideRowNumber
              emptyMessage={t("nafsulAnggota.histEmpty")}
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function Ringkas({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{nilai}</div>
    </div>
  );
}

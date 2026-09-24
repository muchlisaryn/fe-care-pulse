"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/molecules/Modal";
import { Button } from "@/components/atoms/Button";
import type { Anggota } from "@/lib/nafsul/types";
import { buatPdfKartuAnggota, type SisiKartu } from "@/lib/nafsul/kartuAnggota";
import { useT } from "@/lib/i18n";

/**
 * Pratinjau PDF kartu peserta sebelum dicetak.
 *
 * Satu pintu untuk kedua sisi: alur cetaknya depan dulu, balik kertas, lalu
 * belakang — sisinya dipindah lewat tab di dalam modal, tanpa menutupnya.
 *
 * Dipasang pemanggil HANYA selama terbuka, jadi tiap pembukaan mulai bersih
 * dari sisi depan.
 */
export default function PratinjauKartuModal({
  anggota,
  onClose,
}: {
  anggota: Anggota;
  onClose: () => void;
}) {
  const t = useT();
  const [sisi, setSisi] = useState<SisiKartu>("depan");
  // PDF terakhir yang selesai dibuat, beserta sisinya. Selama sisinya belum
  // sama dengan tab aktif, pratinjaunya dianggap sedang disiapkan.
  const [hasil, setHasil] = useState<{ sisi: SisiKartu; url: string | null } | null>(null);

  useEffect(() => {
    let aktif = true;
    let dibuat: string | null = null;

    buatPdfKartuAnggota(anggota, sisi)
      .then((blob) => {
        dibuat = URL.createObjectURL(blob);
        if (aktif) setHasil({ sisi, url: dibuat });
        else URL.revokeObjectURL(dibuat);
      })
      .catch(() => aktif && setHasil({ sisi, url: null }));

    return () => {
      aktif = false;
      if (dibuat) URL.revokeObjectURL(dibuat);
    };
  }, [anggota, sisi]);

  const loading = hasil?.sisi !== sisi;
  const url = loading ? null : hasil.url;
  const gagal = !loading && url === null;

  const namaBerkas = `kartu-${(anggota.no_anggota ?? anggota.nama ?? "anggota").replace(/[^\w-]+/g, "_")}-${sisi}.pdf`;

  const tab = (s: SisiKartu, label: string) => (
    <Button
      key={s}
      type="button"
      size="sm"
      variant={sisi === s ? "default" : "outline"}
      onClick={() => setSisi(s)}
      className={sisi === s ? "bg-[#075489] hover:bg-[#075489]/90 text-white" : ""}
    >
      {label}
    </Button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      // Tanpa judul & tombol: unduh dan cetak memakai bilah alat penampil PDF
      // peramban; tutup lewat Escape atau klik di luar modal.
      title=""
      hideHeader
      size="xl"
    >
      <div className="mb-3 flex gap-2">
        {tab("depan", t("nafsulAnggota.cardFront"))}
        {tab("belakang", t("nafsulAnggota.cardBack"))}
      </div>

      <div className="h-[75vh] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {t("nafsulAnggota.cardPreparing")}
          </div>
        ) : gagal ? (
          <div className="py-16 text-center text-sm text-rose-600">
            {t("nafsulAnggota.cardFailed")}
          </div>
        ) : (
          <iframe src={url ?? undefined} title={namaBerkas} className="h-full w-full" />
        )}
      </div>
    </Modal>
  );
}

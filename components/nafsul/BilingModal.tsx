"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/atoms/Button";
import { Modal } from "@/components/molecules/Modal";
import { apiBlob, ApiError } from "@/lib/nafsul/api";
import { useT } from "@/lib/i18n";

/**
 * Pratinjau lembar biling sebuah kuitansi, beserta tombol unduhnya.
 *
 * PDF-nya diambil sebagai BLOB, bukan dipasang langsung sebagai `src` iframe:
 * endpoint-nya butuh token Bearer, dan iframe tidak bisa mengirimkan header.
 *
 * Object URL-nya wajib dibebaskan saat modal ditutup maupun saat komponennya
 * dilepas — kalau tidak, blob PDF-nya menetap di memori tab sampai halamannya
 * ditinggalkan. Karena itu seluruh daur hidupnya dipegang komponen ini, bukan
 * dititipkan ke tiap halaman yang memakainya.
 */
export default function BilingModal({
  uuid,
  nomor,
  onClose,
}: {
  /** Kuitansi yang dicetak; `null` = modal tertutup dan tidak memuat apa pun. */
  uuid: string | null;
  /** Nomor kuitansi, untuk judul modal & nama berkas unduhan. */
  nomor: string;
  onClose: () => void;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;

    let aktif = true;
    let dibuat: string | null = null;

    setLoading(true);
    setGalat(null);

    apiBlob(`/transaksi/header/${uuid}/biling`)
      .then(({ blob }) => {
        if (!aktif) return;
        dibuat = URL.createObjectURL(blob);
        setUrl(dibuat);
      })
      .catch((e) => {
        if (aktif) {
          setGalat((e as ApiError).message ?? t("nafsulTransaksi.billingFailed"));
        }
      })
      .finally(() => {
        if (aktif) setLoading(false);
      });

    return () => {
      aktif = false;
      // Dibebaskan lewat variabel lokal, bukan dari state: saat pembersihan
      // berjalan, state-nya bisa saja belum sempat terpasang.
      if (dibuat) URL.revokeObjectURL(dibuat);
      setUrl(null);
    };
  }, [uuid, t]);

  function unduh() {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `biling-${nomor}.pdf`;
    a.click();
  }

  return (
    <Modal
      open={uuid !== null}
      onClose={onClose}
      title={nomor ? t("nafsulTransaksi.billingTitle", { number: nomor }) : ""}
      size="lg"
      panelClassName="max-w-4xl"
      footer={
        <>
          {/* `type="button"` pada keduanya: modal ini bisa dipasang di dalam
              sebuah <form>, dan tombol tanpa `type` bertipe submit. */}
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
            onClick={unduh}
            disabled={!url}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            <Download className="h-4 w-4" /> {t("nafsulTransaksi.billingDownload")}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("nafsulTransaksi.billingLoading")}
        </div>
      ) : galat ? (
        <div className="flex h-[70vh] items-center justify-center px-6 text-center text-sm text-red-600">
          {galat}
        </div>
      ) : url ? (
        <iframe
          src={url}
          title={t("nafsulTransaksi.billingPreview")}
          className="h-[70vh] w-full rounded-lg border"
        />
      ) : null}
    </Modal>
  );
}

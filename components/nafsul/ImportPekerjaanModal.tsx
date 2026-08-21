"use client";

import { useT } from "@/lib/i18n";
import ImportExcelModal, { type ImportColumn } from "@/components/nafsul/ImportExcelModal";

/**
 * Kolom template Excel → field API pekerjaan.
 *
 * Master ini hanya punya nama; `id`-nya dibuat database, jadi tidak ada kolom
 * kunci yang perlu diisi di file.
 *
 * Nama dibandingkan tanpa membedakan huruf besar-kecil di server, jadi "Guru"
 * dan "GURU" terhitung sama dan yang kedua ditolak.
 */
const COLUMNS: ImportColumn[] = [
  { header: "Nama Pekerjaan", field: "nama", contoh: "Guru", wajib: true },
];

export default function ImportPekerjaanModal({
  open,
  onClose,
  onSelesai,
}: {
  open: boolean;
  onClose: () => void;
  /** Dipanggil setelah impor selesai dengan minimal satu baris berhasil. */
  onSelesai?: () => void;
}) {
  const t = useT();

  return (
    <ImportExcelModal
      open={open}
      onClose={onClose}
      onSelesai={onSelesai}
      judul={t("nafsulImport.titleOccupation")}
      slug="pekerjaan"
      sheetUtama="Pekerjaan"
      columns={COLUMNS}
      barisWajib={{ field: "nama", label: "Nama Pekerjaan" }}
    />
  );
}

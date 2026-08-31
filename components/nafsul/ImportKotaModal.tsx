"use client";

import { useT } from "@/lib/i18n";
import ImportExcelModal, { type ImportColumn } from "@/components/nafsul/ImportExcelModal";

/**
 * Kolom template Excel → field API kota.
 *
 * Berbeda dengan ketua kelompok yang kodenya bisa dibuat otomatis, `Kode`
 * WAJIB diisi: kode itulah yang dipakai form anggota (`kode_kota_lahir`) dan
 * biasanya mengikuti kode wilayah yang sudah baku. Kode yang sudah terpakai
 * ditolak — impor massal tidak menimpa data yang sudah ada.
 *
 * Kota tidak merujuk master lain, jadi file template hanya berisi satu sheet
 * tanpa sheet referensi.
 */
const COLUMNS: ImportColumn[] = [
  { header: "Kode", field: "kode", contoh: "KT01", wajib: true },
  { header: "Nama Kota", field: "nama", contoh: "Jakarta Timur", wajib: true },
];

export default function ImportKotaModal({
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
      judul={t("nafsulImport.titleCity")}
      slug="kota"
      sheetUtama="Kota"
      columns={COLUMNS}
    />
  );
}

"use client";

import { useT } from "@/lib/i18n";
import ImportExcelModal, { type ImportColumn } from "@/components/nafsul/ImportExcelModal";

/**
 * Kolom template Excel → field API wilayah.
 *
 * `Kode` wajib diisi: kode itulah yang dirujuk master kota dan form anggota
 * (`kode_wilayah`), dan biasanya sudah baku di data lama. Kode yang sudah
 * terpakai ditolak — impor massal tidak menimpa data yang sudah ada.
 *
 * Wilayah tidak merujuk master lain, jadi file template hanya berisi satu sheet
 * tanpa sheet referensi.
 */
const COLUMNS: ImportColumn[] = [
  { header: "Kode", field: "kode", contoh: "01", wajib: true },
  { header: "Nama Wilayah", field: "nama", contoh: "Jakarta Timur", wajib: true },
];

export default function ImportWilayahModal({
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
      judul={t("nafsulImport.titleRegion")}
      slug="wilayah"
      sheetUtama="Wilayah"
      columns={COLUMNS}
    />
  );
}

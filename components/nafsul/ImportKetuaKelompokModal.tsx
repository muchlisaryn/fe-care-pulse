"use client";

import ImportExcelModal, { type ImportColumn } from "@/components/nafsul/ImportExcelModal";

/**
 * Kolom template Excel → field API ketua kelompok.
 *
 * `No. Ketua` boleh dikosongkan: server membuatkan kodenya otomatis (`KKL` +
 * tahun + bulan + 3 digit urut, mis. `KKL2608001`), sama seperti penambahan
 * lewat form. Bila diisi tapi sudah dipakai, barisnya ditolak — impor massal
 * tidak menimpa data yang sudah ada.
 *
 * Ketua kelompok tidak merujuk master lain, jadi file template hanya berisi
 * satu sheet tanpa sheet referensi.
 */
const COLUMNS: ImportColumn[] = [
  { header: "No. Ketua", field: "noketua", contoh: "" },
  { header: "Nama", field: "nama", contoh: "Budi Santoso", wajib: true },
  { header: "Jenis Kelamin", field: "jenis_kelamin", contoh: "L" },
  { header: "Telepon", field: "telepon", contoh: "081234567890" },
  { header: "Alamat", field: "alamat", contoh: "Jl. Melati No. 10" },
];

export default function ImportKetuaKelompokModal({
  open,
  onClose,
  onSelesai,
}: {
  open: boolean;
  onClose: () => void;
  /** Dipanggil setelah impor selesai dengan minimal satu baris berhasil. */
  onSelesai?: () => void;
}) {
  return (
    <ImportExcelModal
      open={open}
      onClose={onClose}
      onSelesai={onSelesai}
      judul="Import Ketua Kelompok dari Excel"
      slug="ketua-kelompok"
      sheetUtama="Ketua Kelompok"
      columns={COLUMNS}
      barisWajib={{ field: "nama", label: "Nama" }}
    />
  );
}

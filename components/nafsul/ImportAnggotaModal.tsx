"use client";

import { useCallback } from "react";
import { api } from "@/lib/nafsul/api";
import type {
  KetuaKelompok,
  Kota,
  Pekerjaan,
  Pendidikan,
  StatusAnggota,
  Wilayah,
} from "@/lib/nafsul/types";
import { useT } from "@/lib/i18n";
import ImportExcelModal, {
  type ImportColumn,
  type MasterSheet,
} from "@/components/nafsul/ImportExcelModal";

/**
 * Kolom template Excel → field API anggota.
 *
 * Kolom ID mengikuti kolom `id` tabel anggota. Isinya hanya rujukan ke data
 * yang sudah ada — dikosongkan saat mendaftarkan anggota baru, dan server
 * menolak baris impor yang kolom ID-nya terisi. Karena itu kolom ini tidak
 * ikut dicetak di template (`diTemplate: false`), tapi pemetaannya tetap ada
 * supaya file yang masih punya kolom ID terbaca — dan ditolak dengan pesan
 * yang jelas, bukan diabaikan diam-diam.
 *
 * Kolom relasi diberi judul yang menyebut kunci masternya, dan contohnya diisi
 * kunci itu — bukan nama — supaya tidak terbaca sebagai teks bebas. Kuncinya
 * mengikuti masternya masing-masing: `Kode` untuk wilayah/kota/status,
 * `No. Ketua` untuk ketua kelompok, dan `ID` untuk pendidikan & pekerjaan yang
 * masternya memang tidak punya kolom kode. Sheet referensi di file yang sama
 * memuat daftar kunci ↔ nama-nya. Nama masih ikut diterima server sebagai
 * alternatif, tapi template mencontohkan kuncinya.
 */
const COLUMNS: ImportColumn[] = [
  { header: "ID", field: "id", contoh: "", diTemplate: false },
  { header: "Nama Lengkap", field: "nama", contoh: "Ahmad Fauzi", wajib: true },
  // Sengaja tidak `wajib`: baris tanpa kolom wajib ditolak di klien sebelum
  // dikirim, sedangkan No. Anggota yang dikosongkan justru dibuatkan otomatis
  // oleh server dengan format YYMMDD + urut harian.
  { header: "No. Anggota", field: "no_anggota", contoh: "26082101" },
  { header: "Jenis Kelamin", field: "jenis_kelamin", contoh: "L" },
  { header: "No. KTP", field: "noktp", contoh: "3578010101900001" },
  { header: "No. KK", field: "nokk", contoh: "3578010101900002" },
  { header: "Kode Kota Lahir", field: "kode_kota_lahir", contoh: "3578" },
  { header: "Tanggal Lahir", field: "tgl_lahir", contoh: "1990-01-01" },
  { header: "Status Nikah", field: "status_nikah", contoh: "Kawin" },
  { header: "ID Pendidikan", field: "pendidikan_id", contoh: "3" },
  { header: "ID Pekerjaan", field: "pekerjaan_id", contoh: "1" },
  { header: "Alamat", field: "alamat", contoh: "Jl. Melati No. 10" },
  { header: "Telepon", field: "telepon", contoh: "081234567890" },
  { header: "Kode Wilayah", field: "kode_wilayah", contoh: "01" },
  { header: "No. Ketua Kelompok", field: "noketua", contoh: "KKL2608001", wajib: true },
  { header: "Kode Status Anggota", field: "kode_status", contoh: "STS1" },
  { header: "Tanggal Aktif", field: "tgl_aktif", contoh: "2026-01-15" },
  { header: "Tanggal Nonaktif", field: "tgl_nonaktif", contoh: "" },
  { header: "Keterangan", field: "keterangan", contoh: "" },
  { header: "Nama Keluarga", field: "nama_keluarga", contoh: "Siti Aminah" },
  { header: "Hubungan", field: "hubungan", contoh: "Istri" },
  { header: "Telepon Keluarga", field: "telepon_keluarga", contoh: "" },
  { header: "Alamat Keluarga", field: "alamat_keluarga", contoh: "" },
];

export default function ImportAnggotaModal({
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

  // Seluruh master yang dirujuk kolom anggota, ditulis sebagai sheet referensi
  // di file template & file baris gagal.
  const muatMaster = useCallback(async (): Promise<MasterSheet[]> => {
    const [wilayah, kota, ketua, status, pendidikan, pekerjaan] = await Promise.all([
      api<Wilayah[]>("/wilayah", { params: { all: 1 } }),
      api<Kota[]>("/kota", { params: { all: 1 } }),
      api<KetuaKelompok[]>("/ketua-kelompok", { params: { all: 1 } }),
      api<StatusAnggota[]>("/status-anggota", { params: { all: 1 } }),
      api<Pendidikan[]>("/pendidikan", { params: { all: 1 } }),
      api<Pekerjaan[]>("/pekerjaan", { params: { all: 1 } }),
    ]);

    return [
      { nama: "Wilayah", idLabel: "Kode", rows: wilayah.map((w) => [w.kode, w.nama]) },
      { nama: "Kota", idLabel: "Kode", rows: kota.map((k) => [k.kode, k.nama]) },
      {
        nama: "Ketua Kelompok",
        idLabel: "No. Ketua",
        rows: ketua.map((k) => [k.noketua, k.nama]),
      },
      { nama: "Status Anggota", idLabel: "Kode", rows: status.map((s) => [s.kode, s.nama]) },
      { nama: "Pendidikan", idLabel: "ID", rows: pendidikan.map((p) => [String(p.id), p.nama]) },
      { nama: "Pekerjaan", idLabel: "ID", rows: pekerjaan.map((p) => [String(p.id), p.nama]) },
    ];
  }, []);

  return (
    <ImportExcelModal
      open={open}
      onClose={onClose}
      onSelesai={onSelesai}
      judul={t("nafsulImport.titleMember")}
      slug="anggota"
      sheetUtama="Anggota"
      columns={COLUMNS}
      barisWajib={{ field: "nama", label: "Nama Lengkap" }}
      muatMaster={muatMaster}
    />
  );
}

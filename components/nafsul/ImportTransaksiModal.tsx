"use client";

import { useCallback } from "react";
import { api } from "@/lib/nafsul/api";
import type { Anggota, Tarif } from "@/lib/nafsul/types";
import { FEE_TYPE } from "@/lib/nafsul/feeType";
import { useT } from "@/lib/i18n";
import ImportExcelModal, {
  type ImportColumn,
  type MasterSheet,
} from "@/components/nafsul/ImportExcelModal";

/**
 * Sheet "Kuitansi" — satu baris per kuitansi.
 *
 * `Kode Kuitansi` hanya berlaku di dalam file: dipakai menyambungkan baris di
 * sheet Rincian ke kuitansi ini, lalu dibuang. Nomor kuitansi yang sebenarnya
 * dibuat server, format YYMMDD + urut harian — sama seperti kuitansi yang
 * dibuat lewat form.
 */
const KOLOM_KUITANSI: ImportColumn[] = [
  { header: "Kode Kuitansi", field: "kode_kuitansi", contoh: "K1", wajib: true },
  // Tanggal uang DITERIMA, bukan tanggal impor. Sel yang diformat sebagai
  // tanggal di Excel pun aman: cellToString mengubahnya jadi YYYY-MM-DD memakai
  // tanggal LOKAL, sehingga tidak bergeser sehari seperti kalau lewat UTC.
  { header: "Tanggal", field: "tanggal", contoh: "2026-08-23", wajib: true },
  { header: "Jenis", field: "jenis", contoh: "pribadi", wajib: true },
  { header: "Dibayar", field: "dibayar", contoh: "150000", wajib: true },
  { header: "Metode", field: "metode", contoh: "cash", wajib: true },
  { header: "Potongan Anggota", field: "potongan_anggota", contoh: "0" },
  // Dua kolom terakhir hanya berlaku pada kuitansi kelompok; pada kuitansi
  // pribadi server menolkannya, sama seperti form yang menyembunyikan
  // field-nya.
  { header: "Potongan Ketua", field: "potongan_ketua", contoh: "0" },
  { header: "Jasa Ketua", field: "jasa_ketua", contoh: "0" },
];

/**
 * Sheet "Rincian" — satu baris per iuran.
 *
 * Anggota & tarif dirujuk lewat kode yang tampil di aplikasi (No. Anggota,
 * Kode Tarif), bukan id database — id tidak pernah muncul di layar mana pun,
 * jadi tidak ada cara wajar mengisinya. Sheet referensi di file yang sama
 * memuat daftar kode ↔ namanya.
 *
 * Kolom audit (`created_by`, `updated_by`, dst) sengaja tidak ada di file:
 * server mengisinya sendiri dari user yang sedang login.
 *
 * `Periode` mengikuti sifat tarifnya: wajib untuk tarif berulang, dan harus
 * DIKOSONGKAN untuk tarif sekali bayar. `Nominal` boleh kosong — server
 * memakai harga tarifnya, sehingga petugas tidak perlu menyalin angka yang
 * sama ratusan kali.
 */
const KOLOM_RINCIAN: ImportColumn[] = [
  { header: "Kode Kuitansi", field: "kode_kuitansi", contoh: "K1", wajib: true },
  { header: "No. Anggota", field: "no_anggota", contoh: "26082101", wajib: true },
  { header: "Kode Tarif", field: "kode_tarif", contoh: "IUR01", wajib: true },
  { header: "Periode", field: "periode", contoh: "01/2026" },
  { header: "Nominal", field: "nominal", contoh: "50000" },
  { header: "Diskon", field: "diskon", contoh: "0" },
];

/**
 * Balasan daftar → array, apa pun bentuknya.
 *
 * Endpoint master di aplikasi ini tidak seragam: sebagian membalas array polos
 * saat diberi `all=1`, sebagian lain tetap membalas objek paginasi
 * (`{ data: [...] }`) karena parameternya belum didukung. Memanggil `.map()`
 * langsung pada bentuk kedua melempar TypeError yang menggagalkan SELURUH
 * pemuatan master — dan gejalanya di layar cuma "sheet referensinya kosong",
 * tanpa petunjuk apa pun soal penyebabnya.
 */
function daftar<T>(balasan: unknown): T[] {
  if (Array.isArray(balasan)) return balasan as T[];

  const isi = (balasan as { data?: unknown } | null)?.data;

  return Array.isArray(isi) ? (isi as T[]) : [];
}

export default function ImportTransaksiModal({
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

  // Anggota & tarif ditulis sebagai sheet referensi di file template dan file
  // baris gagal. Sheet tarif ikut menyebut sifatnya, karena itulah yang
  // menentukan kolom Periode diisi atau dikosongkan.
  const muatMaster = useCallback(async (): Promise<MasterSheet[]> => {
    // `allSettled`, bukan `all`: satu master yang gagal dimuat tidak boleh ikut
    // menghapus sheet referensi milik master lainnya. Yang gagal cukup terbit
    // sebagai sheet kosong.
    const [anggota, tarif] = await Promise.allSettled([
      api<unknown>("/anggota", { params: { all: 1 } }),
      api<unknown>("/tarif", { params: { all: 1, kategori: "iuran" } }),
    ]);

    const barisAnggota =
      anggota.status === "fulfilled" ? daftar<Anggota>(anggota.value) : [];
    const barisTarif =
      tarif.status === "fulfilled" ? daftar<Tarif>(tarif.value) : [];

    return [
      {
        nama: "Anggota",
        idLabel: "No. Anggota",
        rows: barisAnggota.map((a) => [a.no_anggota ?? "", a.nama ?? ""]),
      },
      {
        nama: "Tarif",
        idLabel: "Kode Tarif",
        // Harga dipisah ke kolomnya sendiri, bukan disatukan ke nama: petugas
        // menyalin angkanya ke kolom Nominal, dan angka yang menempel pada
        // kalimat tidak bisa disalin begitu saja.
        kolom: ["Nama", "Harga", "Sifat"],
        rows: barisTarif.map((r) => [
          r.kode,
          r.nama,
          String(r.harga ?? ""),
          r.fee_type === FEE_TYPE.oneTime
            ? t("nafsulImport.rateOneTime")
            : t("nafsulImport.rateRecurring"),
        ]),
      },
    ];
  }, [t]);

  return (
    <ImportExcelModal
      open={open}
      onClose={onClose}
      onSelesai={onSelesai}
      judul={t("nafsulImport.titleTransaction")}
      slug="transaksi"
      sheetUtama="Rincian"
      columns={KOLOM_RINCIAN}
      barisWajib={{ field: "no_anggota", label: "No. Anggota" }}
      // Rincian se-kuitansi tidak boleh terpecah ke dua permintaan: yang
      // terbelah akan tersimpan sebagai dua kuitansi berbeda.
      kunciGrup="kode_kuitansi"
      ukuranBatch={50}
      sheetInduk={{
        nama: "Kuitansi",
        columns: KOLOM_KUITANSI,
        payloadField: "headers",
      }}
      muatMaster={muatMaster}
    />
  );
}

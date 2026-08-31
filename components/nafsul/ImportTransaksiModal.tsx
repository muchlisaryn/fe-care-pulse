"use client";

import { useT } from "@/lib/i18n";
import ImportExcelModal, {
  type ImportColumn,
} from "@/components/nafsul/ImportExcelModal";

/**
 * Sheet "Kuitansi" — satu baris per kuitansi.
 *
 * Judul kolom memakai NAMA KOLOM DATABASE apa adanya (`date`, `payment`, …),
 * bukan label bahasa Indonesia. File ini dipakai memindahkan data dari sistem
 * lama, dan yang memetakannya membaca skema tabel, bukan layar aplikasi —
 * "Dibayar" memaksa mereka menebak apakah itu `payment` atau `total`.
 *
 * `header` yang berubah, `field` TIDAK: `field` adalah kunci payload API, dan
 * mengubahnya berarti mengubah kontrak dengan backend. `bacaSheet` mencocokkan
 * judul kolom lewat `header` MAUPUN `field`, jadi file template lama yang masih
 * berjudul "Tanggal"/"Dibayar" tetap terbaca.
 *
 * Setiap kolom di bawah ini punya pasangan kolom di `transaction_headers`;
 * tidak ada kolom hiasan. Kolom yang nilainya DITURUNKAN server sengaja tidak
 * ada di sini — `group_leader_deduction` serta seluruh kolom audit. Kolom isian yang
 * diabaikan server lebih buruk daripada kolom yang tidak ada: petugas
 * mengisinya, angkanya hilang tanpa suara, dan tidak ada galat yang muncul.
 */
const KOLOM_KUITANSI: ImportColumn[] = [
  /**
   * Nomor kuitansi — WAJIB, dan merangkap dua peran.
   *
   * Tersimpan sebagai nomor kuitansinya, SEKALIGUS jadi kunci yang
   * menyambungkan baris ini ke rincian-rinciannya di sheet Rincian. Nilainya
   * harus unik: server menolak yang kembar di dalam file maupun yang sudah
   * dipakai kuitansi lain di aplikasi.
   *
   * Dulu peran perekat dipegang kolom terpisah `kode_kuitansi`, dan kolom ini
   * boleh dikosongkan agar server yang membuatkan nomornya. Dua kolom untuk
   * satu peran ternyata cuma jebakan — nomor lama diisikan ke kolom perekat
   * yang memang selalu dibuang, lalu kuitansinya tersimpan dengan nomor buatan
   * server tanpa satu pun galat muncul.
   *
   * Formatnya bebas: nomor lama adalah fakta yang sudah terjadi, dan aturan
   * penomoran hari ini tidak berlaku surut untuknya.
   */
  { header: "transaction_number", field: "no_kuitansi", contoh: "2608140001", wajib: true },
  { header: "date", field: "tanggal", contoh: "2026-08-23", wajib: true },
  { header: "transaction_type", field: "jenis", contoh: "pribadi", wajib: true },
  { header: "payment", field: "dibayar", contoh: "150000", wajib: true },
  { header: "payment_method", field: "metode", contoh: "cash", wajib: true },
  // Rupiah — satu-satunya bentuk potongan anggota.
  { header: "member_deduction", field: "potongan_anggota", contoh: "0" },
  /**
   * Nilai kuitansi, RUPIAH. Boleh dikosongkan.
   *
   * Diisi → angka itu yang tersimpan, apa adanya. Kosong → server menurunkannya
   * dari `payment − member_deduction`.
   *
   * Dipakai apa adanya karena alasan yang sama seperti `group_leader_fee`:
   * total pada kuitansi lama adalah angka yang sudah tercetak, dan menghitung
   * ulang dari rincian yang kerap tidak lengkap justru menggesernya.
   */
  { header: "total", field: "total", contoh: "" },
  /**
   * PERSENTASE, bukan rupiah — nama kolomnya sendiri yang menyatakan itu, dan
   * itulah keuntungan memakai nama database: "Potongan Ketua" tidak pernah
   * bisa membedakan 10 (persen) dari 10000 (rupiah).
   *
   * Hanya berlaku pada kuitansi kelompok; pada kuitansi pribadi server
   * menolkannya, sama seperti form yang menyembunyikan field-nya.
   */
  { header: "group_leader_fee_percent", field: "potongan_ketua", contoh: "0" },
  /**
   * Nominal jasa ketua, RUPIAH. Boleh dikosongkan.
   *
   * Kosong → server menurunkannya dari `group_leader_fee_percent` × total
   * rincian, seperti kuitansi yang dibuat lewat form. Diisi → angka itu dipakai
   * apa adanya.
   *
   * Kolom ini ada untuk data migrasi: sistem lama menyimpan nominal jasanya
   * sendiri, dan menghitung ulang dari persen menggeser angka yang sudah
   * tercetak di kuitansi lama — pembulatan saja sudah cukup membuatnya meleset,
   * dan selisih itu baru ketahuan saat rekap tidak imbang.
   *
   * `group_leader_deduction` tidak punya kolom sendiri: nominalnya SELALU sama
   * dengan jasa ketua (ketua menahan komisinya dari uang yang ia kumpulkan),
   * jadi kolom kedua hanya membuka peluang keduanya berselisih.
   */
  { header: "group_leader_fee", field: "jasa_ketua", contoh: "" },
];

/**
 * Sheet "Rincian" — satu baris per iuran.
 *
 * Judul kolom memakai nama kolom database, dengan dua penyesuaian yang tidak
 * bisa dihindari:
 *
 *  - `member_number` & `rate_code` merujuk kolom di tabel LAIN (`members`,
 *    `rates`), bukan `transactions.member_id` / `rate_id`. Id database tidak
 *    pernah muncul di layar mana pun, jadi tidak ada cara wajar mengisinya —
 *    yang dipakai adalah kode yang dilihat petugas. `rates.code` ditulis
 *    `rate_code` karena `code` saja tidak menyebut master mana yang dimaksud;
 *  - `payment_period` sudah tidak ada lagi di tabel (dipecah jadi `month` +
 *    `year`), tapi tetap dipakai sebagai satu kolom "MM/YYYY" di file: dua sel
 *    kosong jauh lebih mudah salah isi daripada satu, dan tarif sekali bayar
 *    tidak memakai kolom itu sama sekali.
 *
 * Kolom audit (`created_by`, `updated_by`, dst) sengaja tidak ada di file:
 * server mengisinya sendiri dari user yang sedang login.
 *
 * `payment_period` mengikuti FILE, bukan klasifikasi tarif di master: diisi →
 * tersimpan, dikosongkan → kosong. Satu tarif yang salah diklasifikasi di master
 * karenanya tidak bisa lagi membuang periode seluruh barisnya diam-diam.
 * `amount` boleh kosong — server
 * memakai harga tarifnya, sehingga petugas tidak perlu menyalin angka yang sama
 * ratusan kali.
 */
const KOLOM_RINCIAN: ImportColumn[] = [
  // Menunjuk ke baris sheet Kuitansi yang bernomor sama.
  { header: "transaction_number", field: "no_kuitansi", contoh: "2608140001", wajib: true },
  { header: "member_number", field: "no_anggota", contoh: "26082101", wajib: true },
  { header: "rate_code", field: "kode_tarif", contoh: "IUR01", wajib: true },
  { header: "payment_period", field: "periode", contoh: "01/2026" },
  { header: "amount", field: "nominal", contoh: "50000" },
  { header: "discount", field: "diskon", contoh: "0" },
];

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

  return (
    <ImportExcelModal
      open={open}
      onClose={onClose}
      onSelesai={onSelesai}
      judul={t("nafsulImport.titleTransaction")}
      slug="transaksi"
      sheetUtama="Rincian"
      columns={KOLOM_RINCIAN}
      barisWajib={{ field: "no_anggota", label: "member_number" }}
      // Rincian se-kuitansi tidak boleh terpecah ke dua permintaan: yang
      // terbelah akan tersimpan sebagai dua kuitansi berbeda.
      kunciGrup="no_kuitansi"
      /**
       * 2000, bukan 50.
       *
       * Server tidak lagi membatasi jumlah baris per permintaan, dan biaya
       * per barisnya sudah bukan empat query melainkan pencarian di array —
       * jadi yang tersisa cuma ongkos bolak-balik HTTP. Pada file 299.562
       * baris, 50 baris per permintaan berarti 4538 kali bolak-balik; 2000
       * memangkasnya jadi sekitar 150.
       *
       * Tidak dikirim sekaligus dalam satu permintaan meski servernya
       * mengizinkan: pemecahan inilah yang membuat progresnya bergerak, dan
       * yang membuat satu permintaan gagal hanya menjatuhkan bagiannya, bukan
       * seluruh impor yang sudah berjalan setengah jam.
       */
      ukuranBatch={2000}
      sheetInduk={{
        nama: "Kuitansi",
        columns: KOLOM_KUITANSI,
        payloadField: "headers",
      }}
      // Tanpa `muatMaster`: file template & file baris gagal berisi sheet
      // datanya saja, tanpa sheet referensi Anggota/Tarif. Daftar itu bisa
      // memuat puluhan ribu baris — menuliskannya ke tiap file membuat unduhan
      // berat dan menahan tombol Unduh Template selama masternya dimuat,
      // padahal daftarnya sudah bisa dilihat di halaman masternya sendiri.
    />
  );
}

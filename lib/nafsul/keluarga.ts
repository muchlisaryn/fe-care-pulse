import type { Anggota } from "@/lib/nafsul/types";

/**
 * Salin data yang dipakai BERSAMA satu keluarga dari anggota yang sudah
 * terdaftar ke isian formulir anggota.
 *
 * Ditaruh di sini, bukan di masing-masing formulir: halaman pendaftaran dan
 * halaman ubah anggota memakai komponen yang berbeda, dan aturan "kolom mana
 * yang ikut tersalin" yang ditulis dua kali cepat atau lambat berselisih —
 * satu halaman menyalin telepon, yang lain lupa.
 *
 * Kolom yang disalin selalu MENGIKUTI anggota yang dipilih — memilih ulang
 * menggantinya dengan data yang baru, termasuk mengosongkannya bila di sana
 * memang kosong.
 *
 * Yang TIDAK disalin:
 *
 * - Identitas yang melekat pada ORANGNYA — nama, tanggal lahir, No. KTP,
 *   pendidikan, pekerjaan. Menyalinnya berarti mendaftarkan anggota baru
 *   berisi identitas orang lain.
 * - `hubungan`. Ia menerangkan hubungan ANGGOTA INI dengan penanggung
 *   jawabnya — istri, anak, menantu — jadi berbeda untuk tiap orang meski
 *   penanggung jawabnya satu orang yang sama.
 *
 * @param sumber Anggota terdaftar yang dipilih petugas.
 * @param form   Isian formulir saat ini.
 * @returns Isian baru; objek yang lama tidak disentuh.
 */
export function salinDataKeluarga(
  sumber: Anggota,
  form: Record<string, string>,
): Record<string, string> {
  const hasil = { ...form };

  /**
   * Isian DITIMPA, bukan cuma diisi saat masih kosong.
   *
   * Memilih anggota di modal pencarian adalah tindakan yang disengaja, dan
   * sekali salinannya masuk, seluruh kolom di bawah ini sudah terisi — aturan
   * "isi yang kosong saja" membuat pencarian KEDUA tidak mengubah apa pun,
   * seolah tombolnya tidak bekerja.
   *
   * Nilai kosong pada sumbernya ikut disalin sebagai kosong: yang tampil
   * selalu persis data anggota yang barusan dipilih, bukan campuran antara
   * pilihan sekarang dan sisa pilihan sebelumnya — campuran seperti itu tidak
   * mewakili siapa pun.
   */
  const salin = (field: string, nilai: string | null | undefined) => {
    hasil[field] = nilai == null ? "" : String(nilai);
  };

  // No. KK ikut disalin: ia kunci yang menyatukan mereka sekeluarga, dan
  // petugas mungkin baru mengetik sebagian digitnya — atau mencari lewat nama,
  // sehingga kolomnya masih kosong sama sekali. Potongan digit yang tersisa
  // akan tersimpan apa adanya dan memisahkan anggota ini dari keluarganya.
  salin("nokk", sumber.nokk);

  // Kelahiran & Domisili
  salin("telepon", sumber.telepon);
  salin("alamat", sumber.alamat);

  // Keanggotaan
  salin("kode_wilayah", sumber.kode_wilayah);

  // Penanggung Jawab Keluarga
  salin("nama_keluarga", sumber.nama_keluarga);
  salin("telepon_keluarga", sumber.telepon_keluarga);
  salin("alamat_keluarga", sumber.alamat_keluarga);

  return hasil;
}

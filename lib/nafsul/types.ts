import type { FeeType } from "./feeType";

export interface User {
  id: number;
  name: string;
  nopeg: string | null;
  email: string | null;
  is_admin: boolean;
  avatar: string | null;
  avatar_url: string | null;
}

export interface Wilayah {
  kode: string;
  nama: string;
}

export interface Kota {
  kode: string;
  nama: string;
}

export interface StatusAnggota {
  kode: string;
  nama: string;
}

/** Master pendidikan — anggota merujuknya lewat `pendidikan_id`. */
export interface Pendidikan {
  id: number;
  nama: string;
}

/** Master pekerjaan — anggota merujuknya lewat `pekerjaan_id`. */
export interface Pekerjaan {
  id: number;
  nama: string;
}

export interface Tarif {
  kode: string;
  nama: string;
  harga: string | number;
  /**
   * Sifat tarif: "recurring" (berulang tiap periode) atau "one_time" (sekali
   * bayar). `null` = tarif lama yang belum diklasifikasi, diperlakukan sebagai
   * berulang — sama seperti di backend.
   */
  fee_type: FeeType | null;
}

export interface KetuaKelompok {
  noketua: string;
  nama: string;
  jenis_kelamin: string | null;
  alamat: string | null;
  telepon: string | null;
  anggota_count?: number;
}

export interface AnggotaKeluarga {
  id?: number;
  anggota_id?: number;
  nama_ketua: string | null;
  no_anggota: string | null;
  nama_anggota: string;
  tgl_lahir: string | null;
  jenis_kelamin: string | null;
  pendidikan: string | null;
}

export interface Anggota {
  id: number;
  kode_wilayah: string | null;
  noketua: string | null;
  nokk: string | null;
  no_anggota: string | null;
  nama: string;
  tgl_lahir: string | null;
  kode_kota_lahir: string | null;
  jenis_kelamin: string | null;
  pendidikan_id: number | null;
  pekerjaan_id: number | null;
  status_nikah: string | null;
  noktp: string | null;
  alamat: string | null;
  telepon: string | null;
  tgl_aktif: string | null;
  tgl_nonaktif: string | null;
  kode_status: string | null;
  keterangan: string | null;
  nama_keluarga: string | null;
  hubungan: string | null;
  alamat_keluarga: string | null;
  telepon_keluarga: string | null;
  kode_pengguna: string | null;
  kunjungan: string | null;
  tgl_update: string | null;
  created_at?: string | null;
  created_by?: string | null;
  wilayah?: Wilayah | null;
  ketua?: KetuaKelompok | null;
  kota_lahir?: Kota | null;
  status?: StatusAnggota | null;
  pendidikan?: Pendidikan | null;
  pekerjaan?: Pekerjaan | null;
  keluarga?: AnggotaKeluarga[];
}

export interface TransaksiDetail {
  id?: number;
  transaksi_id?: number;
  anggota_id?: number | null;
  no_anggota?: string | null;
  nama_anggota: string | null;
  periode: string | null;
  periode_akhir?: string | null;
  jenis_bayar: string | null;
  biaya: string | number;
  pot_bulan?: string | number;
  potongan?: string | number;
  kunjungan?: string | null;
  status: string | null;
}

export interface Transaksi {
  id: number;
  no_bayar: string;
  cara_bayar: string;
  jenis_transaksi: string | null;
  status: string;
  anggota_id: number | null;
  nama_anggota: string | null;
  noketua: string | null;
  nama_ketua: string | null;
  kode_bayar: string | null;
  keterangan: string | null;
  biaya: string | number;
  jns_bayar: string | null;
  jumlah_bln: number;
  periode_dari: string | null;
  periode_sampai: string | null;
  potongan: string | number;
  pot_ketua_persen: string | number;
  jasa_ketua: string | number;
  jumlah_bayar: string | number;
  uang_bayar: string | number;
  uang_kembali: string | number;
  tgl_input: string | null;
  validated_at: string | null;
  anggota?: Anggota | null;
  detail?: TransaksiDetail[];
}

export interface Pelayanan {
  id: number;
  anggota_id: number | null;
  nama: string;
  tgl_layanan: string;
  dimandikan: boolean;
  kendaraan: boolean;
  perlengkapan: boolean;
  santunan: string | number;
  biaya: string | number;
  petugas: string | null;
  keterangan: string | null;
  anggota?: Anggota | null;
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
  summary?: {
    count: number;
    lunas: number;
    draft: number;
    total_bayar: number;
  };
}

export interface DashboardStats {
  total_anggota: number;
  total_ketua: number;
  total_wilayah: number;
  bulan_ini: {
    kas_masuk: number;
    transaksi_lunas: number;
    tagihan_tertunda: number;
    pelayanan: number;
    santunan: number;
  };
  transaksi_terbaru: {
    id: number;
    no_bayar: string;
    nama_anggota: string | null;
    nama_ketua: string | null;
    cara_bayar: string;
    jumlah_bayar: string | number;
    status: string;
    tgl_input: string | null;
  }[];
  per_status: { kode: string; nama: string; total: number }[];
  per_wilayah: { kode: string; nama: string; total: number }[];
}

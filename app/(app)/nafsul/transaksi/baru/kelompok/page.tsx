import TransaksiForm from "@/components/nafsul/TransaksiForm"

/**
 * Kuitansi setoran KELOMPOK — ketua kelompok dipilih dulu, anggotanya menyusul.
 *
 * Halaman sendiri, bukan tab: jenis kuitansi menentukan isian yang muncul
 * (ketua kelompok, potongan & jasa ketua) dan tidak pernah berganti di tengah
 * pengisian. Kembarannya ada di `../pribadi`.
 */
export default function TransaksiBaruKelompokPage() {
  return <TransaksiForm tipe="kelompok" />
}

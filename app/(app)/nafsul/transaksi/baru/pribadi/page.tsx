import TransaksiForm from "@/components/nafsul/TransaksiForm"

/**
 * Kuitansi setoran PRIBADI — anggota perorangan, tanpa ketua kelompok dan
 * tanpa potongan/jasa ketua. Kembarannya ada di `../kelompok`.
 */
export default function TransaksiBaruPribadiPage() {
  return <TransaksiForm tipe="pribadi" />
}

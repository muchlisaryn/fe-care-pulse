/**
 * Warna grafik — SATU sumber untuk seluruh dashboard.
 *
 * Ketiga warna kategorinya sudah divalidasi terhadap latar kartu (putih):
 * pita terang-gelapnya seragam, chroma-nya cukup sehingga tidak ada yang jatuh
 * jadi abu-abu, dan tiap pasangan yang bersebelahan masih terpisah pada simulasi
 * buta warna protan/deutan/tritan maupun penglihatan normal.
 *
 * `#4ba69d` — teal merek yang dipakai di tombol & ikon — SENGAJA tidak dipakai
 * sebagai warna data: kontrasnya terhadap putih hanya 2,8:1, di bawah ambang 3:1
 * untuk bidang berwarna, jadi batang tipis dan garis 2px-nya sulit terlihat.
 * Padanan gelapnya, `#0d8b7d`, dipakai sebagai gantinya.
 *
 * URUTANNYA TETAP dan tidak boleh diputar: warna mengikuti ENTITAS, bukan
 * peringkatnya. Kalau warna digilir mengikuti urutan data, sebuah penyaring yang
 * mengubah jumlah seri akan mengecat ulang seri yang tersisa dan pembaca
 * mengira datanya yang berubah.
 */
export const CHART_COLORS = ["#075489", "#0d8b7d", "#b45309"] as const

/** Warna utama — dipakai grafik satu-seri (tren peminjaman & pendapatan). */
export const CHART_PRIMARY = CHART_COLORS[0]

/**
 * Warna keadaan. Disimpan terpisah dan TIDAK pernah dipakai sebagai "kategori
 * ke-4": merah di layar ini harus selalu berarti bermasalah.
 *
 * Semuanya wajib didampingi ikon + tulisan, tidak pernah warna saja.
 */
export const STATUS_COLORS = {
  good: "#0d8b7d",
  warning: "#b45309",
  critical: "#b91c1c",
} as const

/** Warna per cara bayar — dipetakan ke ENTITAS, bukan ke urutan tampil. */
export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  transfer: CHART_COLORS[0],
  cash: CHART_COLORS[1],
  other: CHART_COLORS[2],
}

/**
 * Warna seri KATEGORI untuk grafik bertumpuk (mis. peminjaman per ruangan per
 * hari). Empat, dan tidak lebih.
 *
 * Batasnya bukan selera: pada batang bertumpuk setiap potongan bisa bersebelahan
 * dengan potongan mana pun, jadi SEMUA pasangan harus terpisah — bukan cuma yang
 * berdekatan di daftar. Empat warna ini lulus seluruh pemeriksaan pada pengujian
 * semua-pasangan (pita terang-gelap, chroma minimum, keterpisahan pada simulasi
 * protan/deutan/tritan, dan kontras ≥ 3:1 terhadap kartu putih); menambah warna
 * kelima menjatuhkan salah satu pasangan di bawah ambang. Entitas ke-5 dan
 * seterusnya karena itu dilipat backend jadi satu seri "Lainnya".
 *
 * URUTANNYA TETAP, sama seperti CHART_COLORS: warna mengikuti ENTITAS menurut
 * urutan seri yang dikirim backend, tidak pernah digilir mengikuti data yang
 * tersisa setelah penyaringan.
 */
export const CHART_SERIES = ["#075489", "#0d8b7d", "#b45309", "#7c3aed"] as const

/**
 * Warna seri "Lainnya" — abu netral, SENGAJA di luar CHART_SERIES.
 *
 * Kelompok sisa bukan sebuah entitas, jadi ia tidak boleh mendapat warna yang
 * setara dengan ruangan bernama; abu membuatnya terbaca sebagai latar sisa.
 */
export const CHART_OTHER = "#6b7280"

/**
 * Penerjemah nama yang datangnya DARI DATABASE — nama menu, judul seksi sidebar,
 * dan label dinamis lain yang bisa ditambah/diubah petugas lewat Master Menu.
 *
 * Nama seperti itu tidak bisa ditulis satu per satu di kamus statis: begitu ada
 * menu baru, kamusnya langsung ketinggalan. Karena itu penerjemahannya dua lapis:
 *
 *  1. PADANAN FRASA (`PHRASE`) — daftar padanan utuh untuk nama yang sudah ada
 *     sekarang. Ini yang dipakai lebih dulu karena hasilnya pasti benar, termasuk
 *     urutan katanya.
 *  2. GLOSARIUM KATA (`WORDS`) — kalau frasanya belum dikenal, tiap katanya
 *     diterjemahkan sendiri-sendiri. Menu BARU yang memakai kosakata CSSD yang
 *     sudah dikenal ikut terterjemah otomatis tanpa perlu ubah kode.
 *
 * Kata yang tidak ada di glosarium sengaja DIBIARKAN apa adanya — lebih baik satu
 * kata tampil dalam bahasa aslinya daripada hilang atau jadi tanda tanya.
 */

export type Lang = "en" | "id"

/** Padanan frasa utuh: kunci = teks yang dinormalkan (huruf kecil, spasi rapat). */
const PHRASE: Record<string, { en: string; id: string }> = {
  // ── Judul seksi sidebar ───────────────────────────────────────────────────
  "dashboard": { en: "Dashboard", id: "Dashboard" },
  "master data": { en: "Master Data", id: "Data Master" },
  "cssd": { en: "CSSD", id: "CSSD" },
  "clinical pathway": { en: "Clinical Pathway", id: "Clinical Pathway" },
  "pengaturan": { en: "Settings", id: "Pengaturan" },
  "settings": { en: "Settings", id: "Pengaturan" },

  // ── Master Data ───────────────────────────────────────────────────────────
  "authority": { en: "Authority", id: "Otoritas" },
  "otoritas": { en: "Authority", id: "Otoritas" },
  "title menu": { en: "Menu Title", id: "Judul Menu" },
  "menu": { en: "Menu", id: "Menu" },
  "user": { en: "User", id: "Pengguna" },
  "master cssd": { en: "CSSD Master", id: "Master CSSD" },
  "room": { en: "Room", id: "Ruangan" },
  "ruangan": { en: "Room", id: "Ruangan" },
  "instrument set": { en: "Instrument Set", id: "Set Instrumen" },
  "set instrumen": { en: "Instrument Set", id: "Set Instrumen" },
  "condition": { en: "Condition", id: "Kondisi" },
  "kondisi": { en: "Condition", id: "Kondisi" },
  "bmhp": { en: "BMHP", id: "BMHP" },
  "washer machine": { en: "Washer Machine", id: "Mesin Washer" },
  "mesin washer": { en: "Washer Machine", id: "Mesin Washer" },
  "sterilizer machine": { en: "Sterilizer Machine", id: "Mesin Sterilisator" },
  "mesin sterilisator": { en: "Sterilizer Machine", id: "Mesin Sterilisator" },
  "rack": { en: "Rack", id: "Rak" },
  "rak": { en: "Rack", id: "Rak" },
  "packaging": { en: "Packaging", id: "Kemasan" },
  "jenis kemasan": { en: "Packaging Type", id: "Jenis Kemasan" },
  "medis": { en: "Medical", id: "Medis" },
  "icd 10": { en: "ICD 10", id: "ICD 10" },
  "instrumen": { en: "Instrument", id: "Instrumen" },
  "master instrumen": { en: "Instrument Master", id: "Master Instrumen" },

  // ── CSSD ──────────────────────────────────────────────────────────────────
  "transaksi": { en: "Transaction", id: "Transaksi" },
  "transaction": { en: "Transaction", id: "Transaksi" },
  "cssd production": { en: "CSSD Production", id: "Produksi CSSD" },
  "produksi cssd": { en: "CSSD Production", id: "Produksi CSSD" },
  "storage steril": { en: "Sterile Storage", id: "Gudang Steril" },
  "gudang steril": { en: "Sterile Storage", id: "Gudang Steril" },
  "order instrumen": { en: "Instrument Orders", id: "Order Instrumen" },
  "instrument orders": { en: "Instrument Orders", id: "Order Instrumen" },
  "tracking order": { en: "Order Tracking", id: "Tracking Order" },
  "order tracking": { en: "Order Tracking", id: "Tracking Order" },
  "bmhp distribution": { en: "BMHP Distribution", id: "Distribusi BMHP" },
  "distribusi bmhp": { en: "BMHP Distribution", id: "Distribusi BMHP" },
  "monitoring": { en: "Monitoring", id: "Monitoring" },
  "sterile expiry": { en: "Sterile Expiry", id: "Kedaluwarsa Steril" },
  "kedaluwarsa steril": { en: "Sterile Expiry", id: "Kedaluwarsa Steril" },
  "monitor board (tv)": { en: "Monitor Board (TV)", id: "Papan Monitor (TV)" },
  "papan monitor (tv)": { en: "Monitor Board (TV)", id: "Papan Monitor (TV)" },
  "laporan": { en: "Report", id: "Laporan" },
  "report": { en: "Report", id: "Laporan" },
  "cssd instrument report": { en: "CSSD Instrument Report", id: "Laporan Instrumen CSSD" },
  "laporan instrumen cssd": { en: "CSSD Instrument Report", id: "Laporan Instrumen CSSD" },
  "laporan transaksi instrumen": {
    en: "Instrument Transaction Report",
    id: "Laporan Transaksi Instrumen",
  },
  "instrument transaction report": {
    en: "Instrument Transaction Report",
    id: "Laporan Transaksi Instrumen",
  },

  // ── Clinical Pathway ──────────────────────────────────────────────────────
  "asesmen": { en: "Assessment", id: "Asesmen" },
  "assessment": { en: "Assessment", id: "Asesmen" },
  "kategori": { en: "Category", id: "Kategori" },
  "category": { en: "Category", id: "Kategori" },
  "formulir": { en: "Form", id: "Formulir" },
  "form": { en: "Form", id: "Formulir" },

  // ── Tahap unit di pipeline CSSD (dikirim server sbg `stage_label`) ─────────
  "dalam produksi": { en: "Under Production", id: "Dalam Produksi" },
  "menunggu disimpan di rak": { en: "Awaiting Storage", id: "Menunggu Disimpan di Rak" },
  "disimpan di rak": { en: "Stored on Rack", id: "Disimpan di Rak" },
  "tersedia": { en: "Available", id: "Tersedia" },
  "tidak tersedia": { en: "Not Available", id: "Tidak Tersedia" },
  "dipinjam": { en: "Borrowed", id: "Dipinjam" },
  "dikembalikan": { en: "Returned", id: "Dikembalikan" },
  "dalam proses cssd": { en: "In CSSD Process", id: "Dalam Proses CSSD" },
  "pencucian & disinfeksi": { en: "Washing & Disinfection", id: "Pencucian & Disinfeksi" },
  "pengemasan (packing)": { en: "Packaging (Packing)", id: "Pengemasan (Packing)" },

  // ── Status baris pipeline (`status` tiap tahap) ────────────────────────────
  "selesai": { en: "Completed", id: "Selesai" },
  "diproses": { en: "In Process", id: "Diproses" },
  "dalam proses": { en: "In Process", id: "Dalam Proses" },
  "tersimpan": { en: "Stored", id: "Tersimpan" },
  "keluar": { en: "Released", id: "Keluar" },
  "gagal": { en: "Failed", id: "Gagal" },
  "batal": { en: "Canceled", id: "Batal" },
  "berhasil": { en: "Passed", id: "Berhasil" },
  "tidak berhasil": { en: "Failed", id: "Tidak Berhasil" },

  // ── Hasil indikator biologi sterilisasi ───────────────────────────────────
  "negatif": { en: "Negative", id: "Negatif" },
  "positif": { en: "Positive", id: "Positif" },

  // ── Metode sterilisasi (disimpan apa adanya oleh backend) ─────────────────
  "uap": { en: "Steam (Autoclave)", id: "Uap (Autoclave)" },
  "eo": { en: "Ethylene Oxide (EO)", id: "Etilen Oksida (EO)" },
  "plasma": { en: "Plasma H2O2", id: "Plasma H2O2" },
  "panas_kering": { en: "Dry Heat", id: "Panas Kering" },
  "panas kering": { en: "Dry Heat", id: "Panas Kering" },

  // ── Kondisi instrumen (master Kondisi — data, bisa bertambah) ──────────────
  "baik": { en: "Good", id: "Baik" },
  "cukup baik": { en: "Fairly Good", id: "Cukup Baik" },
  "kurang baik": { en: "Fair", id: "Kurang Baik" },
  "rusak": { en: "Damaged", id: "Rusak" },
  "rusak ringan": { en: "Lightly Damaged", id: "Rusak Ringan" },
  "rusak berat": { en: "Heavily Damaged", id: "Rusak Berat" },
  "dalam perbaikan": { en: "Under Repair", id: "Dalam Perbaikan" },
  "hilang": { en: "Lost", id: "Hilang" },

  // ── Pengaturan ────────────────────────────────────────────────────────────
  "master printer": { en: "Printer Master", id: "Master Printer" },
  "profil": { en: "Profile", id: "Profil" },
  "profile": { en: "Profile", id: "Profil" },
  "kata sandi": { en: "Password", id: "Kata Sandi" },
  "ubah kata sandi": { en: "Change Password", id: "Ubah Kata Sandi" },
  "change password": { en: "Change Password", id: "Ubah Kata Sandi" },
  "password": { en: "Password", id: "Kata Sandi" },
  "sesi": { en: "Sessions", id: "Sesi" },
  "sesi aktif": { en: "Active Sessions", id: "Sesi Aktif" },
}

/**
 * Glosarium PER KATA — jaring pengaman untuk nama yang belum ada padanan frasanya
 * (mis. menu yang baru ditambahkan petugas). Ditulis satu arah id→en; arah
 * sebaliknya dibalik otomatis di bawah.
 */
const WORDS: Record<string, string> = {
  // umum
  data: "data",
  master: "master",
  daftar: "list",
  laporan: "report",
  transaksi: "transaction",
  riwayat: "history",
  pengaturan: "settings",
  tambah: "add",
  ubah: "edit",
  hapus: "delete",
  detail: "detail",
  ringkasan: "summary",
  jenis: "type",
  jumlah: "quantity",
  tanggal: "date",
  waktu: "time",
  status: "status",
  kode: "code",
  nama: "name",
  nomor: "number",
  total: "total",
  papan: "board",
  monitor: "monitor",
  // CSSD
  instrumen: "instrument",
  alat: "instrument",
  set: "set",
  paket: "package",
  satuan: "single",
  kemasan: "packaging",
  pengemasan: "packaging",
  pencucian: "washing",
  sterilisasi: "sterilization",
  steril: "sterile",
  sterilisator: "sterilizer",
  produksi: "production",
  distribusi: "distribution",
  penyimpanan: "storage",
  gudang: "warehouse",
  rak: "rack",
  lemari: "cabinet",
  mesin: "machine",
  kedaluwarsa: "expiry",
  pelacakan: "tracking",
  peminjaman: "borrowing",
  pengembalian: "return",
  pemesanan: "order",
  order: "order",
  kalibrasi: "calibration",
  pemeliharaan: "maintenance",
  perawatan: "maintenance",
  perbaikan: "repair",
  stok: "stock",
  penerimaan: "receiving",
  pengiriman: "delivery",
  permintaan: "request",
  persetujuan: "approval",
  pemakaian: "usage",
  pemantauan: "monitoring",
  // laporan & periode
  dokumen: "document",
  grafik: "chart",
  statistik: "statistics",
  rekap: "recap",
  harian: "daily",
  mingguan: "weekly",
  bulanan: "monthly",
  tahunan: "annual",
  // organisasi
  ruangan: "room",
  ruang: "room",
  pasien: "patient",
  petugas: "officer",
  pengguna: "user",
  otoritas: "authority",
  menu: "menu",
  judul: "title",
  kondisi: "condition",
  medis: "medical",
  kategori: "category",
  formulir: "form",
  asesmen: "assessment",
  profil: "profile",
  sesi: "session",
  printer: "printer",
}

/** Arah balik en→id, dibangun sekali dari WORDS. */
const WORDS_REVERSED: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [id, en] of Object.entries(WORDS)) {
    // Padanan pertama yang menang — entri id berikutnya untuk kata en yang sama
    // (mis. "alat" & "instrumen" sama-sama "instrument") tidak menimpanya.
    if (!(en in out)) out[en] = id
  }
  return out
})()

/** Kata sambung/depan yang menandakan frasa BUKAN rangkaian kata benda biasa. */
const CONNECTORS = new Set([
  "dan", "atau", "untuk", "di", "ke", "dari", "per", "pada", "dengan",
  "and", "or", "for", "in", "to", "from", "of", "by", "with",
])

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

/** Samakan huruf besar/kecil hasil terjemahan dengan bentuk kata aslinya. */
function matchCase(source: string, translated: string): string {
  if (source === source.toUpperCase() && source.length > 1) return translated.toUpperCase()
  if (source[0] === source[0]?.toUpperCase()) {
    return translated.charAt(0).toUpperCase() + translated.slice(1)
  }
  return translated
}

/**
 * Terjemahkan satu nama dari database ke `lang`.
 *
 * Urutannya: padanan frasa utuh → glosarium per kata → teks asli apa adanya.
 * Selalu mengembalikan sesuatu yang bisa dibaca; tidak pernah string kosong.
 */
export function translateName(text: string | null | undefined, lang: Lang): string {
  if (!text) return ""
  const key = normalize(text)

  const phrase = PHRASE[key]
  if (phrase) return phrase[lang]

  // Pisahkan kata sambil MEMPERTAHANKAN pemisahnya (spasi, tanda kurung, strip),
  // supaya "Monitor Board (TV)" tidak kehilangan tanda kurungnya.
  const tokens = text.split(/([^\p{L}\p{N}]+)/u)
  const dict = lang === "en" ? WORDS : WORDS_REVERSED

  let translatedCount = 0
  let contentCount = 0
  let hasConnector = false

  const out = tokens.map((tok) => {
    if (!/\p{L}/u.test(tok)) return tok // pemisah — biarkan
    contentCount++
    const lower = tok.toLowerCase()
    if (CONNECTORS.has(lower)) {
      hasConnector = true
      return tok
    }
    const hit = dict[lower]
    if (!hit) return tok
    translatedCount++
    return matchCase(tok, hit)
  })

  // Tak satu pun kata dikenali → biarkan namanya apa adanya.
  if (translatedCount === 0) return text

  const words = out.filter((t) => /\p{L}/u.test(t))

  // Urutan kata benda majemuk berlawanan antara kedua bahasa: "Laporan Transaksi
  // Instrumen" ↔ "Instrument Transaction Report". Pembalikan hanya dilakukan saat
  // SELURUH kata dikenali, tidak ada kata sambung, dan panjangnya 2–4 kata — di
  // luar itu hasilnya lebih sering merusak daripada memperbaiki.
  const canReverse =
    translatedCount === contentCount && !hasConnector && words.length >= 2 && words.length <= 4

  if (!canReverse) return out.join("")

  const reversed = [...words].reverse()
  let i = 0
  return out.map((t) => (/\p{L}/u.test(t) ? matchCase(t, reversed[i++].toLowerCase()) : t)).join("")
}

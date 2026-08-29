/**
 * Pemformat khas modul Nafsul.
 *
 * Locale TIDAK dipatok ke "id-ID": nama bulan ikut bahasa yang sedang dipilih,
 * jadi pemanggilnya mengoper hasil `localeOf(lang)` dari `@/lib/i18n`.
 */
export function formatDate(value: string | null | undefined, locale = "id-ID"): string {
  if (!value) return "-";

  // "YYYY-MM-DD" polos ditafsirkan JavaScript sebagai tengah malam UTC, lalu
  // ditampilkan dalam zona waktu peramban. Di zona berselisih negatif (mis.
  // peramban yang disetel UTC-5) tanggalnya mundur sehari — dan pada daftar
  // kuitansi, tanggal yang meleset sehari adalah kesalahan yang tidak terlihat
  // sebagai kesalahan. Menempelkan "T00:00:00" tanpa "Z" membuatnya dibaca
  // sebagai waktu LOKAL, sehingga tanggalnya tampil apa adanya.
  //
  // Nilai bertanda waktu penuh (`created_at`) tidak tersentuh: ia memang
  // menunjuk satu titik waktu, dan menerjemahkannya ke zona pembaca benar.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Rupiah — mata uangnya tetap IDR apa pun bahasanya (nilainya memang rupiah),
 * hanya pemisah ribuan & letak simbol yang mengikuti locale.
 */
export function formatCurrency(
  value: string | number | null | undefined,
  locale = "id-ID"
): string {
  if (value === null || value === undefined) return "-";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

/**
 * Kode jenis kelamin dari database → KUNCI kamus, bukan kalimat jadi.
 *
 * Nilainya diterjemahkan saat render (`t(kunciJenisKelamin(x))`) supaya ikut
 * berganti ketika bahasa diubah. Mengembalikan null bila kodenya kosong /
 * tidak dikenal, agar pemanggil bisa menampilkan sel kosong sendiri.
 */
export function kunciJenisKelamin(value: string | null | undefined): string | null {
  if (value === "L") return "nafsulCommon.male";
  if (value === "P") return "nafsulCommon.female";
  return null;
}

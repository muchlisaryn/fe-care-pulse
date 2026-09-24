import type { jsPDF } from "jspdf";
import type { Anggota } from "./types";

/**
 * Kartu peserta "Nafsul Mutmainnah" RS Islam Jakarta Pondok Kopi, dua sisi,
 * untuk kertas STRIP berisi 4 kartu (±CR80, 85,6 × 54 mm) — dibuat sebagai
 * PDF supaya bisa DIPRATINJAU dulu sebelum dicetak:
 *
 * - Depan    — identitas anggota, kalimat pendaftaran, kotak foto, tanggal &
 *              jabatan penanda tangan.
 * - Belakang — logo RS, "KARTU PESERTA", nama unit, alamat & telepon RS.
 *
 * Bolak-balik, dua kali cetak: sisi depan dulu, lalu kertasnya dibalik dan
 * dimasukkan lagi untuk sisi belakang. Kedua cetakan memakai slot yang sama,
 * jadi sisi belakang jatuh tepat di balik sisi depannya — satu kartu per
 * anggota, satu strip = 4 anggota. Latar biru tidak digambar — warnanya sudah
 * dari kertasnya.
 *
 * Isi kartu SENGAJA berbahasa Indonesia baku dan tidak lewat kamus i18n: ini
 * dokumen resmi, nama lembaga ("Bimbingan Rohani", "Ka Sie Nafsul Mutmainnah")
 * dan kalimat pendaftarannya adalah teks tetap yang tak boleh ikut berganti saat
 * bahasa antarmuka diubah. Hanya label tombol & pratinjaunya yang diterjemahkan.
 */

// Bulan versi Indonesia dieja manual agar PERSIS seperti kartu acuan:
// "15-Mei-1958", "05-Nop-2025" — perhatikan "Mei" & "Nop" (bukan "May"/"Nov").
const BULAN_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nop", "Des",
];
const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "YYYY-MM-DD" (atau bertanda waktu) → Date lokal, tanpa geser zona waktu. */
function keTanggal(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}/.test(value)
    ? new Date(`${value.slice(0, 10)}T00:00:00`)
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "05-Nop-2025". */
function singkatDari(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${BULAN_SINGKAT[d.getMonth()]}-${d.getFullYear()}`;
}

/** "15-Mei-1958". Mengembalikan "-" bila tanggal kosong/tidak valid. */
function tanggalSingkat(value: string | null | undefined): string {
  const d = keTanggal(value);
  return d ? singkatDari(d) : "-";
}

/** "05-November-2025". */
function tanggalPanjang(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${BULAN_PANJANG[d.getMonth()]}-${d.getFullYear()}`;
}

/**
 * Tata letak strip, dalam milimeter. Diukur dari foto kertasnya — bila hasil
 * cetak bergeser, cukup ubah angka di sini (GESER_* untuk menggeser semuanya
 * sekaligus tanpa mengubah ukuran kartu).
 */
const STRIP = {
  lebar: 103,
  kartuLebar: 85.6,
  kartuTinggi: 54,
  /** Jarak tepi kiri kertas ke tepi kiri kartu. */
  kiri: 8.7,
  /** Jarak tepi atas kertas ke kartu pertama (sama dengan sisa di bawah kartu ke-4). */
  atas: 5,
  /** Celah antara dua kartu yang berurutan. */
  jarak: 8,
  perLembar: 4,
};
const GESER_X = 0;
const GESER_Y = 0;

/**
 * Ukuran halaman PDF — A4, dengan strip rata tengah mendatar & rapat ke atas.
 *
 * Halaman SENGAJA tidak dibuat seukuran strip: printer mengumpankan strip di
 * tengah baki, sedangkan halaman berukuran strip dicetak rata kiri oleh
 * driver. Cetak dengan kertas A4 & skala "Ukuran sebenarnya" / 100% agar
 * ukuran kartunya tidak ikut diperbesar/diperkecil.
 */
const KERTAS = { lebar: 210, tinggi: 297 };
const KIRI_STRIP = (KERTAS.lebar - STRIP.lebar) / 2;

/** pt → mm. */
const PT = 25.4 / 72;
/** Jarak baris = 1,2 × ukuran huruf, seperti kartu acuan. */
const tinggiBaris = (pt: number) => pt * 1.2 * PT;

const WARNA_TEKS = 17; // #111

/** Posisi pojok kiri-atas kartu ke-`k` (0-based) di halaman. */
const posisiKartu = (k: number) => ({
  x: GESER_X + KIRI_STRIP + STRIP.kiri,
  y: GESER_Y + STRIP.atas + k * (STRIP.kartuTinggi + STRIP.jarak),
});

/**
 * Pecah teks ke beberapa baris selebar `lebar`, paling banyak `maks` baris;
 * baris terakhir diberi "…" bila masih ada sisa yang terpotong.
 */
function pecahBaris(doc: jsPDF, teks: string, lebar: number, maks: number): string[] {
  const semua: string[] = doc.splitTextToSize(teks, lebar);
  if (semua.length <= maks) return semua;

  const baris = semua.slice(0, maks);
  let akhir = baris[maks - 1];
  while (akhir.length > 0 && doc.getTextWidth(`${akhir}…`) > lebar) {
    akhir = akhir.slice(0, -1);
  }
  baris[maks - 1] = `${akhir.trimEnd()}…`;
  return baris;
}

/** Tulis teks rata tengah; ukurannya dikecilkan bila tidak muat selebar `lebar`. */
function tengahPas(doc: jsPDF, teks: string, cx: number, y: number, lebar: number, pt: number) {
  let ukuran = pt;
  doc.setFontSize(ukuran);
  while (doc.getTextWidth(teks) > lebar && ukuran > 4) {
    ukuran -= 0.25;
    doc.setFontSize(ukuran);
  }
  doc.text(teks, cx, y, { align: "center", baseline: "top" });
}

/** Bingkai kartu — ikut dicetak, seperti kartu acuan. */
function bingkai(doc: jsPDF, x: number, y: number) {
  const tebal = 0.5;
  doc.setLineWidth(tebal);
  doc.setDrawColor(34);
  // Garis PDF digambar di TENGAH lintasan; digeser setengah tebalnya supaya
  // tepi luarnya tetap tepat di ukuran kartu.
  doc.roundedRect(
    x + tebal / 2,
    y + tebal / 2,
    STRIP.kartuLebar - tebal,
    STRIP.kartuTinggi - tebal,
    3,
    3,
    "S",
  );
}

/** Sisi depan satu kartu, pojok kiri-atasnya di (x, y). */
function gambarDepan(doc: jsPDF, a: Anggota, x: number, y: number) {
  const PAD = { atas: 3, samping: 4.5, bawah: 2.5 };
  const UKURAN = 7;
  const lh = tinggiBaris(UKURAN);

  const xLabel = x + PAD.samping;
  const xSep = xLabel + 19;
  const xNilai = xSep + 3;
  const lebarNilai = STRIP.kartuLebar - PAD.samping * 2 - 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(UKURAN);
  doc.setTextColor(WARNA_TEKS);

  // Tanggal terdaftar = tgl_aktif; bila kosong pakai hari ini agar kartu tetap
  // tercetak lengkap. Tanggal yang sama dipakai untuk kalimat pendaftaran &
  // baris "Jakarta, ...".
  const tglDaftar = keTanggal(a.tgl_aktif) ?? new Date();

  // Alamat dibatasi TIGA baris supaya kartu tidak meluap ke celah — baris
  // ketiga masih muat di ruang kosong di atas kotak foto. Isian lain dua baris.
  const baris: [string, string, number][] = [
    ["No Peserta", a.no_anggota ?? "-", 2],
    ["Nama", a.nama ?? "-", 2],
    ["Tempat Lahir", a.kotaLahir?.nama ?? "-", 2],
    ["Tgl Lahir", tanggalSingkat(a.tgl_lahir), 1],
    ["Alamat", a.alamat?.trim() || "-", 3],
    ["Telepon", a.telepon?.trim() || "-", 1],
  ];

  let cy = y + PAD.atas;
  for (const [label, nilai, maks] of baris) {
    const isi = pecahBaris(doc, nilai, lebarNilai, maks);
    doc.text(label, xLabel, cy, { baseline: "top" });
    doc.text(":", xSep, cy, { baseline: "top" });
    doc.text(isi, xNilai, cy, { baseline: "top", lineHeightFactor: 1.2 });
    cy += isi.length * lh;
  }

  cy += 1;
  doc.text(
    [
      "Telah Terdaftar Sebagai Peserta Unit Layanan Jenazah",
      `“Nafsul Mutmainnah” Pada Tanggal : ${singkatDari(tglDaftar)}`,
    ],
    xLabel,
    cy,
    { baseline: "top", lineHeightFactor: 1.2 },
  );

  // Bagian bawah: kotak foto di kiri, tanggal & jabatan di kanannya.
  const FOTO = { lebar: 14, tinggi: 15 };
  const yFoto = y + STRIP.kartuTinggi - PAD.bawah - FOTO.tinggi;
  doc.setLineWidth(0.25);
  doc.setDrawColor(51);
  doc.rect(xLabel, yFoto, FOTO.lebar, FOTO.tinggi, "S");

  const xTtd = xLabel + FOTO.lebar + 4 + 2;
  doc.text(`Jakarta, ${tanggalPanjang(tglDaftar)}`, xTtd, yFoto, { baseline: "top" });
  doc.text("Ka Sie Nafsul Mutmainnah", xTtd, yFoto + FOTO.tinggi, { baseline: "bottom" });

  bingkai(doc, x, y);
}

/** Sisi belakang — sama untuk semua anggota. */
function gambarBelakang(doc: jsPDF, logo: string | null, x: number, y: number) {
  const PAD = { atas: 2, samping: 3, bawah: 1.5 };
  const cx = x + STRIP.kartuLebar / 2;
  const lebar = STRIP.kartuLebar - PAD.samping * 2;
  let cy = y + PAD.atas;

  const LOGO = 19;
  if (logo) doc.addImage(logo, "PNG", cx - LOGO / 2, cy, LOGO, LOGO);
  cy += LOGO + 1.5;

  doc.setTextColor(WARNA_TEKS);

  // [teks, font, ukuran pt]
  const baris: [string, "helvetica" | "times", number][] = [
    ["KARTU PESERTA", "helvetica", 9],
    ["UNIT LAYANAN “NAFSUL MUTHMAINNAH”", "helvetica", 10.5],
    ["RUMAH SAKIT ISLAM JAKARTA PONDOK KOPI", "times", 7.5],
    ["UNIT LAYANAN “NAFSUL MUTHMAINNAH”", "times", 7.5],
    ["Jl. Raya Pondok Kopi - Jakarta Timur 13460", "helvetica", 7.3],
    ["Telp. 8610471, 8630654 (Hunting) Fax. 8611101", "helvetica", 7.3],
  ];
  for (const [teks, font, pt] of baris) {
    doc.setFont(font, "bold");
    tengahPas(doc, teks, cx, cy, lebar, pt);
    cy += tinggiBaris(pt);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("Form-PK-75000.029", x + PAD.samping, y + STRIP.kartuTinggi - PAD.bawah, {
    baseline: "bottom",
  });

  bingkai(doc, x, y);
}

let logoCache: Promise<string | null> | null = null;

/**
 * Logo RS sebagai PNG berlatar transparan yang sudah dipotong melingkar.
 * Logonya JPG berlatar putih: tanpa dipotong, pojok putihnya jadi kotak di
 * atas kertas biru. Gagal dimuat → kartu tetap dibuat tanpa logo.
 */
function logoBulat(): Promise<string | null> {
  logoCache ??= new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      // "object-fit: cover" — ambil bujur sangkar di tengah gambar.
      const sisi = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = sisi;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      ctx.beginPath();
      ctx.arc(sisi / 2, sisi / 2, sisi / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        img,
        (img.naturalWidth - sisi) / 2,
        (img.naturalHeight - sisi) / 2,
        sisi,
        sisi,
        0,
        0,
        sisi,
        sisi,
      );
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      logoCache = null; // coba lagi pada pembuatan berikutnya
      resolve(null);
    };
    img.src = "/logo_rsijpk_kartu.jpg";
  });
  return logoCache;
}

export type SisiKartu = "depan" | "belakang";

/**
 * Buat PDF SATU sisi kartu satu atau beberapa anggota, satu kartu per anggota
 * dari kartu paling atas. Sisi belakang dibuat dengan daftar & `mulaiDari`
 * yang sama seperti sisi depannya, agar jumlah & posisinya berpasangan.
 *
 * `mulaiDari` (1–4) = posisi kartu pertama di strip pertama — supaya strip yang
 * sebagian kartunya sudah terpakai tetap bisa dihabiskan, bukan dibuang.
 */
export async function buatPdfKartuAnggota(
  daftar: Anggota | Anggota[],
  sisi: SisiKartu,
  mulaiDari = 1,
): Promise<Blob> {
  const anggota = Array.isArray(daftar) ? daftar : [daftar];

  // Dimuat saat dibutuhkan saja — jsPDF cukup besar untuk ikut di bundel awal.
  const [{ jsPDF }, logo] = await Promise.all([
    import("jspdf"),
    sisi === "belakang" ? logoBulat() : Promise.resolve(null),
  ]);

  const doc = new jsPDF({ unit: "mm", format: [KERTAS.lebar, KERTAS.tinggi] });

  const label = sisi === "depan" ? "Depan" : "Belakang";
  doc.setProperties({
    title:
      anggota.length === 1
        ? `Kartu Peserta ${anggota[0].nama ?? ""} - ${label}`
        : `Kartu Peserta (${anggota.length}) - ${label}`,
  });

  // Slot yang dilewati tidak digambar, tapi posisinya tetap dihitung agar
  // kartu berikutnya jatuh di tempat yang benar.
  const lewati = Math.min(Math.max(Math.trunc(mulaiDari) || 1, 1), STRIP.perLembar) - 1;

  anggota.forEach((a, i) => {
    const slot = lewati + i;
    const k = slot % STRIP.perLembar;
    if (slot > 0 && k === 0) doc.addPage();

    const { x, y } = posisiKartu(k);
    if (sisi === "depan") gambarDepan(doc, a, x, y);
    else gambarBelakang(doc, logo, x, y);
  });

  return doc.output("blob");
}

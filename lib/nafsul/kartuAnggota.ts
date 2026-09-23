import type { Anggota } from "./types";

/**
 * Cetak kartu peserta "Nafsul Mutmainnah" RS Islam Jakarta Pondok Kopi, dua
 * sisi, ke kertas STRIP berisi 4 kartu (±CR80, 85,6 × 54 mm):
 *
 * - Depan    — identitas anggota, kalimat pendaftaran, kotak foto, tanggal &
 *              jabatan penanda tangan.
 * - Belakang — logo RS, "KARTU PESERTA", nama unit, alamat & telepon RS.
 *
 * Kedua sisi dicetak di SATU halaman, bersebelahan dalam strip: kartu depan
 * lalu kartu belakangnya tepat di bawahnya — tinggal digunting & dilaminasi
 * berpasangan, tanpa cetak bolak-balik. Satu strip (4 kartu) = 2 anggota.
 * Latar biru tidak ikut dicetak — warnanya sudah dari kertasnya.
 *
 * Isi kartu SENGAJA berbahasa Indonesia baku dan tidak lewat kamus i18n: ini
 * dokumen resmi, nama lembaga ("Bimbingan Rohani", "Ka Sie Nafsul Mutmainnah")
 * dan kalimat pendaftarannya adalah teks tetap yang tak boleh ikut berganti saat
 * bahasa antarmuka diubah. Hanya label tombol pemicunya yang diterjemahkan.
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

const TINGGI_KERTAS =
  STRIP.atas * 2 + STRIP.perLembar * STRIP.kartuTinggi + (STRIP.perLembar - 1) * STRIP.jarak;

/** Baris "Label : Nilai" pada bagian identitas kartu. */
function baris(label: string, nilai: string, kelas = ""): string {
  return `
    <div class="row">
      <span class="lbl">${escapeHtml(label)}</span>
      <span class="sep">:</span>
      <span class="val ${kelas}">${escapeHtml(nilai)}</span>
    </div>`;
}

/** Isi sisi depan satu kartu. */
function isiKartu(a: Anggota): string {
  // Tanggal terdaftar = tgl_aktif; bila kosong pakai hari ini agar kartu tetap
  // tercetak lengkap. Tanggal yang sama dipakai untuk kalimat pendaftaran &
  // baris "Jakarta, ...".
  const tglDaftar = keTanggal(a.tgl_aktif) ?? new Date();

  return `
    ${baris("No Peserta", a.no_anggota ?? "-")}
    ${baris("Nama", a.nama ?? "-")}
    ${baris("Tempat Lahir", a.kota_lahir?.nama ?? "-")}
    ${baris("Tgl Lahir", tanggalSingkat(a.tgl_lahir))}
    ${baris("Alamat", a.alamat?.trim() || "-", "alamat")}
    ${baris("Telepon", a.telepon?.trim() || "-")}

    <div class="daftar">
      Telah Terdaftar Sebagai Peserta Unit Layanan Jenazah<br />
      &ldquo;Nafsul Mutmainnah&rdquo; Pada Tanggal : ${escapeHtml(singkatDari(tglDaftar))}
    </div>

    <div class="footer">
      <div class="foto"></div>
      <div class="ttd">
        <div>Jakarta, ${escapeHtml(tanggalPanjang(tglDaftar))}</div>
        <div class="jabatan">Ka Sie Nafsul Mutmainnah</div>
      </div>
    </div>`;
}

/**
 * Isi sisi belakang — sama untuk semua anggota. Logo diambil dari aset aplikasi
 * dengan alamat absolut: jendela cetaknya kosong (about:blank), jalur relatif
 * tidak akan ketemu.
 */
function isiBelakang(): string {
  return `
    <img class="logo" src="${window.location.origin}/logo_rsijpk_kartu.jpg" alt="" />
    <div class="judul">KARTU PESERTA</div>
    <div class="unit">UNIT LAYANAN &ldquo;NAFSUL MUTHMAINNAH&rdquo;</div>
    <div class="rs">RUMAH SAKIT ISLAM JAKARTA PONDOK KOPI</div>
    <div class="rs">UNIT LAYANAN &ldquo;NAFSUL MUTHMAINNAH&rdquo;</div>
    <div class="alamat-rs">Jl. Raya Pondok Kopi - Jakarta Timur 13460</div>
    <div class="alamat-rs">Telp. 8610471, 8630654 (Hunting) Fax. 8611101</div>
    <div class="form">Form-PK-75000.029</div>`;
}

/** Jarak tepi atas kertas ke kartu ke-`k` (0-based) di strip. */
const atasKartu = (k: number) => GESER_Y + STRIP.atas + k * (STRIP.kartuTinggi + STRIP.jarak);

/**
 * Cetak kartu satu atau beberapa anggota. Tiap anggota memakai dua kartu
 * berurutan di strip (depan, lalu belakang), dari kartu paling atas.
 *
 * `mulaiDari` (1–4) = posisi kartu pertama di strip pertama — supaya strip yang
 * sebagian kartunya sudah terpakai tetap bisa dihabiskan, bukan dibuang.
 */
export function cetakKartuAnggota(daftar: Anggota | Anggota[], mulaiDari = 1): void {
  const anggota = Array.isArray(daftar) ? daftar : [daftar];
  if (anggota.length === 0) return;

  const lewati = Math.min(Math.max(Math.trunc(mulaiDari) || 1, 1), STRIP.perLembar) - 1;
  // Slot yang dilewati berisi `null`: tidak dicetak, tapi posisinya tetap
  // dihitung agar kartu berikutnya jatuh di tempat yang benar.
  const slot: (string | null)[] = [
    ...Array<null>(lewati).fill(null),
    ...anggota.flatMap((a) => [
      `<div class="kartu depan" style="{POS}">${isiKartu(a)}</div>`,
      `<div class="kartu belakang" style="{POS}">${isiBelakang()}</div>`,
    ]),
  ];

  const lembar: string[] = [];
  for (let i = 0; i < slot.length; i += STRIP.perLembar) {
    const kartu = slot.slice(i, i + STRIP.perLembar).map((html, k) => {
      const pos = `top:${atasKartu(k)}mm;left:${GESER_X + STRIP.kiri}mm`;
      return html
        ? html.replace("{POS}", pos)
        : `<div class="kartu kosong" style="${pos}"></div>`;
    });
    lembar.push(`<div class="lembar">${kartu.join("")}</div>`);
  }

  const judul =
    anggota.length === 1
      ? `Kartu Peserta ${escapeHtml(anggota[0].nama ?? "")}`
      : `Kartu Peserta (${anggota.length})`;

  const w = window.open("", "_blank", "width=520,height=900");
  if (!w) return;

  w.document.write(`
    <html>
      <head>
        <title>${judul}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111;
            background: #e5e7eb;
          }
          .lembar {
            position: relative;
            width: ${STRIP.lebar}mm;
            height: ${TINGGI_KERTAS}mm;
            margin: 6mm auto;
            background: #fff;
            overflow: hidden;
          }
          .kartu {
            position: absolute;
            width: ${STRIP.kartuLebar}mm;
            height: ${STRIP.kartuTinggi}mm;
            padding: 3mm 4.5mm 2.5mm;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-size: 7pt;
            line-height: 1.2;
            /* Bingkai kartu ikut dicetak, seperti kartu acuan. Latar biru hanya
               di layar — warnanya sudah dari kertasnya. */
            border: 0.5mm solid #222;
            border-radius: 3mm;
            background: #eaf6f4;
          }
          /* Slot yang dilewati: hanya penanda di layar, kosong di kertas. */
          .kartu.kosong {
            border: 0.3mm dashed #94a3b8;
            background: repeating-linear-gradient(45deg, #fff, #fff 2mm, #f1f5f9 2mm, #f1f5f9 4mm);
          }
          .row { display: flex; }
          .row .lbl { width: 19mm; flex: none; }
          .row .sep { width: 3mm; flex: none; }
          .row .val { flex: 1; min-width: 0; }
          /* Alamat panjang dibatasi dua baris supaya kartu tidak meluap ke celah. */
          .row .val.alamat {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .daftar { margin-top: 1mm; }
          .footer {
            margin-top: auto;
            display: flex;
            align-items: stretch;
            gap: 4mm;
          }
          .foto {
            width: 14mm;
            height: 15mm;
            flex: none;
            border: 0.25mm solid #333;
          }
          .ttd {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding-left: 2mm;
          }
          .belakang {
            align-items: center;
            text-align: center;
            padding: 2mm 3mm 1.5mm;
            font-weight: 700;
            line-height: 1.2;
          }
          .belakang .logo {
            width: 19mm;
            height: 19mm;
            object-fit: cover;
            /* Logonya JPG berlatar putih: dipotong melingkar supaya pojok
               putihnya tidak jadi kotak di atas kertas biru. */
            border-radius: 50%;
            margin-bottom: 1.5mm;
          }
          .belakang .judul { font-size: 9pt; }
          .belakang .unit {
            font-family: "Arial Narrow", Arial, Helvetica, sans-serif;
            font-size: 10.5pt;
            letter-spacing: -0.1pt;
          }
          .belakang .rs {
            font-family: "Times New Roman", Times, serif;
            font-size: 7.5pt;
          }
          .belakang .alamat-rs { font-size: 7.3pt; }
          .belakang .form {
            align-self: flex-start;
            margin-top: auto;
            font-size: 6pt;
          }
          @page { size: ${STRIP.lebar}mm ${TINGGI_KERTAS}mm; margin: 0; }
          @media print {
            body { background: none; }
            .lembar { margin: 0; page-break-after: always; break-after: page; }
            .lembar:last-child { page-break-after: auto; break-after: auto; }
            .kartu { background: none; }
            .kartu.kosong { border: none; }
          }
        </style>
      </head>
      <body>
        ${lembar.join("")}
        <script>
          // Tunggu logo selesai dimuat — tanpa ini dialog cetak bisa muncul
          // lebih dulu dan sisi belakang tercetak tanpa logo.
          Promise.all(
            Array.from(document.images).map((img) =>
              img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
            )
          ).then(() => { window.focus(); window.print(); });
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

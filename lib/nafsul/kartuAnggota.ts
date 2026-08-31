import type { Anggota } from "./types";

/**
 * Cetak kartu peserta "Nafsul Mutmainnah" — reproduksi kartu fisik berlaminasi
 * yang dibagikan RS Islam Jakarta Pondok Kopi (lihat foto acuan). Ukuran kartu
 * CR80 (85,6 × 54 mm), sama seperti KTP.
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

/** Baris "Label : Nilai" pada bagian identitas kartu. */
function baris(label: string, nilai: string): string {
  return `
    <div class="row">
      <span class="lbl">${escapeHtml(label)}</span>
      <span class="sep">:</span>
      <span class="val">${escapeHtml(nilai)}</span>
    </div>`;
}

export function cetakKartuAnggota(a: Anggota): void {
  // Tanggal terdaftar = tgl_aktif; bila kosong pakai hari ini agar kartu tetap
  // tercetak lengkap. Tanggal yang sama dipakai untuk kalimat pendaftaran &
  // baris "Jakarta, ...".
  const tglDaftar = keTanggal(a.tgl_aktif) ?? new Date();

  const noPeserta = a.no_anggota ?? "-";
  const nama = a.nama ?? "-";
  const tempatLahir = a.kota_lahir?.nama ?? "-";
  const tglLahir = tanggalSingkat(a.tgl_lahir);
  const alamat = a.alamat?.trim() || "-";
  const telepon = a.telepon?.trim() || "-";

  const w = window.open("", "_blank", "width=620,height=440");
  if (!w) return;

  w.document.write(`
    <html>
      <head>
        <title>Kartu Peserta ${escapeHtml(nama)}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #1a2733;
            padding: 10mm;
            background: #fff;
          }
          .kartu {
            width: 85.6mm;
            min-height: 54mm;
            border: 1px solid #9fb3c8;
            border-radius: 3mm;
            padding: 4mm 4.5mm;
            background: #eef4f6;
            display: flex;
            flex-direction: column;
          }
          .ident { font-size: 8pt; line-height: 1.3; }
          .row { display: flex; }
          .row .lbl { width: 20mm; flex: none; }
          .row .sep { width: 3mm; flex: none; }
          .row .val { flex: 1; min-width: 0; font-weight: 600; }
          .daftar {
            margin-top: 2mm;
            font-size: 7.6pt;
            line-height: 1.35;
          }
          .daftar .kutip { font-weight: 700; }
          .footer {
            /* Didorong ke dasar kartu; bila isi identitas panjang, kartu tumbuh
               ke bawah alih-alih menindih teks pendaftaran. */
            margin-top: auto;
            padding-top: 2.5mm;
            display: flex;
            align-items: flex-end;
            gap: 3mm;
          }
          .foto {
            width: 16mm;
            height: 16mm;
            flex: none;
            border: 1px solid #7d94a8;
            background: #fff;
          }
          .ttd {
            font-size: 7.6pt;
            line-height: 1.4;
            flex: 1;
          }
          /* Ruang untuk tanda tangan/stempel basah manual di kartu fisik. */
          .ttd .jabatan { margin-top: 9mm; }
          @page { size: auto; margin: 0; }
          @media print {
            body { padding: 6mm; }
            .kartu { box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="kartu">
          <div class="ident">
            ${baris("No Peserta", noPeserta)}
            ${baris("Nama", nama)}
            ${baris("Tempat Lahir", tempatLahir)}
            ${baris("Tgl Lahir", tglLahir)}
            ${baris("Alamat", alamat)}
            ${baris("Telepon", telepon)}
          </div>

          <div class="daftar">
            Telah Terdaftar Sebagai Peserta Unit Layanan Jenazah
            <span class="kutip">&ldquo;Nafsul Mutmainnah&rdquo;</span>
            Pada Tanggal : ${escapeHtml(singkatDari(tglDaftar))}
          </div>

          <div class="footer">
            <div class="foto"></div>
            <div class="ttd">
              <div>Jakarta, ${escapeHtml(tanggalPanjang(tglDaftar))}</div>
              <div class="jabatan">Ka Sie Nafsul Mutmainnah</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  w.document.close();
  w.focus();
  w.print();
}

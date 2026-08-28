"use client";

import { useEffect, useRef, useState } from "react";
// SheetJS CE ("xlsx") mengabaikan style saat menulis file; fork ini API-nya
// sama persis tapi ikut menulis fill/font, dipakai untuk menyorot kolom wajib.
import * as XLSX from "xlsx-js-style";
import { Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Modal } from "@/components/molecules/Modal";
import { useT } from "@/lib/i18n";


/**
 * Jumlah baris yang dikirim ke server dalam satu permintaan. File besar tidak
 * diunggah sekaligus: dipecah per batch supaya progres bisa ditampilkan dan
 * satu permintaan gagal tidak menjatuhkan seluruh impor.
 */
const BATCH_SIZE = 10;

/**
 * Satu kolom template Excel → satu field API.
 *
 * `diTemplate: false` menandai kolom yang **tidak** dicetak di file template
 * tapi tetap dipetakan saat file dibaca — dipakai untuk kolom yang hanya boleh
 * kosong (mis. `id`), supaya file yang terlanjur memuatnya tetap terbaca dan
 * ditolak server dengan pesan yang jelas, bukan diabaikan diam-diam.
 */
export interface ImportColumn {
  header: string;
  field: string;
  contoh: string;
  diTemplate?: boolean;
  /** Wajib diisi — judulnya diberi latar kuning di file Excel. */
  wajib?: boolean;
}

/**
 * Sheet referensi master di dalam workbook. `idLabel` mengikuti kolom kunci di
 * database — "Kode", "ID", atau kunci lain milik master tersebut.
 */
export interface MasterSheet {
  nama: string;
  idLabel: string;
  rows: string[][];
  /**
   * Judul kolom SETELAH kolom kunci. Bawaan `["Nama"]`.
   *
   * Sebagian master tidak cukup diwakili kode + nama: daftar tarif tanpa
   * harganya memaksa petugas membuka halaman master di tab lain hanya untuk
   * tahu nominal yang harus diketik.
   */
  kolom?: string[];
}

interface ImportExcelModalProps {
  open: boolean;
  onClose: () => void;
  /** Dipanggil setelah impor selesai dengan minimal satu baris berhasil. */
  onSelesai?: () => void;
  /** Judul modal, mis. "Import Anggota dari Excel". */
  judul: string;
  /**
   * Dipakai untuk endpoint (`/{slug}/import`) dan nama file yang diunduh.
   * Mis. "anggota" → `template-import-anggota.xlsx` & `anggota-gagal-import.xlsx`.
   */
  slug: string;
  /** Nama sheet data di file template, mis. "Anggota". */
  sheetUtama: string;
  columns: ImportColumn[];
  /**
   * Kolom yang dicek di browser sebelum baris dikirim — baris tanpa isian ini
   * langsung dicatat gagal tanpa membebani server. Terpisah dari penanda
   * `wajib` di tiap kolom, yang hanya menyorot judulnya di file Excel.
   */
  barisWajib: { field: string; label: string };
  /** Sheet referensi master. Tanpa ini, file hanya berisi sheet data. */
  muatMaster?: () => Promise<MasterSheet[]>;
  /**
   * Kolom yang menyatukan beberapa baris jadi satu kesatuan di server (mis.
   * `kode_kuitansi` pada impor transaksi).
   *
   * Bila diisi, pembagian batch mengikuti batas grup: baris segrup dijamin
   * terkirim dalam permintaan yang sama. Tanpa itu, satu kuitansi yang
   * barisnya terbelah dua permintaan akan tersimpan sebagai dua kuitansi.
   */
  kunciGrup?: string;
  /** Baris per permintaan. Kosongkan untuk memakai bawaan. */
  ukuranBatch?: number;
  /**
   * Sheet DATA kedua yang ikut diunggah dalam file yang sama.
   *
   * Dipakai saat satu impor punya dua tingkat: sheet utama berisi barisnya
   * (mis. rincian iuran), sheet ini berisi indukmya (mis. kuitansi). Keduanya
   * dihubungkan lewat kolom `kunciGrup`.
   *
   * Bedanya dengan `muatMaster`: sheet master hanya rujukan yang dibaca mata
   * pengguna dan tidak pernah dikirim, sedangkan sheet ini ikut dikirim ke
   * server sebagai `payloadField`.
   *
   * Sheet ini tidak dipecah lurus bersama baris: yang ikut di tiap permintaan
   * adalah induk yang DIRUJUK potongan itu (lihat `indukUntuk`). Mengirimnya
   * utuh terlihat lebih sederhana, tapi runtuh pada file besar — sheet induk
   * berisi ribuan baris menembus batas jumlah baris di server sehingga tidak
   * ada satu batch pun yang bisa lewat.
   */
  sheetInduk?: {
    nama: string;
    columns: ImportColumn[];
    payloadField: string;
  };
}

type ParsedRow = Record<string, string | number> & { baris: number };

/** Baris gagal disimpan lengkap dengan data aslinya agar bisa diekspor & dikirim ulang. */
interface GagalRow {
  /**
   * Sheet asal galatnya, mis. "Rincian" atau "Kuitansi".
   *
   * Nomor baris saja tidak cukup begitu satu impor punya dua sheet data: baris
   * 5 sheet Kuitansi dan baris 5 sheet Rincian adalah dua baris berbeda. Tanpa
   * penanda ini galat induk akan dicocokkan ke baris rincian yang kebetulan
   * bernomor sama — datanya salah tunjuk, dan file "gagal impor" menuliskan
   * alasannya di sheet yang keliru.
   */
  sheet: string;
  baris: number;
  nama: string;
  pesan: string;
  row: ParsedRow;
}

interface ImportResponse {
  berhasil: number;
  /**
   * Baris yang SUDAH ada sebelumnya, jadi tidak ditulis ulang.
   *
   * Opsional: hanya impor transaksi yang mengenali keadaan ini. Impor master
   * lain menolak duplikat sebagai galat biasa dan tidak mengirim angka ini.
   */
  dilewati?: number;
  gagal: number;
  hasil: {
    /** Nama sheet asal baris ini. Kosong pada impor satu sheet. */
    sheet?: string;
    baris: number;
    status: "ok" | "gagal" | "lewati";
    nama?: string;
    pesan?: string;
  }[];
}

/** Judul kolom dicocokkan tanpa spasi/tanda baca & tanpa membedakan huruf besar-kecil. */
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const pad = (n: number) => String(n).padStart(2, "0");

/** Sel Excel → teks. Tanggal dipakai apa adanya (tanpa geser zona waktu). */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).trim();
}

/**
 * Satu sheet Excel → daftar baris yang sudah dipetakan ke nama field API.
 *
 * Judul kolom dicocokkan lewat `normalize`, jadi "No. Anggota", "no anggota",
 * dan "no_anggota" sama-sama dikenali — file yang diketik ulang pengguna jarang
 * persis sama dengan templatnya.
 */
function bacaSheet(
  sheet: XLSX.WorkSheet,
  kolom: ImportColumn[]
): ParsedRow[] {
  const fieldByHeader = new Map<string, string>();
  kolom.forEach((c) => {
    fieldByHeader.set(normalize(c.header), c.field);
    fieldByHeader.set(normalize(c.field), c.field);
  });

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  const hasil: ParsedRow[] = [];

  raw.forEach((r, i) => {
    // Baris 1 file Excel dipakai judul kolom, jadi data ke-i ada di baris i+2.
    const row: ParsedRow = { baris: i + 2 };

    Object.entries(r).forEach(([header, value]) => {
      const field = fieldByHeader.get(normalize(header));
      if (field) row[field] = cellToString(value);
    });

    // Baris yang seluruh selnya kosong diabaikan diam-diam.
    const adaIsi = Object.keys(row).some(
      (k) => k !== "baris" && String(row[k]).trim() !== ""
    );
    if (adaIsi) hasil.push(row);
  });

  return hasil;
}

/**
 * Bagi baris jadi beberapa permintaan.
 *
 * Tanpa `kunciGrup`, potongannya lurus sebesar `ukuran`. Dengan `kunciGrup`,
 * baris yang punya nilai kunci sama tidak pernah terpecah ke dua permintaan —
 * server menggabungkannya jadi satu kesatuan (mis. satu kuitansi transaksi),
 * dan grup yang terbelah akan tersimpan sebagai dua kesatuan berbeda.
 *
 * Baris tanpa nilai kunci berdiri sendiri. Grup yang lebih besar dari `ukuran`
 * tetap dikirim utuh dalam satu permintaan — memecahnya justru merusak
 * artinya; batas baris di server dipasang lebih longgar untuk menampungnya.
 */
function bagiBatch(
  rows: ParsedRow[],
  ukuran: number,
  kunciGrup?: string
): ParsedRow[][] {
  if (!kunciGrup) {
    const hasil: ParsedRow[][] = [];
    for (let i = 0; i < rows.length; i += ukuran) hasil.push(rows.slice(i, i + ukuran));
    return hasil;
  }

  // Baris segrup tidak harus berdampingan di file, jadi dikumpulkan dulu lewat
  // Map — urutan penyisipannya menjaga grup tetap muncul sesuai urutan file.
  const grup = new Map<string, ParsedRow[]>();

  rows.forEach((row) => {
    const nilai = String(row[kunciGrup] ?? "").trim();
    // Prefiks "k:" vs "b:" menjaga baris tanpa kunci tetap berdiri sendiri
    // tanpa pernah bertabrakan dengan nilai kunci yang kebetulan sama.
    const kunci = nilai === "" ? `b:${row.baris}` : `k:${nilai}`;
    const isi = grup.get(kunci);
    if (isi) isi.push(row);
    else grup.set(kunci, [row]);
  });

  const hasil: ParsedRow[][] = [];
  let berjalan: ParsedRow[] = [];

  grup.forEach((anggota) => {
    if (berjalan.length > 0 && berjalan.length + anggota.length > ukuran) {
      hasil.push(berjalan);
      berjalan = [];
    }
    berjalan = berjalan.concat(anggota);
  });

  if (berjalan.length > 0) hasil.push(berjalan);

  return hasil;
}

/**
 * Modal impor Excel yang dipakai bersama oleh beberapa master.
 *
 * Alur & tampilannya sama untuk semua: unduh template → unggah file → dikirim
 * per batch dengan progres → baris gagal bisa diekspor atau dikirim ulang.
 * Yang berbeda cuma daftar kolom, endpoint, dan sheet referensinya.
 */
export default function ImportExcelModal({
  open,
  onClose,
  onSelesai,
  judul,
  slug,
  sheetUtama,
  columns,
  barisWajib,
  muatMaster,
  kunciGrup,
  ukuranBatch = BATCH_SIZE,
  sheetInduk,
}: ImportExcelModalProps) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [namaFile, setNamaFile] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  /** Isi sheet induk (mis. Kuitansi) — kosong bila impornya satu tingkat. */
  const [barisInduk, setBarisInduk] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [seret, setSeret] = useState(false);

  const [importing, setImporting] = useState(false);
  const [selesai, setSelesai] = useState(false);
  const [totalAntrian, setTotalAntrian] = useState(0);
  const [totalBatch, setTotalBatch] = useState(0);
  const [batchKe, setBatchKe] = useState(0);
  const [diproses, setDiproses] = useState(0);
  const [berhasil, setBerhasil] = useState(0);
  const [dilewati, setDilewati] = useState(0);
  const [gagal, setGagal] = useState<GagalRow[]>([]);

  const [masters, setMasters] = useState<MasterSheet[] | null>(null);
  const masterDiminta = useRef(false);

  const templateColumns = columns.filter((c) => c.diTemplate !== false);
  // Kolom bertanda `wajib` tidak lagi didaftar ulang di modal: judulnya sudah
  // disorot kuning di file template, dan daftar kedua di layar hanya mengulang
  // hal yang sama sambil mendorong area unggah turun dari pandangan.
  const namaDari = (row: ParsedRow) => String(row[barisWajib.field] ?? "").trim();

  // Master ditarik sekali saat modal dibuka, dipakai sebagai sheet referensi
  // di dalam file template & file baris gagal.
  useEffect(() => {
    // Modal ditutup: penanda dilepas supaya pemuatan yang gagal atau tersendat
    // bisa dicoba lagi cukup dengan menutup lalu membuka modalnya. Sebelumnya
    // penanda ini sekali diangkat tidak pernah turun, jadi sekali gagal berarti
    // gagal seumur halaman.
    if (!open) {
      masterDiminta.current = false;
      return;
    }

    if (masterDiminta.current) return;

    masterDiminta.current = true;
    if (!muatMaster) {
      setMasters([]);
      return;
    }

    /**
     * Batas waktu pemuatan master.
     *
     * Master hanyalah sheet rujukan — permintaan yang tidak kunjung selesai
     * tidak boleh menyandera tombol Unduh Template selamanya. Setelah batas ini
     * templatnya tetap bisa diunduh, hanya tanpa sheet referensi; kalau
     * permintaannya menyusul selesai, isinya tetap dipasang.
     */
    const batasWaktu = setTimeout(() => setMasters((s) => s ?? []), 15000);

    muatMaster()
      .then(setMasters)
      // Master gagal dimuat bukan alasan memblokir impor — template tetap bisa
      // diunduh, hanya tanpa sheet referensi.
      .catch(() => setMasters([]))
      .finally(() => clearTimeout(batasWaktu));
  }, [open, muatMaster]);

  if (!open) return null;

  // `masters` selalu terisi setelah permintaan selesai (walau gagal → array
  // kosong), jadi null berarti masih dimuat.
  const masterLoading = masters === null;

  const persen = totalAntrian === 0 ? 0 : Math.round((diproses / totalAntrian) * 100);

  // Hanya baris sheet utama yang bisa dikirim ulang: galat sheet induk bukan
  // baris kiriman, melainkan isi `sheetInduk` yang ikut menempel di tiap
  // permintaan — memperbaikinya harus lewat file, bukan tombol kirim ulang.
  const gagalUtama = gagal.filter((g) => g.sheet === sheetUtama);
  const bisaKirimUlang = !importing && gagalUtama.length > 0;

  function reset() {
    setNamaFile("");
    setRows([]);
    setBarisInduk([]);
    setParseError(null);
    setRunError(null);
    setSelesai(false);
    setTotalAntrian(0);
    setTotalBatch(0);
    setBatchKe(0);
    setDiproses(0);
    setBerhasil(0);
    setDilewati(0);
    setGagal([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    reset();
    setNamaFile(file.name);

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });

      // Sheet dicari berdasarkan NAMA lebih dulu, baru jatuh ke sheet pertama
      // yang BUKAN sheet induk.
      //
      // Dua-duanya perlu: file template menamai sheet datanya `sheetUtama`,
      // sedangkan file "baris gagal" menamainya "Gagal" — dan file itu memang
      // dimaksudkan untuk diperbaiki lalu diunggah ulang. Sheet induk harus
      // dikecualikan dari fallback karena ia berada lebih dulu di kedua file.
      const namaLain = wb.SheetNames.find((n) => n !== sheetInduk?.nama);
      const sheet = wb.Sheets[sheetUtama] ?? (namaLain ? wb.Sheets[namaLain] : undefined);
      if (!sheet) {
        setParseError(t("nafsulImport.sheetError"));
        return;
      }

      const terbaca = bacaSheet(sheet, columns);

      if (sheetInduk) {
        const lembarInduk = wb.Sheets[sheetInduk.nama];
        if (!lembarInduk) {
          setParseError(t("nafsulImport.parentSheetMissing", { sheet: sheetInduk.nama }));
          return;
        }
        setBarisInduk(bacaSheet(lembarInduk, sheetInduk.columns));
      }

      setRows(terbaca);
      if (terbaca.length === 0) {
        setParseError(
          t("nafsulImport.noRows")
        );
      }
    } catch {
      setParseError(t("nafsulImport.readError"));
    }
  }

  /**
   * Sheet induk diindeks per nilai kunci, sekali untuk satu kali impor.
   *
   * Dulu seluruh sheet induk dititipkan utuh di tiap permintaan. Itu jalan
   * selama induknya sedikit, tapi runtuh pada file besar: sheet Kuitansi berisi
   * ribuan baris membuat setiap permintaan menembus batas jumlah baris di
   * server, dan biaya kirimnya tumbuh kuadratik karena tiap batch mengulang
   * seluruh induk.
   *
   * Indeksnya dibangun sekali, bukan disaring ulang tiap batch: menyaring
   * seluruh induk sebanyak jumlah batch akan mengganti biaya kuadratik di
   * jaringan dengan biaya kuadratik di browser.
   */
  function indeksInduk(): {
    perKunci: Map<string, ParsedRow[]>;
    tanpaKunci: ParsedRow[];
  } {
    const perKunci = new Map<string, ParsedRow[]>();
    const tanpaKunci: ParsedRow[] = [];

    if (!kunciGrup) return { perKunci, tanpaKunci };

    barisInduk.forEach((row) => {
      const kunci = String(row[kunciGrup] ?? "").trim();

      if (kunci === "") {
        tanpaKunci.push(row);

        return;
      }

      const isi = perKunci.get(kunci);
      if (isi) isi.push(row);
      else perKunci.set(kunci, [row]);
    });

    return { perKunci, tanpaKunci };
  }

  /**
   * Galat API → kalimat yang menyebut penyebabnya.
   *
   * `message` sebuah 422 dari Laravel selalu kalimat generik yang sama ("Data
   * yang dikirim tidak valid"), sedangkan yang menjelaskan justru ada di
   * `errors`. Menampilkan `message` saja membuat setiap kegagalan validasi
   * terlihat identik dan mustahil ditelusuri.
   */
  function rincianGalat(err: ApiError): string {
    const rinci = Object.values(err.errors ?? {})
      .flat()
      .filter(Boolean);

    return rinci.length > 0 ? `${err.message} ${rinci.join(" ")}` : err.message;
  }

  /** Jalankan impor untuk sekumpulan baris — dipakai impor awal maupun kirim ulang. */
  async function prosesImport(daftar: ParsedRow[]) {
    const denganNama = daftar.filter((r) => namaDari(r) !== "");
    const tanpaNama = daftar.filter((r) => namaDari(r) === "");
    const batches = bagiBatch(denganNama, ukuranBatch, kunciGrup);

    setImporting(true);
    setSelesai(false);
    setRunError(null);
    setTotalAntrian(daftar.length);
    setTotalBatch(batches.length);
    setBatchKe(0);
    setBerhasil(0);
    setDilewati(0);
    // Baris tanpa kolom wajib tidak perlu dikirim ke server — langsung dicatat gagal.
    setDiproses(tanpaNama.length);
    setGagal(
      tanpaNama.map((row) => ({
        sheet: sheetUtama,
        baris: row.baris,
        nama: "",
        pesan: `${barisWajib.label} wajib diisi.`,
        row,
      }))
    );

    let sukses = 0;
    let dilewat = 0;
    let batch = 0;
    let terkirim = 0;

    const induk = indeksInduk();

    try {
      for (const potongan of batches) {
        batch += 1;
        setBatchKe(batch);

        // Hanya induk yang DIRUJUK potongan ini. Baris induk tanpa nilai kunci
        // tidak bisa dicocokkan ke rincian mana pun tapi tetap salah, jadi
        // dititipkan sekali — pada batch pertama.
        const kunciBatch = kunciGrup
          ? [...new Set(potongan.map((r) => String(r[kunciGrup] ?? "").trim()))]
          : [];

        const indukBatch = kunciGrup
          ? [
              ...(batch === 1 ? induk.tanpaKunci : []),
              ...kunciBatch
                .filter((k) => k !== "")
                .flatMap((k) => induk.perKunci.get(k) ?? []),
            ]
          : barisInduk;

        const res = await api<ImportResponse>(`/${slug}/import`, {
          method: "POST",
          body: sheetInduk
            ? { rows: potongan, [sheetInduk.payloadField]: indukBatch }
            : { rows: potongan },
        });

        sukses += res.berhasil;
        setBerhasil(sukses);

        dilewat += res.dilewati ?? 0;
        setDilewati(dilewat);

        const gagalBatch = res.hasil
          .filter((h) => h.status === "gagal")
          .map((h) => {
            // Galat sheet induk dicocokkan ke baris sheet INDUK-nya, bukan ke
            // potongan rincian yang sedang dikirim — nomor barisnya milik sheet
            // yang berbeda.
            const dariInduk = !!sheetInduk && h.sheet === sheetInduk.nama;
            const sumber = dariInduk ? barisInduk : potongan;
            const asal = sumber.find((r) => r.baris === h.baris);
            return {
              sheet: dariInduk && h.sheet ? h.sheet : sheetUtama,
              baris: h.baris,
              nama: h.nama ?? "",
              pesan: h.pesan ?? t("nafsulImport.saveFailed"),
              row: asal ?? ({ baris: h.baris } as ParsedRow),
            };
          });
        // Satu baris induk bisa dirujuk beberapa batch, jadi galatnya bisa
        // terlapor lebih dari sekali. Yang kedua dan seterusnya dibuang di sini
        // supaya daftar galat & angkanya tidak menggelembung.
        if (gagalBatch.length) {
          setGagal((g) => {
            const sudahAda = new Set(g.map((x) => `${x.sheet}#${x.baris}`));

            return [
              ...g,
              ...gagalBatch.filter((x) => !sudahAda.has(`${x.sheet}#${x.baris}`)),
            ];
          });
        }

        terkirim += potongan.length;
        setDiproses(tanpaNama.length + terkirim);
      }

      setSelesai(true);
      if (sukses > 0) onSelesai?.();
    } catch (err) {
      // Impor dihentikan: baris yang sudah terkirim tetap tersimpan di server.
      setRunError(
        err instanceof ApiError
          ? `Impor berhenti pada batch ${batch} dari ${batches.length}: ${rincianGalat(err)}`
          : `Impor berhenti pada batch ${batch} dari ${batches.length} karena koneksi ke server terputus.`
      );
    } finally {
      setImporting(false);
    }
  }

  /** Kirim ulang hanya baris yang gagal, tanpa perlu memuat file lagi. */
  function kirimUlangGagal() {
    prosesImport(gagalUtama.map((g) => g.row));
  }

  function unduhTemplate() {
    const indukTemplate = sheetInduk
      ? [{
          nama: sheetInduk.nama,
          aoa: [
            sheetInduk.columns.map((c) => c.header),
            sheetInduk.columns.map((c) => c.contoh),
          ],
          wajib: sheetInduk.columns.map((c) => !!c.wajib),
        }]
      : [];

    tulisExcel(
      [
        // Sheet induk ditaruh lebih dulu: isinya yang diisi pertama kali, dan
        // kode kuitansinya jadi rujukan sheet rincian di sebelahnya.
        ...indukTemplate,
        {
          nama: sheetUtama,
          aoa: [
            templateColumns.map((c) => c.header),
            templateColumns.map((c) => c.contoh),
          ],
          wajib: templateColumns.map((c) => !!c.wajib),
        },
        ...sheetMaster(),
      ],
      `template-import-${slug}.xlsx`
    );
  }

  /** Ekspor baris gagal beserta alasannya — bisa diperbaiki lalu diimpor ulang. */
  function unduhGagal() {
    const header = [...columns.map((c) => c.header), "Alasan Gagal"];
    const isi = gagalUtama.map((g) => [
      ...columns.map((c) => String(g.row[c.field] ?? "")),
      g.pesan,
    ]);

    // Alasan galat sheet induk ditulis di baris sheet INDUK-nya, bukan ikut ke
    // daftar rincian: di sanalah petugas harus membetulkannya.
    const alasanInduk = new Map(
      gagal.filter((g) => g.sheet === sheetInduk?.nama).map((g) => [g.baris, g.pesan])
    );

    // Sheet induk ikut disalin apa adanya. Tanpa itu file hasil unduhan tidak
    // bisa diunggah ulang: sheet-nya hilang, dan setiap baris kehilangan
    // induknya — padahal memperbaiki lalu mengimpor ulang justru gunanya file
    // ini. Sheet-nya dinamai "Gagal" agar sheet data utamanya tetap dikenali
    // saat file itu dibaca lagi, sedangkan sheet induk memakai nama aslinya.
    const indukGagal = sheetInduk
      ? [{
          nama: sheetInduk.nama,
          aoa: [
            [...sheetInduk.columns.map((c) => c.header), "Alasan Gagal"],
            ...barisInduk.map((row) => [
              ...sheetInduk.columns.map((c) => String(row[c.field] ?? "")),
              alasanInduk.get(row.baris) ?? "",
            ]),
          ],
          // Kolom "Alasan Gagal" bukan isian, jadi tidak ikut disorot — dan saat
          // file ini diunggah ulang kolomnya diabaikan karena tidak dikenali.
          wajib: [...sheetInduk.columns.map((c) => !!c.wajib), false],
        }]
      : [];

    tulisExcel(
      [
        ...indukGagal,
        {
          nama: "Gagal",
          aoa: [header, ...isi],
          // Kolom terakhir ("Alasan Gagal") bukan isian, jadi tidak ikut disorot.
          wajib: [...columns.map((c) => !!c.wajib), false],
        },
        ...sheetMaster(),
      ],
      `${slug}-gagal-import.xlsx`
    );
  }

  /** Sheet referensi master, ikut disertakan di template maupun file baris gagal. */
  function sheetMaster() {
    return (masters ?? []).map((m) => ({
      nama: m.nama,
      aoa: [[m.idLabel, ...(m.kolom ?? ["Nama"])], ...m.rows],
    }));
  }

  function tulisExcel(
    sheets: { nama: string; aoa: string[][]; wajib?: boolean[] }[],
    file: string
  ) {
    const wb = XLSX.utils.book_new();

    sheets.forEach((s) => {
      const ws = XLSX.utils.aoa_to_sheet(s.aoa);
      ws["!cols"] = s.aoa[0].map((h) => ({ wch: Math.max(h.length, 14) }));

      // Judul kolom: tebal, dan kolom wajib diberi latar kuning supaya langsung
      // terlihat mana yang harus diisi saat file dibuka di Excel.
      s.aoa[0].forEach((_, kolom) => {
        const sel = ws[XLSX.utils.encode_cell({ r: 0, c: kolom })];
        if (!sel) return;
        sel.s = {
          font: { bold: true },
          fill: {
            patternType: "solid",
            fgColor: { rgb: s.wajib?.[kolom] ? "FFFF00" : "F2F2F2" },
          },
        };
      });

      XLSX.utils.book_append_sheet(wb, ws, s.nama);
    });

    XLSX.writeFile(wb, file);
  }

  function tutup() {
    if (importing) return;
    reset();
    onClose();
  }

  return (
    <Modal
      open
      onClose={tutup}
      title={judul}
      size="lg"
      panelClassName="max-w-3xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={unduhTemplate}
            disabled={importing || masterLoading}
          >
            {masterLoading ? t("nafsulImport.loadingMaster") : t("nafsulImport.downloadTemplate")}
          </Button>
          <Button
            type="button"
            onClick={() => prosesImport(rows)}
            disabled={importing || rows.length === 0 || selesai}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {importing
              ? t("nafsulImport.importing", { done: diproses, total: totalAntrian })
              : t("nafsulImport.startImport")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          {t(kunciGrup ? "nafsulImport.batchNoteGroup" : "nafsulImport.batchNote", { size: ukuranBatch })}
        </p>

        {!namaFile ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSeret(true);
              }}
              onDragLeave={() => setSeret(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSeret(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                seret ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50"
              }`}
            >
              <Upload className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-600">{t("nafsulImport.dropHere")}</p>
              <div className="mt-3">
                <Button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  {t("nafsulImport.pickFile")}
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500">{t("nafsulImport.formatHint")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{namaFile}</div>
                  <div className="text-sm text-slate-500">
                    {t("nafsulImport.rowsBatch", {
                      rows: rows.length,
                      batches: bagiBatch(rows, ukuranBatch, kunciGrup).length,
                      size: ukuranBatch,
                    })}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {t("nafsulImport.changeFile")}
              </Button>
            </div>
          )}

          <Input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {parseError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {parseError}
            </div>
          )}

          {runError && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {runError}
            </div>
          )}

          {(importing || selesai || diproses > 0) && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {importing
                    ? t("nafsulImport.uploadingBatch", { current: batchKe, total: totalBatch })
                    : t("nafsulImport.importDone")}
                </span>
                <span className="text-slate-500">
                  {t("nafsulImport.progress", {
                    done: diproses,
                    total: totalAntrian,
                    percent: persen,
                  })}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-emerald-600 transition-all"
                  style={{ width: `${persen}%` }}
                />
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span>
                  {t("nafsulImport.success")}{" "}
                  <span className="font-semibold text-emerald-700">{berhasil}</span>
                </span>
                {/*
                  Hanya muncul bila ada isinya. Impor master lain tidak mengenal
                  keadaan "sudah ada" sama sekali, dan angka nol yang selalu
                  nongol di sana cuma menimbulkan pertanyaan.
                */}
                {dilewati > 0 && (
                  <span>
                    {t("nafsulImport.skipped")}{" "}
                    <span className="font-semibold text-amber-700">{dilewati}</span>
                  </span>
                )}
                <span>
                  {t("nafsulImport.failed")}{" "}
                  <span className="font-semibold text-rose-700">{gagal.length}</span>
                </span>
              </div>
            </div>
          )}

          {gagal.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <span className="text-sm font-medium">
                  {t("nafsulImport.failedRows", { count: gagal.length })}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={unduhGagal}
                    disabled={importing}
                  >
                    <Download className="h-4 w-4" />
                    {t("nafsulImport.exportExcel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={kirimUlangGagal}
                    disabled={!bisaKirimUlang}
                    className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("nafsulImport.resend", { count: gagalUtama.length })}
                  </Button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  {/* Border pada <th> sticky tidak selalu ikut menempel — pakai inset shadow. */}
                  <thead className="sticky top-0 bg-white text-left text-slate-500 shadow-[inset_0_-1px_0_#e2e8f0]">
                    <tr>
                      {sheetInduk && (
                        <th className="px-4 py-2 font-medium">{t("nafsulImport.colSheet")}</th>
                      )}
                      <th className="px-4 py-2 font-medium">{t("nafsulImport.colRow")}</th>
                      <th className="px-4 py-2 font-medium">{t("nafsulImport.colName")}</th>
                      <th className="px-4 py-2 font-medium">{t("nafsulImport.colReason")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gagal.map((g, i) => (
                      <tr key={`${g.sheet}-${g.baris}-${i}`}>
                        {sheetInduk && (
                          <td className="whitespace-nowrap px-4 py-2 text-slate-500">{g.sheet}</td>
                        )}
                        <td className="whitespace-nowrap px-4 py-2 text-slate-500">{g.baris}</td>
                        <td className="px-4 py-2">{g.nama || "—"}</td>
                        <td className="px-4 py-2 text-rose-600">{g.pesan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>
    </Modal>
  );
}

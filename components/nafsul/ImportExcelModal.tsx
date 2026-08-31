"use client";

import { useEffect, useRef, useState } from "react";
// SheetJS CE ("xlsx") mengabaikan style saat menulis file; fork ini API-nya
// sama persis tapi ikut menulis fill/font, dipakai untuk menyorot kolom wajib.
import * as XLSX from "xlsx-js-style";
import { Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import {
  bagiBatch,
  indeksInduk,
  indukUntuk,
  type ParsedRow,
} from "@/lib/nafsul/importParse";
import type { PesanKeluar, PesanMasuk } from "@/lib/nafsul/importWorker";
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
 * Baris gagal yang ikut digambar di tabel.
 *
 * Sisanya tetap terhitung, tetap ikut terekspor ke Excel, dan tetap bisa
 * dikirim ulang — yang dibatasi hanya jumlah baris yang digambar. File 300 ribu
 * baris yang seluruhnya ditolak akan membuat React menggambar 300 ribu `<tr>`
 * dan halamannya membeku persis di saat pengguna paling butuh membaca alasannya.
 */
const MAKS_GAGAL_TAMPIL = 200;

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
   * adalah induk yang DIRUJUK potongan itu. Mengirimnya utuh terlihat lebih
   * sederhana, tapi runtuh pada file besar — sheet induk berisi ribuan baris
   * menembus batas jumlah baris di server sehingga tidak ada satu batch pun
   * yang bisa lewat.
   */
  sheetInduk?: {
    nama: string;
    columns: ImportColumn[];
    payloadField: string;
  };
}

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
  gagal: number;
  hasil: {
    /** Nama sheet asal baris ini. Kosong pada impor satu sheet. */
    sheet?: string;
    baris: number;
    status: "ok" | "gagal";
    nama?: string;
    pesan?: string;
  }[];
}

/**
 * Sumber batch untuk satu kali jalan impor.
 *
 * Ada dua: file (batch-nya tersimpan di worker, diambil satu per satu) dan
 * daftar di memori (dipakai tombol "kirim ulang", yang isinya hanya baris gagal
 * dan karena itu selalu kecil). Runner-nya sama untuk keduanya.
 */
interface SumberBatch {
  totalBaris: number;
  totalBatch: number;
  /** Baris yang kolom wajibnya kosong — gagal tanpa perlu dikirim ke server. */
  tanpaWajib: ParsedRow[];
  ambil: (index: number) => Promise<{ rows: ParsedRow[]; induk: ParsedRow[] }>;
}

/**
 * Modal impor Excel yang dipakai bersama oleh beberapa master.
 *
 * Alur & tampilannya sama untuk semua: unduh template → unggah file → dikirim
 * per batch dengan progres → baris gagal bisa diekspor atau dikirim ulang.
 * Yang berbeda cuma daftar kolom, endpoint, dan sheet referensinya.
 *
 * **File besar tidak pernah menyentuh thread ini.** Pembacaan Excel dikerjakan
 * Web Worker, dan hasilnya tetap tinggal di sana — halaman hanya memegang satu
 * batch pada satu waktu beserta angka-angka progresnya. Sebelumnya seluruh isi
 * file disimpan di state React, lalu dibagi ulang jadi batch di dalam render:
 * pada 300 ribu baris, satu saja pembaruan progres berarti membagi ulang 300
 * ribu baris, dan itu terjadi beberapa kali per batch.
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
  const [parseError, setParseError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [seret, setSeret] = useState(false);
  const [membaca, setMembaca] = useState(false);
  const [barisDibaca, setBarisDibaca] = useState(0);

  /** Ringkasan file yang sudah dibaca worker. Null = belum ada file terbaca. */
  const [ringkasan, setRingkasan] = useState<{
    totalBaris: number;
    totalBatch: number;
    totalInduk: number;
  } | null>(null);

  const [importing, setImporting] = useState(false);
  const [selesai, setSelesai] = useState(false);
  const [totalAntrian, setTotalAntrian] = useState(0);
  const [totalBatch, setTotalBatch] = useState(0);
  const [batchKe, setBatchKe] = useState(0);
  const [diproses, setDiproses] = useState(0);
  const [berhasil, setBerhasil] = useState(0);
  const [gagal, setGagal] = useState<GagalRow[]>([]);

  const [masters, setMasters] = useState<MasterSheet[] | null>(null);
  const masterDiminta = useRef(false);

  /**
   * Worker beserta antrean permintaannya.
   *
   * Permintaan selalu berurutan (satu batch harus selesai dikirim sebelum
   * berikutnya diminta), jadi cukup satu penampung janji — bukan peta berkunci
   * id permintaan.
   */
  const workerRef = useRef<Worker | null>(null);
  const menungguRef = useRef<{
    resolve: (pesan: PesanKeluar) => void;
    reject: (alasan: Error) => void;
  } | null>(null);

  const templateColumns = columns.filter((c) => c.diTemplate !== false);
  // Kolom bertanda `wajib` tidak lagi didaftar ulang di modal: judulnya sudah
  // disorot kuning di file template, dan daftar kedua di layar hanya mengulang
  // hal yang sama sambil mendorong area unggah turun dari pandangan.
  const namaDari = (row: ParsedRow) => String(row[barisWajib.field] ?? "").trim();

  function lepasWorker() {
    // Janji yang masih menggantung ditolak lebih dulu: tanpa ini `await` yang
    // sedang menunggu balasan worker tidak akan pernah selesai, dan tombolnya
    // tinggal selamanya dalam keadaan "sedang mengimpor".
    menungguRef.current?.reject(new Error("WORKER_DIHENTIKAN"));
    menungguRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
  }

  // Worker ikut dilepas saat komponen dibongkar — file 300 ribu baris yang
  // tertinggal di worker tidak akan pernah dikumpulkan selama workernya hidup.
  useEffect(() => () => lepasWorker(), []);

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
    lepasWorker();
    setNamaFile("");
    setRingkasan(null);
    setMembaca(false);
    setBarisDibaca(0);
    setParseError(null);
    setRunError(null);
    setSelesai(false);
    setTotalAntrian(0);
    setTotalBatch(0);
    setBatchKe(0);
    setDiproses(0);
    setBerhasil(0);
    setGagal([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Kirim satu permintaan ke worker dan tunggu balasannya. */
  function tanyaWorker(pesan: PesanMasuk): Promise<PesanKeluar> {
    const worker = workerRef.current;

    if (!worker) return Promise.reject(new Error("WORKER_TIDAK_ADA"));

    return new Promise<PesanKeluar>((resolve, reject) => {
      menungguRef.current = { resolve, reject };
      // Buffer file dipindahkan, bukan disalin: menyalin 300 ribu baris ke
      // worker berarti menahan dua salinan sekaligus di puncak pemakaian.
      if (pesan.type === "parse") worker.postMessage(pesan, [pesan.buffer]);
      else worker.postMessage(pesan);
    });
  }

  async function handleFile(file: File) {
    reset();
    setNamaFile(file.name);
    setMembaca(true);

    try {
      // Path RELATIF, bukan alias "@/": bundler mengenali worker lewat pola
      // `new Worker(new URL(...))` secara statis, dan alias tidak ikut
      // diterjemahkan di dalam pola itu — workernya jadi tidak terbundel dan
      // gagal dimuat saat dijalankan.
      const worker = new Worker(new URL("../../lib/nafsul/importWorker.ts", import.meta.url));
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<PesanKeluar>) => {
        // Progres bukan balasan atas satu permintaan: ia mengalir selama
        // pembacaan berjalan, jadi tidak boleh menyelesaikan janji yang sedang
        // menunggu hasil akhir.
        if (event.data.type === "progress") {
          setBarisDibaca(event.data.dibaca);

          return;
        }

        const menunggu = menungguRef.current;
        menungguRef.current = null;
        menunggu?.resolve(event.data);
      };

      worker.onerror = () => {
        const menunggu = menungguRef.current;
        menungguRef.current = null;
        menunggu?.reject(new Error("WORKER_GAGAL"));
      };

      const balasan = await tanyaWorker({
        type: "parse",
        buffer: await file.arrayBuffer(),
        sheetUtama,
        columns,
        wajibField: barisWajib.field,
        kunciGrup,
        ukuranBatch,
        sheetInduk: sheetInduk
          ? { nama: sheetInduk.nama, columns: sheetInduk.columns }
          : undefined,
      });

      if (balasan.type === "error") {
        setParseError(
          balasan.pesan === "SHEET_TIDAK_ADA"
            ? t("nafsulImport.sheetError")
            : balasan.pesan === "SHEET_INDUK_TIDAK_ADA"
              ? t("nafsulImport.parentSheetMissing", { sheet: sheetInduk?.nama ?? "" })
              : t("nafsulImport.readError"),
        );

        return;
      }

      if (balasan.type !== "parsed") return;

      setRingkasan({
        totalBaris: balasan.total,
        totalBatch: balasan.totalBatch,
        totalInduk: balasan.totalInduk,
      });

      // Baris tanpa kolom wajib sudah disaring worker — ditampilkan sebagai
      // gagal sejak awal, tanpa pernah dikirim ke server.
      setGagal(
        balasan.tanpaWajib.map((row) => ({
          sheet: sheetUtama,
          baris: row.baris,
          nama: "",
          pesan: `${barisWajib.label} wajib diisi.`,
          row,
        })),
      );

      if (balasan.total === 0) setParseError(t("nafsulImport.noRows"));
    } catch {
      setParseError(t("nafsulImport.readError"));
    } finally {
      setMembaca(false);
    }
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

  /** Jalankan impor untuk satu sumber batch — dipakai impor awal maupun kirim ulang. */
  async function jalankan(sumber: SumberBatch) {
    setImporting(true);
    setSelesai(false);
    setRunError(null);
    setTotalAntrian(sumber.totalBaris);
    setTotalBatch(sumber.totalBatch);
    setBatchKe(0);
    setBerhasil(0);
    // Baris tanpa kolom wajib tidak perlu dikirim ke server — sudah dicatat gagal.
    setDiproses(sumber.tanpaWajib.length);

    let sukses = 0;
    let batch = 0;
    let terkirim = 0;

    try {
      for (let i = 0; i < sumber.totalBatch; i++) {
        batch = i + 1;
        setBatchKe(batch);

        const { rows: potongan, induk: indukBatch } = await sumber.ambil(i);

        if (potongan.length === 0) continue;

        const res = await api<ImportResponse>(`/${slug}/import`, {
          method: "POST",
          body: sheetInduk
            ? { rows: potongan, [sheetInduk.payloadField]: indukBatch }
            : { rows: potongan },
        });

        sukses += res.berhasil;
        setBerhasil(sukses);

        // Baris potongan diindeks per nomor baris sekali per batch. Sebelumnya
        // tiap galat mencari barisnya dengan `find()` di seluruh daftar — pada
        // batch besar yang banyak galatnya itu jadi pencarian bersarang.
        const perBaris = new Map(potongan.map((r) => [r.baris, r]));
        const indukPerBaris = new Map(indukBatch.map((r) => [r.baris, r]));

        const gagalBatch = res.hasil
          .filter((h) => h.status === "gagal")
          .map((h) => {
            // Galat sheet induk dicocokkan ke baris sheet INDUK-nya, bukan ke
            // potongan rincian yang sedang dikirim — nomor barisnya milik sheet
            // yang berbeda.
            const dariInduk = !!sheetInduk && h.sheet === sheetInduk.nama;
            const asal = dariInduk ? indukPerBaris.get(h.baris) : perBaris.get(h.baris);

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
        setDiproses(sumber.tanpaWajib.length + terkirim);
      }

      setSelesai(true);
      if (sukses > 0) onSelesai?.();
    } catch (err) {
      // Impor dihentikan: baris yang sudah terkirim tetap tersimpan di server.
      setRunError(
        err instanceof ApiError
          ? `Impor berhenti pada batch ${batch} dari ${sumber.totalBatch}: ${rincianGalat(err)}`
          : `Impor berhenti pada batch ${batch} dari ${sumber.totalBatch} karena koneksi ke server terputus.`,
      );
    } finally {
      setImporting(false);
    }
  }

  /** Impor file yang sudah dibaca worker — batch-nya diambil satu per satu. */
  function mulaiImport() {
    if (!ringkasan) return;

    // Baris tanpa kolom wajib sudah masuk daftar gagal saat file dibaca; di sini
    // cukup jumlahnya, untuk menghitung progres.
    const tanpaWajib = gagal.filter((g) => g.sheet === sheetUtama && g.nama === "");

    jalankan({
      totalBaris: ringkasan.totalBaris,
      totalBatch: ringkasan.totalBatch,
      tanpaWajib: tanpaWajib.map((g) => g.row),
      ambil: async (index) => {
        const balasan = await tanyaWorker({ type: "batch", index });

        return balasan.type === "batch"
          ? { rows: balasan.rows, induk: balasan.induk }
          : { rows: [], induk: [] };
      },
    });
  }

  /**
   * Kirim ulang hanya baris yang gagal, tanpa perlu memuat file lagi.
   *
   * Baris ini sudah ada di memori halaman (jumlahnya sebatas yang gagal), jadi
   * dibagi batch di sini saja — tidak perlu menempuh worker.
   */
  function kirimUlangGagal() {
    const daftar = gagalUtama.map((g) => g.row);
    const denganNama = daftar.filter((r) => namaDari(r) !== "");
    const tanpaWajib = daftar.filter((r) => namaDari(r) === "");
    const batches = bagiBatch(denganNama, ukuranBatch, kunciGrup);

    // Induk untuk kiriman ulang diambil dari galat induk yang tercatat; file
    // aslinya mungkin sudah tidak ada lagi di worker.
    const indukTersimpan = gagal
      .filter((g) => g.sheet === sheetInduk?.nama)
      .map((g) => g.row);
    const indeks = indeksInduk(indukTersimpan, kunciGrup);

    setGagal((g) => g.filter((x) => x.sheet !== sheetUtama));

    jalankan({
      totalBaris: daftar.length,
      totalBatch: batches.length,
      tanpaWajib,
      ambil: async (index) => {
        const potongan = batches[index] ?? [];

        return {
          rows: potongan,
          induk: kunciGrup ? indukUntuk(potongan, indeks, kunciGrup, index === 0) : [],
        };
      },
    });
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
  async function unduhGagal() {
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
    //
    // Isinya diminta ke worker saat dibutuhkan saja: menyimpannya di state
    // halaman berarti menahan seluruh sheet Kuitansi di memori sepanjang modal
    // terbuka, padahal hanya dipakai kalau tombol ini ditekan.
    let barisInduk: ParsedRow[] = [];

    if (sheetInduk && workerRef.current) {
      try {
        const balasan = await tanyaWorker({ type: "induk" });
        if (balasan.type === "induk") barisInduk = balasan.rows;
      } catch {
        // File-nya sudah tidak ada di worker (mis. modal sempat direset) —
        // sheet induk ditulis kosong daripada gagal mengunduh sama sekali.
      }
    }

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

  const gagalTampil = gagal.slice(0, MAKS_GAGAL_TAMPIL);

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
            onClick={mulaiImport}
            disabled={
              importing || membaca || !ringkasan || ringkasan.totalBatch === 0 || selesai
            }
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
                    {/*
                      Angka batch datang dari worker, bukan dihitung ulang di
                      sini. Membaginya di dalam render berarti membagi ulang
                      seluruh isi file setiap kali progres bergerak.
                    */}
                    {membaca
                      ? t("nafsulImport.reading", { rows: barisDibaca })
                      : ringkasan
                        ? t("nafsulImport.rowsBatch", {
                            rows: ringkasan.totalBaris,
                            batches: ringkasan.totalBatch,
                            size: ukuranBatch,
                          })
                        : "—"}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importing || membaca}
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
                    {gagalTampil.map((g, i) => (
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
              {gagal.length > gagalTampil.length && (
                <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                  {t("nafsulImport.failedTruncated", {
                    shown: gagalTampil.length,
                    total: gagal.length,
                  })}
                </p>
              )}
            </div>
          )}
      </div>
    </Modal>
  );
}

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
}

type ParsedRow = Record<string, string | number> & { baris: number };

/** Baris gagal disimpan lengkap dengan data aslinya agar bisa diekspor & dikirim ulang. */
interface GagalRow {
  baris: number;
  nama: string;
  pesan: string;
  row: ParsedRow;
}

interface ImportResponse {
  berhasil: number;
  gagal: number;
  hasil: {
    baris: number;
    status: "ok" | "gagal";
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
}: ImportExcelModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [namaFile, setNamaFile] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
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
  const [gagal, setGagal] = useState<GagalRow[]>([]);

  const [masters, setMasters] = useState<MasterSheet[] | null>(null);
  const masterDiminta = useRef(false);

  const templateColumns = columns.filter((c) => c.diTemplate !== false);
  const namaDari = (row: ParsedRow) => String(row[barisWajib.field] ?? "").trim();

  // Master ditarik sekali saat modal dibuka, dipakai sebagai sheet referensi
  // di dalam file template & file baris gagal.
  useEffect(() => {
    if (!open || masterDiminta.current) return;

    masterDiminta.current = true;
    if (!muatMaster) {
      setMasters([]);
      return;
    }

    muatMaster()
      .then(setMasters)
      // Master gagal dimuat bukan alasan memblokir impor — template tetap bisa
      // diunduh, hanya tanpa sheet referensi.
      .catch(() => setMasters([]));
  }, [open, muatMaster]);

  if (!open) return null;

  // `masters` selalu terisi setelah permintaan selesai (walau gagal → array
  // kosong), jadi null berarti masih dimuat.
  const masterLoading = masters === null;

  const persen = totalAntrian === 0 ? 0 : Math.round((diproses / totalAntrian) * 100);
  const bisaKirimUlang = !importing && gagal.length > 0;

  function reset() {
    setNamaFile("");
    setRows([]);
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

  async function handleFile(file: File) {
    reset();
    setNamaFile(file.name);

    const fieldByHeader = new Map<string, string>();
    columns.forEach((c) => {
      fieldByHeader.set(normalize(c.header), c.field);
      fieldByHeader.set(normalize(c.field), c.field);
    });

    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setParseError("File tidak punya sheet yang bisa dibaca.");
        return;
      }

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: true,
      });

      const terbaca: ParsedRow[] = [];

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
        if (adaIsi) terbaca.push(row);
      });

      setRows(terbaca);
      if (terbaca.length === 0) {
        setParseError(
          "Tidak ada baris data yang terbaca. Pastikan judul kolom ada di baris pertama."
        );
      }
    } catch {
      setParseError("File gagal dibaca. Pastikan formatnya .xlsx, .xls, atau .csv.");
    }
  }

  /** Jalankan impor untuk sekumpulan baris — dipakai impor awal maupun kirim ulang. */
  async function prosesImport(daftar: ParsedRow[]) {
    const denganNama = daftar.filter((r) => namaDari(r) !== "");
    const tanpaNama = daftar.filter((r) => namaDari(r) === "");
    const batchTotal = Math.ceil(denganNama.length / BATCH_SIZE);

    setImporting(true);
    setSelesai(false);
    setRunError(null);
    setTotalAntrian(daftar.length);
    setTotalBatch(batchTotal);
    setBatchKe(0);
    setBerhasil(0);
    // Baris tanpa kolom wajib tidak perlu dikirim ke server — langsung dicatat gagal.
    setDiproses(tanpaNama.length);
    setGagal(
      tanpaNama.map((row) => ({
        baris: row.baris,
        nama: "",
        pesan: `${barisWajib.label} wajib diisi.`,
        row,
      }))
    );

    let sukses = 0;
    let batch = 0;

    try {
      for (let i = 0; i < denganNama.length; i += BATCH_SIZE) {
        const potongan = denganNama.slice(i, i + BATCH_SIZE);
        batch = i / BATCH_SIZE + 1;
        setBatchKe(batch);

        const res = await api<ImportResponse>(`/${slug}/import`, {
          method: "POST",
          body: { rows: potongan },
        });

        sukses += res.berhasil;
        setBerhasil(sukses);

        const gagalBatch = res.hasil
          .filter((h) => h.status === "gagal")
          .map((h) => {
            const asal = potongan.find((r) => r.baris === h.baris);
            return {
              baris: h.baris,
              nama: h.nama ?? "",
              pesan: h.pesan ?? "Gagal disimpan.",
              row: asal ?? ({ baris: h.baris } as ParsedRow),
            };
          });
        if (gagalBatch.length) setGagal((g) => [...g, ...gagalBatch]);

        setDiproses(tanpaNama.length + i + potongan.length);
      }

      setSelesai(true);
      if (sukses > 0) onSelesai?.();
    } catch (err) {
      // Impor dihentikan: baris yang sudah terkirim tetap tersimpan di server.
      setRunError(
        err instanceof ApiError
          ? `Impor berhenti pada batch ${batch} dari ${batchTotal}: ${err.message}`
          : `Impor berhenti pada batch ${batch} dari ${batchTotal} karena koneksi ke server terputus.`
      );
    } finally {
      setImporting(false);
    }
  }

  /** Kirim ulang hanya baris yang gagal, tanpa perlu memuat file lagi. */
  function kirimUlangGagal() {
    prosesImport(gagal.map((g) => g.row));
  }

  function unduhTemplate() {
    tulisExcel(
      [
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
    const isi = gagal.map((g) => [...columns.map((c) => String(g.row[c.field] ?? "")), g.pesan]);

    tulisExcel(
      [
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
      aoa: [[m.idLabel, "Nama"], ...m.rows],
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
            {masterLoading ? "Memuat master..." : "Unduh Template"}
          </Button>
          <Button
            type="button"
            onClick={() => prosesImport(rows)}
            disabled={importing || rows.length === 0 || selesai}
          >
            {importing ? `Mengimpor... (${diproses}/${totalAntrian})` : "Mulai Import"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          Dikirim {BATCH_SIZE} baris per batch, bukan seluruhnya sekaligus.
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
              <p className="text-sm text-slate-600">Tarik file Excel ke sini, atau</p>
              <div className="mt-3">
                <Button type="button" onClick={() => fileRef.current?.click()}>
                  Pilih File
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500">Format .xlsx, .xls, atau .csv</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{namaFile}</div>
                  <div className="text-sm text-slate-500">
                    {rows.length} baris · {Math.ceil(rows.length / BATCH_SIZE)} batch @{" "}
                    {BATCH_SIZE} baris
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                Ganti File
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
                    ? `Mengunggah batch ${batchKe} dari ${totalBatch}`
                    : "Impor selesai"}
                </span>
                <span className="text-slate-500">
                  {diproses} dari {totalAntrian} baris ({persen}%)
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
                  Berhasil <span className="font-semibold text-emerald-700">{berhasil}</span>
                </span>
                <span>
                  Gagal <span className="font-semibold text-rose-700">{gagal.length}</span>
                </span>
              </div>
            </div>
          )}

          {gagal.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <span className="text-sm font-medium">Baris gagal ({gagal.length})</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={unduhGagal}
                    disabled={importing}
                  >
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={kirimUlangGagal}
                    disabled={!bisaKirimUlang}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Kirim Ulang ({gagal.length})
                  </Button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  {/* Border pada <th> sticky tidak selalu ikut menempel — pakai inset shadow. */}
                  <thead className="sticky top-0 bg-white text-left text-slate-500 shadow-[inset_0_-1px_0_#e2e8f0]">
                    <tr>
                      <th className="px-4 py-2 font-medium">Baris</th>
                      <th className="px-4 py-2 font-medium">Nama</th>
                      <th className="px-4 py-2 font-medium">Alasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gagal.map((g, i) => (
                      <tr key={`${g.baris}-${i}`}>
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

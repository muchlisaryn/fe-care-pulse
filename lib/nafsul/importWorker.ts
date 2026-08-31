/// <reference lib="webworker" />

/**
 * Worker pembaca file impor Excel.
 *
 * Ada karena membaca file 300 ribu baris di thread utama membekukan seluruh
 * halaman: SheetJS bekerja secara sinkron, jadi selama file dibongkar tidak ada
 * satu pun frame yang sempat digambar — tab-nya berhenti merespons dan peramban
 * menawarkan untuk menutupnya.
 *
 * Yang sama pentingnya: hasil parsing DISIMPAN DI SINI, tidak dikirim balik
 * sekaligus. Thread utama hanya meminta satu batch pada satu waktu, jadi memori
 * halaman tidak pernah menampung 300 ribu objek sekaligus — itu yang dulu
 * membuat tab-nya ditutup paksa peramban walau parsingnya sudah selesai.
 */

import * as XLSX from "xlsx-js-style"

import {
  bacaSheet,
  bagiBatch,
  indeksInduk,
  indukUntuk,
  type KolomBaca,
  type ParsedRow,
} from "./importParse"

export interface PesanParse {
  type: "parse"
  buffer: ArrayBuffer
  sheetUtama: string
  columns: KolomBaca[]
  /** Field yang wajib terisi; baris tanpa isian ini tidak ikut dikirim. */
  wajibField: string
  kunciGrup?: string
  ukuranBatch: number
  sheetInduk?: { nama: string; columns: KolomBaca[] }
}

export interface PesanBatch {
  type: "batch"
  index: number
}

/** Seluruh baris sheet induk — diminta hanya saat file "baris gagal" diunduh. */
export interface PesanInduk {
  type: "induk"
}

export type PesanMasuk = PesanParse | PesanBatch | PesanInduk

export type PesanKeluar =
  | { type: "progress"; fase: "baca" | "petakan"; dibaca: number; total: number }
  | {
      type: "parsed"
      total: number
      totalBatch: number
      totalInduk: number
      /** Baris yang kolom wajibnya kosong — dikembalikan utuh agar bisa diekspor. */
      tanpaWajib: ParsedRow[]
    }
  | { type: "batch"; index: number; rows: ParsedRow[]; induk: ParsedRow[] }
  | { type: "induk"; rows: ParsedRow[] }
  | { type: "error"; pesan: string }

/**
 * Seluruh isi file disimpan di sini, bukan di thread utama.
 *
 * Sengaja variabel modul dan bukan dikirim balik: satu worker melayani satu file
 * pada satu waktu, dan file berikutnya menimpanya. Modal membuat worker baru
 * tiap kali file diganti, jadi sisa file lama ikut dilepas bersama workernya.
 */
let batches: ParsedRow[][] = []
let barisInduk: ParsedRow[] = []
let indeks = indeksInduk([], undefined)
let kunciGrupAktif: string | undefined

const kirim = (pesan: PesanKeluar) => self.postMessage(pesan)

self.onmessage = (event: MessageEvent<PesanMasuk>) => {
  const pesan = event.data

  try {
    if (pesan.type === "parse") {
      tanganiParse(pesan)

      return
    }

    if (pesan.type === "batch") {
      const potongan = batches[pesan.index] ?? []

      kirim({
        type: "batch",
        index: pesan.index,
        rows: potongan,
        induk: kunciGrupAktif
          ? indukUntuk(potongan, indeks, kunciGrupAktif, pesan.index === 0)
          : barisInduk,
      })

      return
    }

    if (pesan.type === "induk") {
      kirim({ type: "induk", rows: barisInduk })
    }
  } catch (e) {
    kirim({ type: "error", pesan: e instanceof Error ? e.message : String(e) })
  }
}

function tanganiParse(pesan: PesanParse): void {
  // Keadaan file sebelumnya dilepas SEBELUM file baru dibongkar, bukan sesudah:
  // kalau tidak, dua file besar sempat berada di memori bersamaan.
  batches = []
  barisInduk = []
  indeks = indeksInduk([], undefined)
  kunciGrupAktif = pesan.kunciGrup

  const wb = XLSX.read(pesan.buffer, { cellDates: true, dense: true })

  // Sheet dicari berdasarkan NAMA lebih dulu, baru jatuh ke sheet pertama yang
  // BUKAN sheet induk.
  //
  // Dua-duanya perlu: file template menamai sheet datanya `sheetUtama`,
  // sedangkan file "baris gagal" menamainya "Gagal" — dan file itu memang
  // dimaksudkan untuk diperbaiki lalu diunggah ulang. Sheet induk harus
  // dikecualikan dari fallback karena ia berada lebih dulu di kedua file.
  const namaLain = wb.SheetNames.find((n) => n !== pesan.sheetInduk?.nama)
  const sheet = wb.Sheets[pesan.sheetUtama] ?? (namaLain ? wb.Sheets[namaLain] : undefined)

  if (!sheet) {
    kirim({ type: "error", pesan: "SHEET_TIDAK_ADA" })

    return
  }

  if (pesan.sheetInduk) {
    const lembarInduk = wb.Sheets[pesan.sheetInduk.nama]

    if (!lembarInduk) {
      kirim({ type: "error", pesan: "SHEET_INDUK_TIDAK_ADA" })

      return
    }

    barisInduk = bacaSheet(lembarInduk, pesan.sheetInduk.columns)
  }

  const rows = bacaSheet(sheet, pesan.columns, (dibaca, total) =>
    kirim({ type: "progress", fase: "baca", dibaca, total }),
  )

  // Baris tanpa kolom wajib disaring DI SINI, bukan di thread utama: menyaring
  // 300 ribu baris di sana berarti mengirim 300 ribu baris ke sana lebih dulu.
  const denganWajib: ParsedRow[] = []
  const tanpaWajib: ParsedRow[] = []

  for (const row of rows) {
    if (String(row[pesan.wajibField] ?? "").trim() === "") tanpaWajib.push(row)
    else denganWajib.push(row)
  }

  batches = bagiBatch(denganWajib, pesan.ukuranBatch, pesan.kunciGrup)
  indeks = indeksInduk(barisInduk, pesan.kunciGrup)

  kirim({
    type: "parsed",
    total: rows.length,
    totalBatch: batches.length,
    totalInduk: barisInduk.length,
    tanpaWajib,
  })
}

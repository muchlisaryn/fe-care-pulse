import axios from "axios"
import type { Printer } from "@/lib/store/slices/printerSlice"

// Print server (care-pulse-print-server) berjalan di komputer yang tersambung ke
// printer — bukan di backend Laravel CSSD. Karena itu ia dipanggil langsung dari
// browser dengan axios polos (tanpa Bearer token / interceptor 401 milik `api`).
//
// Alamatnya selalu localhost: XAMPP ada di komputer operator yang sama. Jangan
// menurunkannya dari printer.ip_address/port — itu alamat printer fisik (port 9100
// = TCP mentah), bukan alamat web server. Keduanya tetap dikirim di body payload
// supaya print server bisa menghubungi printer network.
const PRINT_SERVER_PATH = "/care-pulse-print-server/public/api"

export function getPrintServerUrl(): string {
  return `http://localhost${PRINT_SERVER_PATH}`
}

// Satu label sterilisasi CSSD sesuai kontrak POST /api/print-label (ESC/POS).
export type CssdLabelPayload = {
  // Isi barcode Code39 SEKALIGUS teks di bawahnya. Kita kirim `barcode_no` utuh
  // (prefix+code+package_no tanpa spasi, mis. "PKG260721031") agar barcode yang
  // dicetak IDENTIK dengan yang ditampilkan di halaman preview & cocok saat dipindai.
  kode_produksi: string
  // Komponen mentah label — print server boleh menyusun layout sendiri dari sini.
  // Sumber: `barcode_no` & `nama_instrumen` dari packaging_item, `prefix` &
  // `code_packaging` dari tabel packaging, `packaging_no` dari production_item.package_no.
  barcode_no?: string | null
  prefix?: string | null
  code_packaging?: string | null
  packaging_no?: string | number | null
  nama_instrumen: string | null
  // No. lot/batch indikator kimia internal. Print server harus mencetak field ini
  // — bila belum mendukungnya, nilainya diabaikan & tak muncul di kertas.
  no_lot: string | null
  petugas_pengemasan: string | null
  tanggal_steril: string | null
  tanggal_kadaluarsa: string | null
}

// Bentuk respons print server. HTTP 200 TIDAK menjamin sukses — cek `status`
// (doc: "200 Request diproses — cek status dalam body"). Saat gagal, `target`
// berisi tujuan cetak (mis. "COM3") untuk memperjelas pesan.
type PrintResponse = {
  status: "success" | "error"
  message: string
  target?: string
  config?: { printer?: string; connection?: string; target?: string; char_per_line?: number; auto_cut?: boolean; labels?: number }
}
type TestPrintResponse = PrintResponse & { printed?: string }

// Ambil `message` bila status sukses; kalau tidak, lempar Error dengan pesan
// (disertai target bila ada) supaya pemanggil tidak salah menganggapnya sukses.
function unwrapPrintResponse(data: PrintResponse): string {
  if (data.status !== "success") {
    const target = data.target ?? data.config?.target
    throw new Error(target ? `${data.message} (${target})` : data.message)
  }
  return data.message
}

// Endpoint /print-label khusus printer ESC/POS (struk termal, mis. Epson TM-T82X).
export function isEscposPrinter(p: Printer): boolean {
  return p.printer_language === "escpos"
}

// Bentuk objek `printer` yang dipahami print server.
function printerPayload(p: Printer) {
  return {
    name: p.name,
    connection_type: p.connection_type,
    device_path: p.device_path,
    ip_address: p.ip_address,
    port: p.port,
    printer_language: p.printer_language,
    paper_size: p.paper_size,
    char_per_line: p.char_per_line,
    code_page: p.code_page,
    auto_cut: p.auto_cut,
  }
}

// Ubah kegagalan axios jadi Error dengan pesan siap-tampil.
function toPrintError(e: unknown, url: string): Error {
  if (axios.isAxiosError(e)) {
    // Tanpa response = print server mati / tidak terjangkau dari browser.
    return new Error(
      e.response
        ? (e.response.data?.message ?? e.message)
        : `Tidak dapat terhubung ke print server (${url}). Pastikan XAMPP di komputer ini menyala.`,
    )
  }
  return e instanceof Error ? e : new Error("Gagal mencetak.")
}

// Kirim label CSSD ke print server. Melempar Error dengan pesan siap-tampil.
export async function printCssdLabels(printer: Printer, labels: CssdLabelPayload[]): Promise<string> {
  const url = `${getPrintServerUrl()}/print-label`
  const payload = { printer: printerPayload(printer), labels }
  console.log("[print-label] POST", url, payload)
  try {
    const res = await axios.post<PrintResponse>(url, payload)
    console.log("[print-label] response", res.data)
    return unwrapPrintResponse(res.data)
  } catch (e) {
    console.error("[print-label] error", e)
    // Error dari unwrap (status:"error" pada HTTP 200) sudah siap-tampil — jangan
    // dibungkus ulang jadi pesan koneksi.
    if (!axios.isAxiosError(e) && e instanceof Error) throw e
    throw toPrintError(e, url)
  }
}

// Test print satu printer (frasa acak) — dipakai di halaman Master Printer.
// Print server mendukung printer_language escpos & zpl untuk endpoint ini.
export async function testPrintPrinter(printer: Printer): Promise<string> {
  const url = `${getPrintServerUrl()}/printer-test-print`
  const payload = {
    printer: {
      ...printerPayload(printer),
      label_width_mm: printer.label_width_mm,
      label_height_mm: printer.label_height_mm,
    },
  }
  console.log("[test-print] POST", url, payload)
  try {
    const res = await axios.post<TestPrintResponse>(url, payload)
    console.log("[test-print] response", res.data)
    const message = unwrapPrintResponse(res.data)
    return res.data.printed ? `${message} (${res.data.printed})` : message
  } catch (e) {
    console.error("[test-print] error", e)
    if (!axios.isAxiosError(e) && e instanceof Error) throw e
    throw toPrintError(e, url)
  }
}

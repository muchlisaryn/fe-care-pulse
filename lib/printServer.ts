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

// Satu label sterilisasi CSSD sesuai kontrak POST /api/print-label.
export type CssdLabelPayload = {
  kode_produksi: string
  nama_instrumen: string | null
  petugas_pengemasan: string | null
  tanggal_steril: string | null
  tanggal_kadaluarsa: string | null
}

type PrintResponse = { status: "success" | "error"; message: string }
type TestPrintResponse = PrintResponse & { printed?: string }

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
    return res.data.message
  } catch (e) {
    console.error("[print-label] error", e)
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
    return res.data.printed ? `${res.data.message} (${res.data.printed})` : res.data.message
  } catch (e) {
    console.error("[test-print] error", e)
    throw toPrintError(e, url)
  }
}

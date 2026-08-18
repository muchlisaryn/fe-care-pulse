"use client"

import { useEffect, useState } from "react"
import { Search, Printer, AlertCircle, Check } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { useToast } from "@/components/molecules/ToastProvider"
import { testPrintPrinter } from "@/lib/printServer"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchPrinters,
  setPrinterSearch,
  setPrinterPage,
  invalidatePrinters,
  type Printer as PrinterType,
} from "@/lib/store/slices/printerSlice"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"

const emptyForm = {
  name: "",
  document_type: "struk",
  printer_language: "escpos",
  connection_type: "network",
  ip_address: "",
  port: "9100",
  device_path: "",
  // receipt (struk) only
  paper_size: "58mm",
  char_per_line: "",
  auto_cut: true,
  // label only
  label_width_mm: "",
  label_height_mm: "",
  label_gap_mm: "",
  code_page: "CP437",
  is_active: true,
}
type FormState = typeof emptyForm

const dash = <span className="text-gray-400 text-xs">—</span>

// Printer default disimpan per-komputer di localStorage (BUKAN database), agar
// tiap komputer bisa punya printer default sendiri. Dipakai untuk auto-pilih
// printer saat cetak label.
export const DEFAULT_PRINTER_KEY = "master_printer_default"

// Checkbox berlabel sederhana (tidak ada atom Toggle di project).
function CheckField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#075489]"
      />
      {label}
    </label>
  )
}

// Ikon info "!" + popup penjelasan saat di-hover (CSS group-hover).
// align="right" → tooltip terbuka ke kiri (untuk field di kolom kanan agar tidak terpotong).
function InfoHint({
  children,
  align = "left",
}: {
  children: React.ReactNode
  align?: "left" | "right"
}) {
  return (
    <span className="group relative inline-flex align-middle">
      <AlertCircle className="h-3.5 w-3.5 cursor-help text-gray-400 transition-colors hover:text-[#075489]" />
      <span
        role="tooltip"
        className={
          "pointer-events-none absolute bottom-full z-50 mb-2 hidden w-72 rounded-lg bg-gray-900 px-3.5 py-3 text-[13px] font-normal leading-relaxed text-gray-200 shadow-xl group-hover:block " +
          (align === "right" ? "right-0" : "left-0")
        }
      >
        {children}
        <span
          className={
            "absolute top-full border-4 border-transparent border-t-gray-900 " +
            (align === "right" ? "right-3" : "left-3")
          }
        />
      </span>
    </span>
  )
}

// Kode code page + kunci kamus penjelasannya — penjelasannya ikut bahasa aktif.
const CODE_PAGES = [
  { code: "CP437", descKey: "printer.cp437" },
  { code: "CP850", descKey: "printer.cp850" },
  { code: "CP858", descKey: "printer.cp858" },
  { code: "CP1252", descKey: "printer.cp1252" },
  { code: "CP852", descKey: "printer.cp852" },
  { code: "CP866", descKey: "printer.cp866" },
]

function DevicePathHint() {
  const t = useT()
  return (
    <>
      <p className="mb-1.5 text-sm font-semibold text-white">{t("printer.devicePathTitle")}</p>
      <p>{t("printer.devicePathDesc")}</p>
      <div className="mt-2 space-y-0.5">
        <p>
          <span className="font-mono text-white">COM3</span> — {t("printer.devicePathCom")}
        </p>
        <p>
          <span className="font-mono text-white">LPT1</span> — {t("printer.devicePathLpt")}
        </p>
        <p>
          <span className="font-mono text-white">/dev/usb/lp0</span> — {t("printer.devicePathLinux")}
        </p>
        <p>
          <span className="font-mono text-white">{t("printer.devicePathShareName")}</span> —{" "}
          {t("printer.devicePathShare")}
        </p>
      </div>
      <p className="mt-2 text-gray-400">{t("printer.devicePathNote")}</p>
    </>
  )
}

function CodePageHint() {
  const t = useT()
  return (
    <>
      <p className="mb-1.5 text-sm font-semibold text-white">{t("printer.codePageTitle")}</p>
      <p>{t("printer.codePageDesc")}</p>
      <div className="mt-2.5 border-t border-white/10 pt-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {t("printer.codePageOptions")}
        </p>
        <ul className="space-y-0.5">
          {CODE_PAGES.map((cp) => (
            <li key={cp.code} className="flex gap-2">
              <span className="w-14 shrink-0 font-mono font-semibold text-white">{cp.code}</span>
              <span className="text-gray-300">{t(cp.descKey)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default function MasterPrinterPage() {
  const dispatch = useAppDispatch()
  const toast = useToast()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.printers,
  )

  const t = useT()

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PrinterType | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // Id printer default (dari localStorage, per-komputer).
  const [defaultId, setDefaultId] = useState<number | null>(null)
  // Id printer yang sedang menjalankan test print (state loading per baris).
  const [testingId, setTestingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchPrinters())
  }, [loaded, dirty, dispatch])

  // Muat printer default dari localStorage saat halaman dibuka.
  useEffect(() => {
    const v = localStorage.getItem(DEFAULT_PRINTER_KEY)
    setDefaultId(v ? Number(v) : null)
  }, [])

  // Set / lepas printer default (disimpan ke localStorage, bukan DB).
  function toggleDefault(id: number) {
    if (defaultId === id) {
      localStorage.removeItem(DEFAULT_PRINTER_KEY)
      setDefaultId(null)
    } else {
      localStorage.setItem(DEFAULT_PRINTER_KEY, String(id))
      setDefaultId(id)
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setPrinterSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setError(null)
    setModal("tambah")
  }

  function openEdit(row: PrinterType) {
    setForm({
      name: row.name,
      document_type: row.document_type,
      printer_language: row.printer_language,
      connection_type: row.connection_type,
      ip_address: row.ip_address ?? "",
      port: row.port != null ? String(row.port) : "9100",
      device_path: row.device_path ?? "",
      paper_size: row.paper_size ?? "58mm",
      char_per_line: row.char_per_line != null ? String(row.char_per_line) : "",
      auto_cut: row.auto_cut,
      label_width_mm: row.label_width_mm != null ? String(row.label_width_mm) : "",
      label_height_mm: row.label_height_mm != null ? String(row.label_height_mm) : "",
      label_gap_mm: row.label_gap_mm != null ? String(row.label_gap_mm) : "",
      code_page: row.code_page ?? "CP437",
      is_active: row.is_active,
    })
    setEditId(row.id)
    setError(null)
    setModal("edit")
  }

  const isStruk = form.document_type === "struk"
  const isNetwork = form.connection_type === "network"
  const canSave = form.name.trim() !== ""

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v))

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        document_type: form.document_type,
        printer_language: form.printer_language,
        connection_type: form.connection_type,
        // Koneksi: network → ip+port; lainnya → device_path.
        ip_address: isNetwork ? form.ip_address.trim() || null : null,
        port: isNetwork ? numOrNull(form.port) : null,
        device_path: !isNetwork ? form.device_path.trim() || null : null,
        // Receipt (struk) only.
        paper_size: isStruk ? form.paper_size : null,
        char_per_line: isStruk ? numOrNull(form.char_per_line) : null,
        auto_cut: form.auto_cut,
        // Label only.
        label_width_mm: !isStruk ? numOrNull(form.label_width_mm) : null,
        label_height_mm: !isStruk ? numOrNull(form.label_height_mm) : null,
        label_gap_mm: !isStruk ? numOrNull(form.label_gap_mm) : null,
        code_page: form.code_page.trim() || "CP437",
        is_active: form.is_active,
      }
      if (modal === "tambah") {
        await api.post("/master/printers", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/printers/${editId}`, payload)
      }
      dispatch(invalidatePrinters())
      setModal(null)
    } catch (e) {
      const x = e as { response?: { data?: { message?: string } } }
      setError(x.response?.data?.message ?? t("printer.errSave"))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/printers/${deleteTarget.id}`)
      dispatch(invalidatePrinters())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  // Test print — kirim printer ini ke print server, yang mencetak frasa acak.
  async function handleTestPrint(row: PrinterType) {
    if (testingId !== null) return
    setTestingId(row.id)
    try {
      toast.success(await testPrintPrinter(row))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("printer.errTestPrint"))
    } finally {
      setTestingId(null)
    }
  }

  const columns: Column<PrinterType>[] = [
    {
      header: t("printer.colName"),
      cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      header: t("printer.colDocType"),
      cell: (row) => (
        <Badge variant={row.document_type === "struk" ? "info" : "default"}>
          {row.document_type === "struk" ? t("printer.docReceipt") : t("printer.docLabel")}
        </Badge>
      ),
    },
    {
      header: t("printer.colLanguage"),
      cell: (row) => <span className="uppercase text-gray-700">{row.printer_language}</span>,
    },
    {
      header: t("printer.colConnection"),
      cell: (row) => (
        <div className="flex flex-col">
          <span className="capitalize text-gray-700">{row.connection_type}</span>
          {row.connection_type === "network" ? (
            <span className="text-xs text-gray-400">
              {row.ip_address ?? "—"}
              {row.port != null ? `:${row.port}` : ""}
            </span>
          ) : row.device_path ? (
            <span className="text-xs text-gray-400">{row.device_path}</span>
          ) : null}
        </div>
      ),
    },
    {
      header: t("common.status"),
      cell: (row) =>
        row.is_active ? (
          <Badge variant="success">{t("common.active")}</Badge>
        ) : (
          <Badge variant="default">{t("common.inactive")}</Badge>
        ),
      className: "w-24",
    },
    {
      header: t("printer.colDefault"),
      cell: (row) => {
        const isDef = defaultId === row.id
        return (
          <button
            type="button"
            onClick={() => toggleDefault(row.id)}
            title={isDef ? t("printer.defaultOnTitle") : t("printer.defaultOffTitle")}
            className={
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
              (isDef
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50")
            }
          >
            <Check className={"h-3.5 w-3.5 " + (isDef ? "text-amber-600" : "text-gray-300")} />
            {isDef ? t("printer.colDefault") : t("printer.setDefault")}
          </button>
        )
      },
      className: "w-32",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Printer className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("printer.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("printer.subtitle")}
            </p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          {t("printer.addPrinter")}
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("printer.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              {t("common.search")}
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : (
          <DataTable
            rowNumberOffset={(page - 1) * 20}
            columns={columns}
            data={items}
            extraActions={[
              {
                label: (row) => (testingId === row.id ? t("printer.printing") : t("printer.testPrint")),
                onClick: handleTestPrint,
                disabled: (row) => testingId !== null && testingId !== row.id,
                className: "border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/5",
              },
            ]}
            onEdit={openEdit}
            onDelete={(row) => setDeleteTarget(row)}
            isRowLoading={(row) => deletingId === row.id}
            emptyMessage={t("printer.empty")}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setPrinterPage(p))}
        />
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? t("printer.modalAdd") : t("printer.modalEdit")}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {error ? <p className="text-sm text-red-600">{error}</p> : <span />}
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setModal(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !canSave}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Umum */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pr-nama">{t("printer.colName")}</Label>
              <Input
                id="pr-nama"
                placeholder={t("printer.namePlaceholder")}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-jenis">{t("printer.colDocType")}</Label>
              <Select
                id="pr-jenis"
                value={form.document_type}
                onChange={(e) => set("document_type", e.target.value)}
              >
                <option value="struk">{t("printer.docReceipt")}</option>
                <option value="label">{t("printer.docLabel")}</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-bahasa">{t("printer.printerLanguage")}</Label>
              <Select
                id="pr-bahasa"
                value={form.printer_language}
                onChange={(e) => set("printer_language", e.target.value)}
              >
                <option value="escpos">ESC/POS</option>
                <option value="tspl">TSPL</option>
                <option value="zpl">ZPL</option>
                <option value="epl">EPL</option>
              </Select>
            </div>
          </div>

          {/* Koneksi */}
          <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("printer.colConnection")}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pr-koneksi">{t("printer.connectionType")}</Label>
                <Select
                  id="pr-koneksi"
                  value={form.connection_type}
                  onChange={(e) => set("connection_type", e.target.value)}
                >
                  <option value="network">Network</option>
                  <option value="usb">USB</option>
                  <option value="bluetooth">Bluetooth</option>
                  <option value="serial">Serial</option>
                </Select>
              </div>
              {isNetwork ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-ip">IP Address</Label>
                    <Input
                      id="pr-ip"
                      placeholder={t("printer.ipPlaceholder")}
                      value={form.ip_address}
                      onChange={(e) => set("ip_address", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-port">Port</Label>
                    <Input
                      id="pr-port"
                      type="number"
                      placeholder="9100"
                      value={form.port}
                      onChange={(e) => set("port", e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5 sm:col-span-1">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="pr-device">Device Path</Label>
                    <InfoHint align="right">
                      <DevicePathHint />
                    </InfoHint>
                  </div>
                  <Input
                    id="pr-device"
                    placeholder={t("printer.devicePathPlaceholder")}
                    value={form.device_path}
                    onChange={(e) => set("device_path", e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Khusus jenis dokumen */}
          {isStruk ? (
            <div className="space-y-4 rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("printer.receiptSettings")}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-kertas">{t("printer.paperSize")}</Label>
                  <Select
                    id="pr-kertas"
                    value={form.paper_size}
                    onChange={(e) => set("paper_size", e.target.value)}
                  >
                    <option value="58mm">58 mm</option>
                    <option value="80mm">80 mm</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-karakter">{t("printer.charPerLine")}</Label>
                  <Input
                    id="pr-karakter"
                    type="number"
                    placeholder={t("printer.charPlaceholder")}
                    value={form.char_per_line}
                    onChange={(e) => set("char_per_line", e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <CheckField
                  id="pr-autocut"
                  label={t("printer.autoCut")}
                  checked={form.auto_cut}
                  onChange={(v) => set("auto_cut", v)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("printer.labelSettings")}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-lebar">{t("printer.labelWidth")}</Label>
                  <Input
                    id="pr-lebar"
                    type="number"
                    placeholder={t("printer.labelWidthPlaceholder")}
                    value={form.label_width_mm}
                    onChange={(e) => set("label_width_mm", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-tinggi">{t("printer.labelHeight")}</Label>
                  <Input
                    id="pr-tinggi"
                    type="number"
                    placeholder={t("printer.labelHeightPlaceholder")}
                    value={form.label_height_mm}
                    onChange={(e) => set("label_height_mm", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-gap">{t("printer.labelGap")}</Label>
                  <Input
                    id="pr-gap"
                    type="number"
                    step="0.1"
                    placeholder={t("printer.labelGapPlaceholder")}
                    value={form.label_gap_mm}
                    onChange={(e) => set("label_gap_mm", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Lainnya */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="pr-codepage">{t("printer.codePageTitle")}</Label>
                <InfoHint>
                  <CodePageHint />
                </InfoHint>
              </div>
              <Input
                id="pr-codepage"
                placeholder="CP437"
                value={form.code_page}
                onChange={(e) => set("code_page", e.target.value)}
              />
            </div>
            <div className="pb-2">
              <CheckField
                id="pr-aktif"
                label={t("printer.printerActive")}
                checked={form.is_active}
                onChange={(v) => set("is_active", v)}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

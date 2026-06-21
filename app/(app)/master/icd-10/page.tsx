"use client"

import { useEffect, useRef, useState } from "react"
import { Search, Upload } from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchIcd10,
  setIcd10Search,
  setIcd10Page,
  invalidateIcd10,
  type Icd10,
} from "@/lib/store/slices/icd10Slice"
import api from "@/lib/axios"

const emptyForm = { code: "", display: "", version: "" }

// Satu baris hasil parsing Excel.
type ImportRow = { code: string; display: string; version: string }

// Baris yang dilewati saat impor + alasannya.
type SkippedRow = { code: string; display: string; version: string; reason: string }

// Ringkasan hasil impor dari backend (per batch).
type ImportResult = {
  imported: number
  skipped: number
  total: number
  skipped_rows?: SkippedRow[]
}

// Parse worksheet Excel jadi baris {code, display, version}. Mendukung file
// dengan header (kolom bernama code/display/version, urutan bebas) maupun tanpa
// header (kolom berurutan: code, display, version).
function parseRows(rows: unknown[][]): ImportRow[] {
  if (rows.length === 0) return []

  const norm = (v: unknown) => String(v ?? "").trim()
  const first = rows[0].map((c) => norm(c).toLowerCase())
  const hasHeader =
    first.includes("code") && first.includes("display") && first.includes("version")

  let idxCode = 0
  let idxDisplay = 1
  let idxVersion = 2
  let dataRows = rows

  if (hasHeader) {
    idxCode = first.indexOf("code")
    idxDisplay = first.indexOf("display")
    idxVersion = first.indexOf("version")
    dataRows = rows.slice(1)
  }

  const out: ImportRow[] = []
  for (const r of dataRows) {
    const code = norm(r[idxCode])
    const display = norm(r[idxDisplay])
    const version = norm(r[idxVersion])
    // Lewati baris kosong.
    if (!code && !display && !version) continue
    out.push({ code, display, version })
  }
  return out
}

export default function MasterIcd10Page() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.icd10)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Icd10 | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Import Excel.
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [skippedRows, setSkippedRows] = useState<SkippedRow[]>([])
  // Preview hasil parsing sebelum disimpan ke database.
  const [previewRows, setPreviewRows] = useState<ImportRow[] | null>(null)
  const [previewFileName, setPreviewFileName] = useState("")
  // Progress penyimpanan per-batch (baris yang sudah dikirim / total).
  const [importDone, setImportDone] = useState(0)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchIcd10())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setIcd10Search(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: Icd10) {
    setForm({ code: row.code, display: row.display, version: row.version })
    setEditId(row.id)
    setModal("edit")
  }

  async function handleSave() {
    if (!form.code.trim() || !form.display.trim() || !form.version.trim()) return
    setSaving(true)
    try {
      if (modal === "tambah") {
        await api.post("/master/icd10", form)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/icd10/${editId}`, form)
      }
      dispatch(invalidateIcd10())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/icd10/${deleteTarget.id}`)
      dispatch(invalidateIcd10())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  // Baca file Excel → parse → tampilkan PREVIEW (belum disimpan). Penyimpanan ke
  // database dilakukan setelah user menekan "Simpan" di modal preview.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset input agar file yang sama bisa dipilih ulang nanti.
    e.target.value = ""
    if (!file) return

    setImportError(null)
    setImportResult(null)
    setSkippedRows([])
    setPreviewRows(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
      const items = parseRows(rows)

      if (items.length === 0) {
        setImportError("File tidak berisi data ICD 10 yang valid (kolom: code, display, version).")
        return
      }

      setPreviewFileName(file.name)
      setPreviewRows(items)
    } catch {
      setImportError("Gagal membaca file. Pastikan formatnya Excel/CSV yang benar.")
    }
  }

  // Simpan baris hasil preview ke database. Dikirim PER-BATCH (1000 baris) agar
  // hemat resource server (payload kecil, hindari timeout untuk data puluhan ribu).
  // Backend skip duplikat code+version (termasuk antar-batch karena tiap request
  // mengecek ulang ke database).
  async function handleConfirmImport() {
    if (!previewRows || importing) return
    const rows = previewRows
    const CHUNK = 1000
    setImporting(true)
    setImportDone(0)
    try {
      let imported = 0
      let skipped = 0
      let total = 0
      const allSkipped: SkippedRow[] = []
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const res = await api.post("/master/icd10/import", { items: chunk })
        const r = res.data.data as ImportResult
        imported += r.imported
        skipped += r.skipped
        total += r.total
        if (r.skipped_rows) allSkipped.push(...r.skipped_rows)
        setImportDone(Math.min(i + CHUNK, rows.length))
      }
      setSkippedRows(allSkipped)
      setImportResult({ imported, skipped, total })
      setPreviewRows(null)
      dispatch(invalidateIcd10())
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setImportError(x.response?.data?.message ?? "Gagal mengimpor file. Pastikan formatnya benar.")
      setPreviewRows(null)
    } finally {
      setImporting(false)
    }
  }

  const columns: Column<Icd10>[] = [
    {
      header: "Code",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.code}
        </span>
      ),
      className: "w-32",
    },
    {
      header: "Display",
      cell: (row) => <span className="text-gray-800">{row.display}</span>,
    },
    {
      header: "Version",
      cell: (row) =>
        row.version ? (
          <span className="text-gray-700">{row.version}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
      className: "w-28",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="ICD 10" subtitle="Kelola data master ICD 10" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="border-[#075489] text-[#075489] hover:bg-[#075489]/10"
          >
            <Upload className="h-4 w-4" />
            {importing ? "Mengimpor..." : "Import Excel"}
          </Button>
          <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
            + Tambah ICD 10
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari code, display, atau version..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              Cari
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            onEdit={openEdit}
            onDelete={(row) => setDeleteTarget(row)}
            isRowLoading={(row) => deletingId === row.id}
            emptyMessage="Belum ada data ICD 10."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setIcd10Page(p))}
        />
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      {/* Tambah / Edit ICD 10 */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? "Tambah ICD 10" : "Edit ICD 10"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Batal
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="icd-code">Code</Label>
            <Input
              id="icd-code"
              placeholder="Contoh: A00"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="icd-display">Display</Label>
            <Input
              id="icd-display"
              placeholder="Contoh: Cholera"
              value={form.display}
              onChange={(e) => setForm((f) => ({ ...f, display: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="icd-version">Version</Label>
            <Input
              id="icd-version"
              placeholder="Contoh: 2010"
              value={form.version}
              onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* Preview sebelum simpan ke database */}
      <Modal
        open={previewRows !== null}
        onClose={() => !importing && setPreviewRows(null)}
        title="Preview Import ICD 10"
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-xs text-gray-400">
              {previewRows?.length ?? 0} baris siap diimpor. Duplikat (code &amp; version sudah ada)
              akan dilewati otomatis.
            </span>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setPreviewRows(null)} disabled={importing}>
                Batal
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={importing}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {importing
                  ? `Menyimpan... (${importDone}/${previewRows?.length ?? 0})`
                  : `Simpan ${previewRows?.length ?? 0} Data`}
              </Button>
            </div>
          </div>
        }
      >
        {previewRows && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              File: <span className="font-medium text-gray-700">{previewFileName}</span>
            </p>
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-100">
                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-12">
                      #
                    </th>
                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Code
                    </th>
                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Display
                    </th>
                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-28">
                      Version
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {previewRows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-3 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 px-3">
                        <span className="font-mono text-xs font-semibold text-[#075489]">{r.code}</span>
                      </td>
                      <td className="py-1.5 px-3 text-gray-800">{r.display}</td>
                      <td className="py-1.5 px-3 text-gray-700">{r.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewRows.length > 200 && (
              <p className="text-xs text-gray-400">
                Menampilkan 200 dari {previewRows.length} baris. Semua baris akan tetap diimpor saat
                disimpan.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Hasil impor Excel */}
      <Modal
        open={importResult !== null || importError !== null}
        onClose={() => {
          setImportResult(null)
          setImportError(null)
          setSkippedRows([])
        }}
        title="Hasil Import Excel"
        size={importResult && importResult.skipped > 0 ? "lg" : "sm"}
        footer={
          <Button
            onClick={() => {
              setImportResult(null)
              setImportError(null)
              setSkippedRows([])
            }}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            Tutup
          </Button>
        }
      >
        {importError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{importError}</p>
        ) : importResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-lg font-semibold text-gray-800">{importResult.total}</p>
                <p className="text-xs text-gray-400">Total dibaca</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <p className="text-lg font-semibold text-green-700">{importResult.imported}</p>
                <p className="text-xs text-green-600">Ditambahkan</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-lg font-semibold text-amber-700">{importResult.skipped}</p>
                <p className="text-xs text-amber-600">Dilewati</p>
              </div>
            </div>

            {skippedRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Baris yang dilewati
                </p>
                <div className="max-h-[45vh] overflow-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-100">
                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Code
                        </th>
                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Display
                        </th>
                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-24">
                          Version
                        </th>
                        <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-64">
                          Alasan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {skippedRows.slice(0, 200).map((r, i) => (
                        <tr key={i}>
                          <td className="py-1.5 px-3">
                            <span className="font-mono text-xs font-semibold text-[#075489]">
                              {r.code}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-gray-800">{r.display}</td>
                          <td className="py-1.5 px-3 text-gray-700">{r.version}</td>
                          <td className="py-1.5 px-3 text-amber-600">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {skippedRows.length > 200 && (
                  <p className="text-xs text-gray-400">
                    Menampilkan 200 dari {skippedRows.length} baris yang dilewati.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

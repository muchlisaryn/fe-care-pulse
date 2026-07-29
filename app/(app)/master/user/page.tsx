"use client"

import { useEffect, useRef, useState } from "react"
import { Download, Search, Upload } from "lucide-react"
// Fork SheetJS yang bisa MENULIS gaya sel. Versi `xlsx` biasa hanya menulis dua
// fill bawaan, jadi header kuning penanda kolom wajib tidak akan muncul di sana.
import * as XLSX from "xlsx-js-style"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchUsers,
  setUserSearch,
  setUserPage,
  invalidateUsers,
  type User,
} from "@/lib/store/slices/userSlice"
import {
  fetchAuthorities,
} from "@/lib/store/slices/authoritySlice"
import api from "@/lib/axios"

type UserForm = {
  name: string
  username: string
  email: string
  no_telephone: string
  authority_id: number | ""
  password: string
  password_confirmation: string
}

type RegisterForm = UserForm
type EditForm = UserForm

const emptyRegister: RegisterForm = {
  name: "",
  username: "",
  email: "",
  no_telephone: "",
  authority_id: "",
  password: "",
  password_confirmation: "",
}

const emptyEdit: EditForm = {
  name: "",
  username: "",
  email: "",
  no_telephone: "",
  authority_id: "",
  password: "",
  password_confirmation: "",
}

const PER_PAGE = 20

// Kolom berkas import. Urutannya juga dipakai sebagai template & header yang
// dicocokkan saat membaca berkas (pencocokan tidak peka huruf besar/kecil).
const IMPORT_COLUMNS = ["name", "username", "email", "no_telephone", "authority", "password"] as const

// Kolom yang WAJIB terisi di setiap baris — dipakai untuk mewarnai header template
// kuning. `password` tidak masuk sini: baris yang mengosongkannya memakai password
// default yang diisi di modal import.
const REQUIRED_COLUMNS: ReadonlySet<string> = new Set(["name", "username", "authority"])

// Lebar kolom template biar isinya tidak terpotong saat dibuka di Excel.
const COLUMN_WIDTH: Record<string, number> = {
  name: 26,
  username: 18,
  email: 28,
  no_telephone: 16,
  authority: 22,
  password: 16,
  keterangan: 52,
}

const THIN_BORDER = {
  top: { style: "thin", color: { rgb: "BFBFBF" } },
  bottom: { style: "thin", color: { rgb: "BFBFBF" } },
  left: { style: "thin", color: { rgb: "BFBFBF" } },
  right: { style: "thin", color: { rgb: "BFBFBF" } },
} as const

/** Header kuning = wajib diisi. */
const STYLE_REQUIRED = {
  fill: { patternType: "solid", fgColor: { rgb: "FFE699" } },
  font: { bold: true, color: { rgb: "7F6000" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: THIN_BORDER,
}

/** Header abu-abu = opsional. */
const STYLE_OPTIONAL = {
  fill: { patternType: "solid", fgColor: { rgb: "F2F2F2" } },
  font: { bold: true, color: { rgb: "595959" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: THIN_BORDER,
}

/** Header merah = kolom keterangan pada berkas baris gagal (diabaikan saat diunggah ulang). */
const STYLE_NOTE = {
  fill: { patternType: "solid", fgColor: { rgb: "F8CBAD" } },
  font: { bold: true, color: { rgb: "833C00" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: THIN_BORDER,
}

/**
 * Bangun sheet dari header + baris, lalu warnai barisan header: kuning untuk kolom
 * wajib, abu-abu untuk opsional. Inilah satu-satunya petunjuk kolom mana yang wajib —
 * modal import sengaja tidak lagi mendaftarnya sebagai teks.
 */
function buildStyledSheet(headers: readonly string[], rows: string[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([[...headers], ...rows])

  headers.forEach((header, i) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: i })
    const cell = sheet[ref]
    if (!cell) return
    cell.s =
      header === "keterangan"
        ? STYLE_NOTE
        : REQUIRED_COLUMNS.has(header)
          ? STYLE_REQUIRED
          : STYLE_OPTIONAL
  })

  sheet["!cols"] = headers.map((h) => ({ wch: COLUMN_WIDTH[h] ?? 18 }))
  return sheet
}

// Baris dikirim ke server PER BATCH, bukan sekaligus: 1000+ baris jadi beberapa
// request kecil sehingga tidak timeout & progresnya bisa ditampilkan. Harus ≤
// batas IMPORT_CHUNK_MAX di UserController.
const IMPORT_CHUNK = 100

type ImportRow = {
  row: number
  name: string
  username: string
  email: string
  no_telephone: string
  authority: string
  password: string
}

type ImportError = { row: number; username: string | null; message: string }

/**
 * Ubah isi sheet (array of array) jadi baris import. Baris pertama dianggap header;
 * kolom dicocokkan lewat NAMANYA, jadi urutan kolom di berkas boleh berbeda dan
 * kolom tambahan diabaikan.
 */
function parseSheetRows(raw: unknown[][]): ImportRow[] {
  if (raw.length === 0) return []

  const header = (raw[0] ?? []).map((c) => String(c ?? "").trim().toLowerCase())
  const indexOf = (name: string) => header.indexOf(name)
  const cols = {
    name: indexOf("name"),
    username: indexOf("username"),
    email: indexOf("email"),
    no_telephone: indexOf("no_telephone"),
    authority: indexOf("authority"),
    password: indexOf("password"),
  }
  // Tanpa header yang dikenali, berkasnya bukan format yang diharapkan. Kolom
  // `email` TIDAK wajib — berkas tanpa kolom itu tetap boleh diimpor.
  if (cols.name < 0 || cols.username < 0) return []

  const cell = (r: unknown[], i: number) => (i < 0 ? "" : String(r[i] ?? "").trim())

  return raw
    .slice(1)
    .map((r, i) => ({
      // +2: baris 1 adalah header & nomor baris spreadsheet mulai dari 1, supaya
      // nomor pada laporan error cocok dengan yang dilihat user di Excel.
      row: i + 2,
      name: cell(r, cols.name),
      username: cell(r, cols.username),
      email: cell(r, cols.email),
      no_telephone: cell(r, cols.no_telephone),
      authority: cell(r, cols.authority),
      password: cell(r, cols.password),
    }))
    .filter((r) => r.name || r.username)
}

/**
 * Samakan bentuk teks sebelum dibandingkan: huruf besar/kecil diabaikan dan spasi
 * ganda dirapatkan, supaya "Perawat  CSSD" tetap cocok dengan "Perawat CSSD".
 */
function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

/** Jarak Levenshtein — dipakai untuk menebak otoritas yang dimaksud saat salah ketik. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }

  return prev[b.length]
}

/**
 * Cari nama otoritas terdekat dari daftar yang sah. Ambang 1/3 panjang teks: cukup
 * longgar untuk menangkap salah ketik satu-dua huruf, tapi tidak sampai menyarankan
 * nama yang sama sekali berbeda.
 */
function suggestAuthority(input: string, names: string[]): string | null {
  const target = normalize(input)
  let best: { name: string; distance: number } | null = null

  for (const name of names) {
    const distance = editDistance(target, normalize(name))
    if (!best || distance < best.distance) best = { name, distance }
  }

  if (!best) return null
  return best.distance <= Math.max(1, Math.floor(target.length / 3)) ? best.name : null
}

/**
 * Saring baris yang sudah pasti ditolak SEBELUM apa pun dikirim ke server:
 *
 * 1. Username kembar sesama baris berkas — server hanya tahu bentrok dengan data
 *    existing; duplikat internal baru ketahuan saat baris kedua disimpan dan bisa
 *    tercecer antar batch.
 * 2. Nama otoritas yang tidak dikenal — dicegat di sini supaya keterangannya bisa
 *    menyertakan tebakan nama yang benar, sesuatu yang tidak bisa dilakukan server
 *    tanpa menghitung ulang seluruh daftar otoritas per baris.
 *
 * Pengecekan otoritas dilewati bila daftarnya belum termuat — biar server yang
 * memutuskan, daripada menolak baris yang sebenarnya benar.
 */
function preflightRows(
  rows: ImportRow[],
  authorityNames: string[],
): { accepted: ImportRow[]; rejected: ImportError[] } {
  const firstSeenAt = new Map<string, number>()
  const validAuthorities = new Set(authorityNames.map(normalize))
  const accepted: ImportRow[] = []
  const rejected: ImportError[] = []

  for (const row of rows) {
    if (authorityNames.length > 0) {
      const authority = normalize(row.authority)
      if (!authority) {
        rejected.push({
          row: row.row,
          username: row.username,
          message: "Kolom authority wajib diisi.",
        })
        continue
      }
      if (!validAuthorities.has(authority)) {
        const suggestion = suggestAuthority(row.authority, authorityNames)
        rejected.push({
          row: row.row,
          username: row.username,
          message: suggestion
            ? `Otoritas "${row.authority}" tidak dikenal. Maksudnya "${suggestion}"?`
            : `Otoritas "${row.authority}" tidak dikenal. Lihat sheet "Daftar Otoritas" pada template.`,
        })
        continue
      }
    }

    const username = normalize(row.username)
    // Username kosong dibiarkan lolos: biar server yang menjelaskan bahwa kolomnya wajib.
    if (!username) {
      accepted.push(row)
      continue
    }

    const firstRow = firstSeenAt.get(username)
    if (firstRow !== undefined) {
      rejected.push({
        row: row.row,
        username: row.username,
        message: `Username "${row.username}" sudah dipakai baris ${firstRow} pada berkas ini.`,
      })
      continue
    }

    firstSeenAt.set(username, row.row)
    accepted.push(row)
  }

  return { accepted, rejected }
}

export default function MasterUserPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.users)
  const { items: authorities, loaded: authoritiesLoaded } =
    useAppSelector((s) => s.authorities)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState<RegisterForm>(emptyRegister)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Import: berkas di-parse di browser, dikirim per batch dengan progres.
  const fileRef = useRef<HTMLInputElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null)
  const [importFileName, setImportFileName] = useState("")
  const [defaultPassword, setDefaultPassword] = useState("")
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ created: number; failed: number } | null>(null)
  const [importErrors, setImportErrors] = useState<ImportError[]>([])
  // Baris yang sudah pasti ditolak (username kembar / otoritas tak dikenal),
  // ditemukan sebelum apa pun dikirim ke server.
  const [preflightErrors, setPreflightErrors] = useState<ImportError[]>([])
  // Seluruh baris berkas (termasuk yang gagal) supaya berkas "baris gagal" bisa
  // dibangun ulang lengkap dengan isinya, bukan cuma nomor baris.
  const [sourceRows, setSourceRows] = useState<Map<number, ImportRow>>(new Map())

  // Syarat yang sama dengan `default_password` di server. Dihitung di sini supaya
  // tombol import bisa ikut mati — dulu syaratnya baru muncul sebagai pesan error
  // SETELAH tombol diklik, jadi kalau state-nya kosong tanpa disadari (mis. field
  // diisi autofill browser) petugas cuma melihat tombol yang seperti tidak bekerja.
  const defaultPasswordValid = defaultPassword.trim().length >= 8

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchUsers())
  }, [loaded, dirty, dispatch])

  useEffect(() => {
    if (!authoritiesLoaded) dispatch(fetchAuthorities())
  }, [authoritiesLoaded, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setUserSearch(searchInput))
  }

  function handlePageChange(p: number) {
    dispatch(setUserPage(p))
  }

  /**
   * Unduh berkas contoh: satu sheet isian + satu sheet daftar otoritas yang sah.
   * Kolom `authority` diisi NAMA, bukan id — salah ketik nama pasti ditolak, sedangkan
   * salah ketik id bisa mendarat di id sah lain dan diam-diam memberi hak akses keliru.
   * Sheet kedua ada supaya namanya tinggal disalin, tidak perlu diketik ulang.
   */
  function handleDownloadTemplate() {
    const sheet = buildStyledSheet(IMPORT_COLUMNS, [
      ["Budi Santoso", "budi", "budi@rsijpk.co.id", "08123456789", authorities[0]?.name ?? "Administrator", ""],
    ])
    const authoritySheet = buildStyledSheet(
      ["authority"],
      authorities.map((a) => [a.name]),
    )

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, "Template")
    XLSX.utils.book_append_sheet(wb, authoritySheet, "Daftar Otoritas")
    XLSX.writeFile(wb, "template-import-user.xlsx")
  }

  /**
   * Unduh HANYA baris yang gagal, lengkap dengan isinya + kolom `keterangan`.
   * Header kolomnya sama persis dengan template, jadi berkas ini bisa diperbaiki
   * lalu diunggah ulang apa adanya — kolom `keterangan` diabaikan saat dibaca.
   */
  function handleDownloadFailed() {
    if (importErrors.length === 0) return

    const rows = importErrors.map((e) => {
      const src = sourceRows.get(e.row)
      return [
        src?.name ?? "",
        src?.username ?? e.username ?? "",
        src?.email ?? "",
        src?.no_telephone ?? "",
        src?.authority ?? "",
        src?.password ?? "",
        e.message,
      ]
    })

    const sheet = buildStyledSheet([...IMPORT_COLUMNS, "keterangan"], rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, "Gagal")
    const base = importFileName.replace(/\.[^.]+$/, "") || "import-user"
    XLSX.writeFile(wb, `gagal-${base}.xlsx`)
  }

  function openImport() {
    setImportRows(null)
    setImportFileName("")
    setImportError(null)
    setImportResult(null)
    setImportErrors([])
    setPreflightErrors([])
    setSourceRows(new Map())
    setImportDone(0)
    setImportOpen(true)
  }

  /** Baca berkas di browser → tampilkan ringkasannya; belum dikirim ke server. */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset input agar berkas yang sama bisa dipilih ulang.
    e.target.value = ""
    if (!file) return

    setImportError(null)
    setImportResult(null)
    setImportErrors([])
    setPreflightErrors([])
    setSourceRows(new Map())
    setImportRows(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
      const parsed = parseSheetRows(raw)

      if (parsed.length === 0) {
        setImportError(
          "Berkas tidak berisi data user yang bisa dibaca. Pastikan barisan header-nya sama dengan template.",
        )
        return
      }

      const { accepted, rejected } = preflightRows(
        parsed,
        authorities.map((a) => a.name),
      )

      setImportFileName(file.name)
      setSourceRows(new Map(parsed.map((r) => [r.row, r])))
      setPreflightErrors(rejected)

      // Tidak ada satu pun baris yang bisa dikirim — langsung tampilkan sebagai
      // hasil gagal supaya berkas perbaikannya bisa diunduh saat itu juga.
      if (accepted.length === 0) {
        setImportErrors(rejected)
        setImportResult({ created: 0, failed: rejected.length })
        return
      }

      setImportRows(accepted)
    } catch {
      setImportError("Gagal membaca berkas. Pastikan formatnya Excel (.xlsx/.xls) atau CSV.")
    }
  }

  /**
   * Kirim baris hasil parse ke server PER BATCH. Batch berikutnya baru dikirim
   * setelah batch sebelumnya selesai, jadi beban server rata & progresnya nyata
   * (bukan animasi palsu). Baris yang gagal dikumpulkan tanpa menghentikan sisanya.
   */
  async function handleConfirmImport() {
    if (!importRows || importing) return
    // Tombolnya sudah mati saat syarat ini tak terpenuhi; ini jaring pengaman saja.
    if (!defaultPasswordValid) {
      setImportError("Password default wajib diisi, minimal 8 karakter.")
      return
    }

    setImporting(true)
    setImportError(null)
    setImportDone(0)
    try {
      let created = 0
      const failedRows: ImportError[] = []

      for (let i = 0; i < importRows.length; i += IMPORT_CHUNK) {
        const chunk = importRows.slice(i, i + IMPORT_CHUNK)
        const res = await api.post("/master/users/import", {
          rows: chunk,
          default_password: defaultPassword.trim(),
        })
        const r = res.data.data as { created: number; errors?: ImportError[] }
        created += r.created
        if (r.errors?.length) failedRows.push(...r.errors)
        setImportDone(Math.min(i + IMPORT_CHUNK, importRows.length))
      }

      // Baris yang dicegat di browser ikut dilaporkan sebagai baris gagal, lalu
      // seluruhnya diurutkan agar nomor barisnya sejajar dengan urutan di Excel.
      const allFailed = [...preflightErrors, ...failedRows].sort((a, b) => a.row - b.row)

      setImportResult({ created, failed: allFailed.length })
      setImportErrors(allFailed)
      setImportRows(null)
      dispatch(invalidateUsers())
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setImportError(x.response?.data?.message ?? "Gagal mengimpor berkas.")
    } finally {
      setImporting(false)
    }
  }

  function openTambah() {
    setForm(emptyRegister)
    setErrors({})
    setModal("tambah")
  }

  function openEdit(row: User) {
    setEditId(row.id)
    setEditForm({
      name: row.name,
      username: row.username,
      email: row.email ?? "",
      no_telephone: row.no_telephone ?? "",
      authority_id: row.authority_id ?? "",
      password: "",
      password_confirmation: "",
    })
    setErrors({})
    setModal("edit")
  }

  async function handleRegister() {
    if (!form.name.trim() || !form.username.trim() || !form.email.trim() || !form.authority_id || !form.password) return
    setErrors({})
    setSaving(true)
    try {
      await api.post("/master/users", form)
      setModal(null)
      dispatch(invalidateUsers())
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })
        ?.response?.data
      if (data?.errors) {
        const flat: Record<string, string> = {}
        for (const [key, msgs] of Object.entries(data.errors)) flat[key] = msgs[0]
        setErrors(flat)
      } else if (data?.message) {
        setErrors({ _: data.message })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!editForm.name.trim() || !editForm.username.trim() || !editForm.email.trim()) return
    setErrors({})
    setSaving(true)
    try {
      const payload: Record<string, string | number> = {
        name: editForm.name,
        username: editForm.username,
        email: editForm.email,
        no_telephone: editForm.no_telephone,
      }
      if (editForm.authority_id !== "") payload.authority_id = editForm.authority_id
      if (editForm.password) {
        payload.password = editForm.password
        payload.password_confirmation = editForm.password_confirmation
      }
      await api.put(`/master/users/${editId}`, payload)
      setModal(null)
      dispatch(invalidateUsers())
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })
        ?.response?.data
      if (data?.errors) {
        const flat: Record<string, string> = {}
        for (const [key, msgs] of Object.entries(data.errors)) flat[key] = msgs[0]
        setErrors(flat)
      } else if (data?.message) {
        setErrors({ _: data.message })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/users/${deleteTarget.id}`)
      dispatch(invalidateUsers())
      setDeleteTarget(null)
    } catch {
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<User>[] = [
    {
      header: "Nama",
      cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      header: "Username",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.username}
        </span>
      ),
      className: "w-36",
    },
    {
      header: "Email",
      cell: (row) =>
        row.email ? (
          <span className="text-sm text-gray-500">{row.email}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      header: "Otoritas",
      cell: (row) =>
        row.authority ? (
          <span className="text-sm text-gray-700">{row.authority.name}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
      className: "w-36",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Master User" subtitle="Kelola data pengguna sistem" />
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
            onClick={openImport}
            disabled={importing}
            className="border-[#075489] text-[#075489] hover:bg-[#075489]/10"
          >
            <Upload className="h-4 w-4" />
            Import Excel
          </Button>
          <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
            + Tambah User
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama, username, atau email..."
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
            rowNumberOffset={(page - 1) * PER_PAGE}
            columns={columns}
            data={items}
            onEdit={openEdit}
            onDelete={(row) => setDeleteTarget(row)}
            isRowLoading={(row) => deletingId === row.id}
            emptyMessage="Belum ada data user."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={PER_PAGE}
          onPageChange={handlePageChange}
        />
      </Card>

      {/* Import Excel — berkas dibaca di browser, dikirim per batch dengan progres. */}
      <Modal
        open={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        title="Import User"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              {importResult ? "Tutup" : "Batal"}
            </Button>
            {importRows && (
              <Button
                onClick={handleConfirmImport}
                disabled={importing || !defaultPasswordValid}
                title={defaultPasswordValid ? undefined : "Isi password default minimal 8 karakter"}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {importing ? "Mengimpor..." : `Import ${importRows.length} baris`}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <p className="font-medium text-gray-700">Format berkas</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-[#bf9000] bg-[#FFE699]" />
                Kolom wajib diisi
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-gray-300 bg-[#F2F2F2]" />
                Kolom opsional
              </span>
            </p>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#075489] hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Unduh template
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-default-password">
              Password default <span className="text-red-500">*</span>
            </Label>
            <Input
              id="import-default-password"
              name="import-default-password"
              type="password"
              // Tanpa ini browser mengisi sendiri field password dengan kredensial
              // login yang tersimpan. Pengisian itu tidak memicu onChange, jadi
              // kotaknya terlihat penuh sementara state di React masih kosong dan
              // import ditolak dengan alasan yang tak masuk akal bagi petugas.
              autoComplete="new-password"
              value={defaultPassword}
              onChange={(e) => setDefaultPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              disabled={importing}
              error={defaultPassword.length > 0 && !defaultPasswordValid}
            />
            {defaultPassword.length > 0 && !defaultPasswordValid ? (
              <p className="text-xs text-red-500">
                Password default minimal 8 karakter — baru {defaultPassword.trim().length} karakter.
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                Dipakai untuk baris yang kolom <span className="font-mono">password</span>-nya kosong.
              </p>
            )}
          </div>

          <div>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="w-full border-dashed border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" />
              {importFileName || "Pilih berkas Excel / CSV"}
            </Button>
            {importRows && !importing && (
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-semibold text-gray-800">{importRows.length}</span> baris siap
                diimport, dikirim {IMPORT_CHUNK} baris per batch.
              </p>
            )}
            {preflightErrors.length > 0 && !importResult && !importing && (
              <p className="mt-2 text-sm text-amber-700">
                <span className="font-semibold">{preflightErrors.length}</span> baris dilewati karena
                username-nya kembar di berkas ini atau otoritasnya tidak dikenal. Baris tersebut akan
                muncul di daftar gagal setelah import selesai.
              </p>
            )}
          </div>

          {/* Progres nyata: bertambah tiap batch selesai dikirim. */}
          {importing && importRows && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Mengimpor…</span>
                <span>
                  {importDone} / {importRows.length}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#075489] transition-all duration-300"
                  style={{ width: `${Math.round((importDone / importRows.length) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {importError}
            </div>
          )}

          {importResult && (
            <div className="space-y-2">
              <div
                className={
                  importResult.created > 0
                    ? "rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                    : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                }
              >
                Berhasil menambahkan <span className="font-semibold">{importResult.created}</span> user.
                {importResult.failed > 0 && (
                  <>
                    {" "}
                    <span className="font-semibold text-red-600">{importResult.failed}</span> baris
                    gagal.
                  </>
                )}
              </div>
              {importErrors.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">
                    Perbaiki berkas baris gagal, lalu unggah ulang berkas itu langsung.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadFailed}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#075489] px-3 py-1.5 text-xs font-medium text-[#075489] hover:bg-[#075489]/10"
                  >
                    <Download className="h-3.5 w-3.5" /> Unduh {importErrors.length} baris gagal
                  </button>
                </div>
              )}
              {importErrors.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        <th className="px-3 py-2">Baris</th>
                        <th className="px-3 py-2">Username</th>
                        <th className="px-3 py-2">Alasan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importErrors.map((e, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-600">{e.row}</td>
                          <td className="px-3 py-2 text-gray-800">
                            {e.username || <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-red-600">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      {/* Modal Tambah */}
      <Modal
        open={modal === "tambah"}
        onClose={() => setModal(null)}
        title="Tambah User"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button onClick={handleRegister} disabled={saving} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors._ && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errors._}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Nama Lengkap</Label>
            <Input
              id="u-name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-username">Username</Label>
              <Input
                id="u-username"
                placeholder="johndoe"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              />
              {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-authority">Otoritas</Label>
              <Select
                id="u-authority"
                value={form.authority_id}
                onChange={(e) => setForm((p) => ({ ...p, authority_id: e.target.value ? Number(e.target.value) : "" }))}
                error={!!errors.authority_id}
              >
                <option value="">Pilih otoritas...</option>
                {authorities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
              {errors.authority_id && <p className="text-xs text-red-500">{errors.authority_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-telephone">No. Telepon</Label>
              <Input
                id="u-telephone"
                placeholder="081234567890"
                value={form.no_telephone}
                onChange={(e) => setForm((p) => ({ ...p, no_telephone: e.target.value }))}
              />
              {errors.no_telephone && <p className="text-xs text-red-500">{errors.no_telephone}</p>}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-password">Password</Label>
                <Input
                  id="u-password"
                  type="password"
                  // Cegah browser mengisi field ini dengan password admin yang login.
                  autoComplete="new-password"
                  placeholder="Min. 8 karakter"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-confirm">Konfirmasi Password</Label>
                <Input
                  id="u-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ulangi password"
                  value={form.password_confirmation}
                  onChange={(e) => setForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Edit */}
      <Modal
        open={modal === "edit"}
        onClose={() => setModal(null)}
        title="Edit User"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors._ && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errors._}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Nama Lengkap</Label>
            <Input
              id="e-name"
              placeholder="John Doe"
              value={editForm.name}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-username">Username</Label>
              <Input
                id="e-username"
                placeholder="johndoe"
                value={editForm.username}
                onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
              />
              {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Email</Label>
              <Input
                id="e-email"
                type="email"
                placeholder="john@example.com"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-authority">Otoritas</Label>
              <Select
                id="e-authority"
                value={editForm.authority_id}
                onChange={(e) => setEditForm((p) => ({ ...p, authority_id: e.target.value ? Number(e.target.value) : "" }))}
                error={!!errors.authority_id}
              >
                <option value="">Pilih otoritas...</option>
                {authorities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
              {errors.authority_id && <p className="text-xs text-red-500">{errors.authority_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-telephone">No. Telepon</Label>
              <Input
                id="e-telephone"
                placeholder="081234567890"
                value={editForm.no_telephone}
                onChange={(e) => setEditForm((p) => ({ ...p, no_telephone: e.target.value }))}
              />
              {errors.no_telephone && <p className="text-xs text-red-500">{errors.no_telephone}</p>}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400 mb-3">Kosongkan jika tidak ingin mengubah password</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="e-password">Password Baru</Label>
                <Input
                  id="e-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min. 8 karakter"
                  value={editForm.password}
                  onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-confirm">Konfirmasi Password</Label>
                <Input
                  id="e-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ulangi password"
                  value={editForm.password_confirmation}
                  onChange={(e) => setEditForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchAsesmenCP,
  setAsesmenCPSearch,
  setAsesmenCPPage,
  setAsesmenCPRuang,
  setAsesmenCPStatus,
  invalidateAsesmenCP,
  type AsesmenClinicalPathway,
  type AsesmenStatusFilter,
} from "@/lib/store/slices/asesmenClinicalPathwaySlice"
import api from "@/lib/axios"

const dash = <span className="text-gray-400 text-xs">—</span>

// Item daftar formulir (template) untuk picker diagnosa.
type TemplateListItem = {
  id: number
  is_active: boolean
  points_count?: number
  keterangan?: string | null
  icd10?: { code: string; display: string } | null
}

type FormState = {
  template_id: string
  no_rm: string
  nama_pasien: string
  jenis_kelamin: "L" | "P"
  tanggal_lahir: string
  diagnosa_masuk: string
  penyakit_utama: string
  penyakit_penyerta: string
  komplikasi: string
  tindakan: string
  bb: string
  tb: string
  tanggal_jam_masuk: string
  tanggal_jam_keluar: string
  lama_rawat: string
  rencana_rawat: string
  ruang_id: string
  kelas: string
  rujukan: boolean
}

const emptyForm: FormState = {
  template_id: "",
  no_rm: "",
  nama_pasien: "",
  jenis_kelamin: "L",
  tanggal_lahir: "",
  diagnosa_masuk: "",
  penyakit_utama: "",
  penyakit_penyerta: "",
  komplikasi: "",
  tindakan: "",
  bb: "",
  tb: "",
  tanggal_jam_masuk: "",
  tanggal_jam_keluar: "",
  lama_rawat: "",
  rencana_rawat: "",
  ruang_id: "",
  kelas: "",
  rujukan: false,
}

const jkLabel = (v: string) => (v === "L" ? "Laki-laki" : v === "P" ? "Perempuan" : v)
const diagnosaText = (a: AsesmenClinicalPathway) =>
  a.template?.icd10 ? `${a.template.icd10.code} — ${a.template.icd10.display}` : "—"

export default function AsesmenPage() {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const { items, totalItems, totalPages, page, search, ruangId, status, loading, loaded, dirty } =
    useAppSelector((s) => s.asesmenCP)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editDiagnosa, setEditDiagnosa] = useState<string>("") // teks diagnosa saat edit (read-only)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [templateOptions, setTemplateOptions] = useState<{ value: string; label: string }[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [roomOptions, setRoomOptions] = useState<{ value: string; label: string }[]>([])

  // Anchor di atas body modal — untuk auto-scroll ke notif error saat simpan.
  const formTopRef = useRef<HTMLDivElement>(null)

  // Set error + scroll modal ke atas supaya notifnya kelihatan.
  function fail(msg: string) {
    setFormError(msg)
    requestAnimationFrame(() =>
      formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    )
  }

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchAsesmenCP())
  }, [loaded, dirty, dispatch])

  // Muat daftar ruangan untuk dropdown filter saat halaman dibuka.
  useEffect(() => {
    loadRooms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setAsesmenCPSearch(searchInput))
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Muat daftar formulir (template) aktif yang punya poin untuk dipilih.
  async function loadTemplates() {
    setTemplatesLoading(true)
    try {
      const opts: { value: string; label: string }[] = []
      let p = 1
      let last = 1
      do {
        const res = await api.get("/clinical-pathway/templates", { params: { page: p } })
        const data = res.data.data
        for (const t of data.data as TemplateListItem[]) {
          if (!t.is_active) continue
          if ((t.points_count ?? 0) === 0) continue
          const code = t.icd10?.code ?? "—"
          const display = t.icd10?.display ?? "Tanpa diagnosa"
          const ket = t.keterangan?.trim()
          const label = ket ? `${code} — ${display} (${ket})` : `${code} — ${display}`
          opts.push({ value: String(t.id), label })
        }
        last = data.last_page
        p++
      } while (p <= last)
      setTemplateOptions(opts)
    } finally {
      setTemplatesLoading(false)
    }
  }

  // Muat daftar ruangan dari master ruangan untuk dropdown ruang rawat.
  async function loadRooms() {
    const opts: { value: string; label: string }[] = []
    let p = 1
    let last = 1
    do {
      const res = await api.get("/master/rooms", { params: { page: p } })
      const data = res.data.data
      for (const r of data.data as { id: number; name: string }[]) {
        opts.push({ value: String(r.id), label: r.name })
      }
      last = data.last_page
      p++
    } while (p <= last)
    setRoomOptions(opts)
  }

  function openTambah() {
    setEditId(null)
    setForm(emptyForm)
    setFormError(null)
    setModal("tambah")
    loadTemplates()
    loadRooms()
  }

  function openEdit(row: AsesmenClinicalPathway) {
    setEditId(row.id)
    setEditDiagnosa(diagnosaText(row))
    loadRooms()
    setForm({
      template_id: String(row.template_id),
      no_rm: row.no_rm,
      nama_pasien: row.nama_pasien,
      jenis_kelamin: row.jenis_kelamin ?? "L",
      tanggal_lahir: (row.tanggal_lahir ?? "").slice(0, 10),
      diagnosa_masuk: row.diagnosa_masuk ?? "",
      penyakit_utama: row.penyakit_utama ?? "",
      penyakit_penyerta: row.penyakit_penyerta ?? "",
      komplikasi: row.komplikasi ?? "",
      tindakan: row.tindakan ?? "",
      bb: row.bb ?? "",
      tb: row.tb ?? "",
      tanggal_jam_masuk: (row.tanggal_jam_masuk ?? "").slice(0, 16),
      tanggal_jam_keluar: (row.tanggal_jam_keluar ?? "").slice(0, 16),
      lama_rawat: row.lama_rawat != null ? String(row.lama_rawat) : "",
      rencana_rawat: row.rencana_rawat ?? "",
      ruang_id: row.ruang_id != null ? String(row.ruang_id) : "",
      kelas: row.kelas ?? "",
      rujukan: row.rujukan,
    })
    setFormError(null)
    setModal("edit")
  }

  async function handleSave() {
    if (modal === "tambah" && !form.template_id) {
      fail("Pilih diagnosa (formulir) dulu.")
      return
    }
    if (!form.no_rm.trim()) {
      fail("No RM wajib diisi.")
      return
    }
    if (!form.nama_pasien.trim()) {
      fail("Nama pasien wajib diisi.")
      return
    }
    if (!form.ruang_id) {
      fail("Ruang rawat wajib diisi.")
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      template_id: Number(form.template_id),
      no_rm: form.no_rm.trim(),
      nama_pasien: form.nama_pasien.trim(),
      jenis_kelamin: form.jenis_kelamin,
      tanggal_lahir: form.tanggal_lahir,
      diagnosa_masuk: form.diagnosa_masuk.trim(),
      penyakit_utama: form.penyakit_utama.trim() || null,
      penyakit_penyerta: form.penyakit_penyerta.trim() || null,
      komplikasi: form.komplikasi.trim() || null,
      tindakan: form.tindakan.trim() || null,
      bb: form.bb !== "" ? Number(form.bb) : null,
      tb: form.tb !== "" ? Number(form.tb) : null,
      tanggal_jam_masuk: form.tanggal_jam_masuk,
      tanggal_jam_keluar: form.tanggal_jam_keluar || null,
      lama_rawat: form.lama_rawat !== "" ? Number(form.lama_rawat) : null,
      rencana_rawat: form.rencana_rawat.trim() || null,
      ruang_id: form.ruang_id !== "" ? Number(form.ruang_id) : null,
      kelas: form.kelas.trim() || null,
      rujukan: form.rujukan,
    }
    try {
      let newId: number | null = null
      if (modal === "tambah") {
        const res = await api.post("/clinical-pathway/asesmen", payload)
        newId = res.data.data?.id ?? null
      } else if (editId !== null) {
        await api.put(`/clinical-pathway/asesmen/${editId}`, payload)
      }
      dispatch(invalidateAsesmenCP())
      setModal(null)
      // Setelah membuat asesmen baru, langsung arahkan ke pengisian formulir.
      if (newId) router.push(`/clinical-pathway/asesmen/${newId}`)
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      fail(x.response?.data?.message ?? "Gagal menyimpan asesmen.")
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<AsesmenClinicalPathway>[] = [
    {
      header: "No RM",
      cell: (row) => <span className="font-mono text-xs text-gray-700">{row.no_rm}</span>,
      className: "w-28",
    },
    {
      header: "Nama Pasien",
      cell: (row) => <span className="font-medium text-gray-900">{row.nama_pasien}</span>,
    },
    {
      header: "L/P",
      cell: (row) => <Badge variant="default">{jkLabel(row.jenis_kelamin)}</Badge>,
      className: "w-28",
    },
    {
      header: "Diagnosa Masuk",
      cell: (row) => <span className="text-gray-700">{row.diagnosa_masuk}</span>,
    },
    {
      header: "Formulir (Diagnosa)",
      cell: (row) =>
        row.template?.icd10 ? (
          <span className="text-gray-700">
            <span className="font-mono text-xs font-semibold text-[#4ba69d]">
              {row.template.icd10.code}
            </span>{" "}
            {row.template.icd10.display}
          </span>
        ) : (
          dash
        ),
    },
    {
      header: "Tgl Masuk",
      cell: (row) =>
        row.tanggal_jam_masuk ? (
          <span className="text-gray-700">{row.tanggal_jam_masuk.slice(0, 16).replace("T", " ")}</span>
        ) : (
          dash
        ),
      className: "w-44",
    },
    {
      header: "Status",
      cell: (row) =>
        row.verifikasi_pelaksana_at ? (
          <Badge variant="success">Selesai</Badge>
        ) : (
          <Badge variant="warning">Belum Terverifikasi</Badge>
        ),
      className: "w-44",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Asesmen" subtitle="Pengisian clinical pathway per pasien" />
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Asesmen
        </Button>
      </div>

      <Card className="p-0">
        <div className="space-y-3 px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama pasien atau diagnosa masuk..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              Cari
            </Button>
          </form>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={ruangId}
              onChange={(e) => dispatch(setAsesmenCPRuang(e.target.value))}
              className="sm:w-56"
            >
              <option value="">Semua Ruangan</option>
              {roomOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => dispatch(setAsesmenCPStatus(e.target.value as AsesmenStatusFilter))}
              className="sm:w-56"
            >
              <option value="">Semua Status</option>
              <option value="belum">Belum Terverifikasi</option>
              <option value="selesai">Selesai</option>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            onEdit={openEdit}
            extraActions={[
              {
                label: "Isi Formulir",
                onClick: (row) => router.push(`/clinical-pathway/asesmen/${row.id}`),
                className: "border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/10",
              },
            ]}
            emptyMessage="Belum ada asesmen."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setAsesmenCPPage(p))}
        />
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? "Tambah Asesmen" : "Edit Asesmen"}
        size="lg"
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
          <div ref={formTopRef} />
          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}

          {/* Keterangan tanda wajib isi. */}
          <p className="text-xs text-gray-500">
            <span className="text-red-500">*</span> wajib diisi
          </p>

          {/* Diagnosa / formulir — dipilih dulu sebelum mengisi. */}
          <div className="space-y-1.5">
            <Label>
              Diagnosa (Formulir) <span className="text-red-500">*</span>
            </Label>
            {modal === "edit" ? (
              <Input value={editDiagnosa} disabled />
            ) : templatesLoading ? (
              <p className="py-2 text-sm text-gray-400">Memuat daftar formulir...</p>
            ) : templateOptions.length === 0 ? (
              <p className="py-2 text-sm text-gray-400">
                Belum ada formulir berisi poin. Buat dulu di menu Formulir.
              </p>
            ) : (
              <SelectSearch
                options={templateOptions}
                value={form.template_id}
                onChange={(v) => set("template_id", v)}
                placeholder="Pilih diagnosa..."
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="norm">
                No RM <span className="text-red-500">*</span>
              </Label>
              <Input id="norm" value={form.no_rm} onChange={(e) => set("no_rm", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nama">
                Nama Pasien <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nama"
                value={form.nama_pasien}
                onChange={(e) => set("nama_pasien", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ruang">
                Ruang Rawat <span className="text-red-500">*</span>
              </Label>
              <Select
                id="ruang"
                value={form.ruang_id}
                onChange={(e) => set("ruang_id", e.target.value)}
              >
                <option value="">Pilih ruangan...</option>
                {roomOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kelas">Kelas</Label>
              <Input
                id="kelas"
                value={form.kelas}
                onChange={(e) => set("kelas", e.target.value)}
                placeholder="mis. Kelas 1, VIP"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jk">Jenis Kelamin</Label>
              <Select
                id="jk"
                value={form.jenis_kelamin}
                onChange={(e) => set("jenis_kelamin", e.target.value as "L" | "P")}
              >
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tgllahir">Tanggal Lahir</Label>
              <Input
                id="tgllahir"
                type="date"
                value={form.tanggal_lahir}
                onChange={(e) => set("tanggal_lahir", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dxmasuk">Diagnosa Masuk</Label>
              <Input
                id="dxmasuk"
                value={form.diagnosa_masuk}
                onChange={(e) => set("diagnosa_masuk", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="penyakitutama">Penyakit Utama</Label>
              <Input
                id="penyakitutama"
                value={form.penyakit_utama}
                onChange={(e) => set("penyakit_utama", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="penyakitpenyerta">Penyakit Penyerta</Label>
              <Input
                id="penyakitpenyerta"
                value={form.penyakit_penyerta}
                onChange={(e) => set("penyakit_penyerta", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="komplikasi">Komplikasi</Label>
              <Input
                id="komplikasi"
                value={form.komplikasi}
                onChange={(e) => set("komplikasi", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tindakan">Tindakan</Label>
              <Input
                id="tindakan"
                value={form.tindakan}
                onChange={(e) => set("tindakan", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bb">Berat Badan (kg)</Label>
              <Input
                id="bb"
                type="number"
                min={0}
                step="0.1"
                value={form.bb}
                onChange={(e) => set("bb", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb">Tinggi Badan (cm)</Label>
              <Input
                id="tb"
                type="number"
                min={0}
                step="0.1"
                value={form.tb}
                onChange={(e) => set("tb", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="masuk">Tanggal & Jam Masuk</Label>
              <Input
                id="masuk"
                type="datetime-local"
                value={form.tanggal_jam_masuk}
                onChange={(e) => set("tanggal_jam_masuk", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keluar">Tanggal & Jam Keluar</Label>
              <Input
                id="keluar"
                type="datetime-local"
                value={form.tanggal_jam_keluar}
                onChange={(e) => set("tanggal_jam_keluar", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lamarawat">Lama Rawat (hari)</Label>
              <Input
                id="lamarawat"
                type="number"
                min={0}
                value={form.lama_rawat}
                onChange={(e) => set("lama_rawat", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rencanarawat">Rencana Rawat</Label>
              <Input
                id="rencanarawat"
                value={form.rencana_rawat}
                onChange={(e) => set("rencana_rawat", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rujukan">Rujukan</Label>
              <Select
                id="rujukan"
                value={form.rujukan ? "ya" : "tidak"}
                onChange={(e) => set("rujukan", e.target.value === "ya")}
              >
                <option value="tidak">Tidak</option>
                <option value="ya">Ya</option>
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

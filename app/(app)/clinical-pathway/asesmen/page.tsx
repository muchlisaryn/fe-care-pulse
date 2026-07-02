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
  description?: string | null
  icd10?: { code: string; display: string } | null
}

type FormState = {
  template_id: string
  medical_record_no: string
  patient_name: string
  gender: "L" | "P"
  birth_date: string
  admission_diagnosis: string
  primary_disease: string
  comorbidity: string
  complication: string
  procedure: string
  weight: string
  height: string
  admitted_at: string
  discharged_at: string
  length_of_stay: string
  care_plan: string
  room_id: string
  ward_class: string
  is_referral: boolean
}

const emptyForm: FormState = {
  template_id: "",
  medical_record_no: "",
  patient_name: "",
  gender: "L",
  birth_date: "",
  admission_diagnosis: "",
  primary_disease: "",
  comorbidity: "",
  complication: "",
  procedure: "",
  weight: "",
  height: "",
  admitted_at: "",
  discharged_at: "",
  length_of_stay: "",
  care_plan: "",
  room_id: "",
  ward_class: "",
  is_referral: false,
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

  // Submit pencarian (nama pasien / diagnosa masuk).
  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setAsesmenCPSearch(searchInput))
  }

  // Helper set satu field form.
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
          const ket = t.description?.trim()
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

  // Buka modal tambah asesmen (reset form + muat pilihan formulir & ruangan).
  function openTambah() {
    setEditId(null)
    setForm(emptyForm)
    setFormError(null)
    setModal("tambah")
    loadTemplates()
    loadRooms()
  }

  // Buka modal edit — isi form dari data baris terpilih.
  function openEdit(row: AsesmenClinicalPathway) {
    setEditId(row.id)
    setEditDiagnosa(diagnosaText(row))
    loadRooms()
    setForm({
      template_id: String(row.template_id),
      medical_record_no: row.medical_record_no,
      patient_name: row.patient_name,
      gender: row.gender ?? "L",
      birth_date: (row.birth_date ?? "").slice(0, 10),
      admission_diagnosis: row.admission_diagnosis ?? "",
      primary_disease: row.primary_disease ?? "",
      comorbidity: row.comorbidity ?? "",
      complication: row.complication ?? "",
      procedure: row.procedure ?? "",
      weight: row.weight ?? "",
      height: row.height ?? "",
      admitted_at: (row.admitted_at ?? "").slice(0, 16),
      discharged_at: (row.discharged_at ?? "").slice(0, 16),
      length_of_stay: row.length_of_stay != null ? String(row.length_of_stay) : "",
      care_plan: row.care_plan ?? "",
      room_id: row.room_id != null ? String(row.room_id) : "",
      ward_class: row.ward_class ?? "",
      is_referral: row.is_referral,
    })
    setFormError(null)
    setModal("edit")
  }

  // Validasi ringan lalu simpan (create/update) asesmen.
  async function handleSave() {
    if (modal === "tambah" && !form.template_id) {
      fail("Pilih diagnosa (formulir) dulu.")
      return
    }
    if (!form.medical_record_no.trim()) {
      fail("No RM wajib diisi.")
      return
    }
    if (!form.patient_name.trim()) {
      fail("Nama pasien wajib diisi.")
      return
    }
    if (!form.room_id) {
      fail("Ruang rawat wajib diisi.")
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      template_id: Number(form.template_id),
      medical_record_no: form.medical_record_no.trim(),
      patient_name: form.patient_name.trim(),
      gender: form.gender,
      birth_date: form.birth_date,
      admission_diagnosis: form.admission_diagnosis.trim(),
      primary_disease: form.primary_disease.trim() || null,
      comorbidity: form.comorbidity.trim() || null,
      complication: form.complication.trim() || null,
      procedure: form.procedure.trim() || null,
      weight: form.weight !== "" ? Number(form.weight) : null,
      height: form.height !== "" ? Number(form.height) : null,
      admitted_at: form.admitted_at,
      discharged_at: form.discharged_at || null,
      length_of_stay: form.length_of_stay !== "" ? Number(form.length_of_stay) : null,
      care_plan: form.care_plan.trim() || null,
      room_id: form.room_id !== "" ? Number(form.room_id) : null,
      ward_class: form.ward_class.trim() || null,
      is_referral: form.is_referral,
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
      cell: (row) => <span className="font-mono text-xs text-gray-700">{row.medical_record_no}</span>,
      className: "w-28",
    },
    {
      header: "Nama Pasien",
      cell: (row) => <span className="font-medium text-gray-900">{row.patient_name}</span>,
    },
    {
      header: "L/P",
      cell: (row) => <Badge variant="default">{jkLabel(row.gender)}</Badge>,
      className: "w-28",
    },
    {
      header: "Diagnosa Masuk",
      cell: (row) => <span className="text-gray-700">{row.admission_diagnosis}</span>,
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
        row.admitted_at ? (
          <span className="text-gray-700">{row.admitted_at.slice(0, 16).replace("T", " ")}</span>
        ) : (
          dash
        ),
      className: "w-44",
    },
    {
      header: "Status",
      cell: (row) =>
        row.executor_verified_at ? (
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
              <Input
                id="norm"
                value={form.medical_record_no}
                onChange={(e) => set("medical_record_no", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nama">
                Nama Pasien <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nama"
                value={form.patient_name}
                onChange={(e) => set("patient_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ruang">
                Ruang Rawat <span className="text-red-500">*</span>
              </Label>
              <Select
                id="ruang"
                value={form.room_id}
                onChange={(e) => set("room_id", e.target.value)}
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
                value={form.ward_class}
                onChange={(e) => set("ward_class", e.target.value)}
                placeholder="mis. Kelas 1, VIP"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jk">Jenis Kelamin</Label>
              <Select
                id="jk"
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as "L" | "P")}
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
                value={form.birth_date}
                onChange={(e) => set("birth_date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dxmasuk">Diagnosa Masuk</Label>
              <Input
                id="dxmasuk"
                value={form.admission_diagnosis}
                onChange={(e) => set("admission_diagnosis", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="penyakitutama">Penyakit Utama</Label>
              <Input
                id="penyakitutama"
                value={form.primary_disease}
                onChange={(e) => set("primary_disease", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="penyakitpenyerta">Penyakit Penyerta</Label>
              <Input
                id="penyakitpenyerta"
                value={form.comorbidity}
                onChange={(e) => set("comorbidity", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="komplikasi">Komplikasi</Label>
              <Input
                id="komplikasi"
                value={form.complication}
                onChange={(e) => set("complication", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tindakan">Tindakan</Label>
              <Input
                id="tindakan"
                value={form.procedure}
                onChange={(e) => set("procedure", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bb">Berat Badan (kg)</Label>
              <Input
                id="bb"
                type="number"
                min={0}
                step="0.1"
                value={form.weight}
                onChange={(e) => set("weight", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb">Tinggi Badan (cm)</Label>
              <Input
                id="tb"
                type="number"
                min={0}
                step="0.1"
                value={form.height}
                onChange={(e) => set("height", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="masuk">Tanggal & Jam Masuk</Label>
              <Input
                id="masuk"
                type="datetime-local"
                value={form.admitted_at}
                onChange={(e) => set("admitted_at", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keluar">Tanggal & Jam Keluar</Label>
              <Input
                id="keluar"
                type="datetime-local"
                value={form.discharged_at}
                onChange={(e) => set("discharged_at", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lamarawat">Lama Rawat (hari)</Label>
              <Input
                id="lamarawat"
                type="number"
                min={0}
                value={form.length_of_stay}
                onChange={(e) => set("length_of_stay", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rencanarawat">Rencana Rawat</Label>
              <Input
                id="rencanarawat"
                value={form.care_plan}
                onChange={(e) => set("care_plan", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rujukan">Rujukan</Label>
              <Select
                id="rujukan"
                value={form.is_referral ? "ya" : "tidak"}
                onChange={(e) => set("is_referral", e.target.value === "ya")}
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

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { Switch } from "@/components/atoms/Switch"
import { Textarea } from "@/components/atoms/Textarea"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { Icd10SearchSelect, type Icd10Option } from "@/components/molecules/Icd10SearchSelect"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchTemplateCP,
  setTemplateCPSearch,
  setTemplateCPPage,
  invalidateTemplateCP,
  type TemplateClinicalPathway,
} from "@/lib/store/slices/templateClinicalPathwaySlice"
import api from "@/lib/axios"

const dash = <span className="text-gray-400 text-xs">—</span>

export default function TemplateClinicalPathwayPage() {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.templateCP)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [diagnosa, setDiagnosa] = useState<Icd10Option | null>(null)
  const [maksimalHari, setMaksimalHari] = useState("")
  const [keterangan, setKeterangan] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Baris yang sedang di-toggle statusnya.
  const [togglingId, setTogglingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchTemplateCP())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setTemplateCPSearch(searchInput))
  }

  function openTambah() {
    setEditId(null)
    setDiagnosa(null)
    setMaksimalHari("")
    setKeterangan("")
    setIsActive(true)
    setFormError(null)
    setModal("tambah")
  }

  function openEdit(row: TemplateClinicalPathway) {
    setEditId(row.id)
    setDiagnosa(
      row.icd10 ? { id: row.icd10.id, code: row.icd10.code, display: row.icd10.display } : null,
    )
    setMaksimalHari(String(row.maksimal_hari))
    setKeterangan(row.keterangan ?? "")
    setIsActive(row.is_active)
    setFormError(null)
    setModal("edit")
  }

  async function handleSave() {
    if (!diagnosa) {
      setFormError("Diagnosa (ICD 10) wajib dipilih.")
      return
    }
    if (!maksimalHari.trim() || Number(maksimalHari) < 1) {
      setFormError("Maksimal hari wajib diisi (minimal 1).")
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      icd10_id: diagnosa.id,
      maksimal_hari: Number(maksimalHari),
      keterangan: keterangan.trim() || null,
      is_active: isActive,
    }
    try {
      if (modal === "tambah") {
        await api.post("/clinical-pathway/templates", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/clinical-pathway/templates/${editId}`, payload)
      }
      dispatch(invalidateTemplateCP())
      setModal(null)
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setFormError(x.response?.data?.message ?? "Gagal menyimpan template.")
    } finally {
      setSaving(false)
    }
  }

  // Aktif / non-aktifkan template (tidak ada hapus).
  async function handleToggle(row: TemplateClinicalPathway) {
    if (togglingId !== null) return
    setTogglingId(row.id)
    try {
      await api.patch(`/clinical-pathway/templates/${row.id}/toggle`)
      dispatch(invalidateTemplateCP())
    } finally {
      setTogglingId(null)
    }
  }

  const columns: Column<TemplateClinicalPathway>[] = [
    {
      header: "Code ICD 10",
      cell: (row) =>
        row.icd10 ? (
          <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-0.5 rounded">
            {row.icd10.code}
          </span>
        ) : (
          dash
        ),
      className: "w-32",
    },
    {
      header: "Diagnosa",
      cell: (row) => (row.icd10 ? <span className="text-gray-800">{row.icd10.display}</span> : dash),
    },
    {
      header: "Maksimal Hari",
      cell: (row) => <span className="text-gray-700">{row.maksimal_hari} hari</span>,
      className: "w-32",
    },
    {
      header: "Keterangan",
      cell: (row) =>
        row.keterangan ? <span className="text-gray-700">{row.keterangan}</span> : dash,
    },
    {
      header: "Status",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.is_active}
            disabled={togglingId === row.id}
            onChange={() => handleToggle(row)}
          />
          {row.is_active ? (
            <Badge variant="success">Aktif</Badge>
          ) : (
            <Badge variant="default">Non-aktif</Badge>
          )}
        </div>
      ),
      className: "w-40",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Formulir"
          subtitle="Formulir clinical pathway per diagnosa (ICD 10)"
        />
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Formulir
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari diagnosa atau keterangan..."
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
            isRowLoading={(row) => togglingId === row.id}
            extraActions={[
              {
                label: "Formulir",
                onClick: (row) => router.push(`/clinical-pathway/formulir/${row.id}/formulir`),
                className: "border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/10",
              },
            ]}
            emptyMessage="Belum ada formulir clinical pathway."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setTemplateCPPage(p))}
        />
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? "Tambah Formulir" : "Edit Formulir"}
        size="md"
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
          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}
          <div className="space-y-1.5">
            <Label>Diagnosa (ICD 10)</Label>
            <Icd10SearchSelect value={diagnosa} onChange={setDiagnosa} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-hari">Maksimal Hari</Label>
            <Input
              id="tpl-hari"
              type="number"
              min={1}
              placeholder="Contoh: 5"
              value={maksimalHari}
              onChange={(e) => setMaksimalHari(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-ket">Keterangan</Label>
            <Textarea
              id="tpl-ket"
              rows={3}
              placeholder="Keterangan tambahan (opsional)"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-800">Status Aktif</p>
              <p className="text-xs text-gray-400">Formulir non-aktif tidak dipakai, tapi tidak terhapus.</p>
            </div>
            <Switch checked={isActive} onChange={setIsActive} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

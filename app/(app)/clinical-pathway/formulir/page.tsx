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
import { useT } from "@/lib/i18n"

const dash = <span className="text-gray-400 text-xs">—</span>

export default function TemplateClinicalPathwayPage() {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.templateCP)

  const t = useT()
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
    setMaksimalHari(String(row.max_days))
    setKeterangan(row.description ?? "")
    setIsActive(row.is_active)
    setFormError(null)
    setModal("edit")
  }

  async function handleSave() {
    if (!diagnosa) {
      setFormError(t("cpTemplate.errDiagnosis"))
      return
    }
    if (!maksimalHari.trim() || Number(maksimalHari) < 1) {
      setFormError(t("cpTemplate.errMaxDays"))
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      icd10_id: diagnosa.id,
      max_days: Number(maksimalHari),
      description: keterangan.trim() || null,
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
      setFormError(x.response?.data?.message ?? t("cpTemplate.errSave"))
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
      header: t("cpTemplate.colIcdCode"),
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
      header: t("cpTemplate.colDiagnosis"),
      cell: (row) => (row.icd10 ? <span className="text-gray-800">{row.icd10.display}</span> : dash),
    },
    {
      header: t("cpTemplate.colMaxDays"),
      cell: (row) => <span className="text-gray-700">{row.max_days} {t("common.days")}</span>,
      className: "w-32",
    },
    {
      header: t("common.description"),
      cell: (row) =>
        row.description ? <span className="text-gray-700">{row.description}</span> : dash,
    },
    {
      header: t("common.status"),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.is_active}
            disabled={togglingId === row.id}
            onChange={() => handleToggle(row)}
          />
          {row.is_active ? (
            <Badge variant="success">{t("common.active")}</Badge>
          ) : (
            <Badge variant="default">{t("cpTemplate.inactive")}</Badge>
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
          title={t("cpTemplate.title")}
          subtitle={t("cpTemplate.subtitle")}
        />
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          {t("cpTemplate.addForm")}
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("cpTemplate.searchPlaceholder")}
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
            onEdit={openEdit}
            isRowLoading={(row) => togglingId === row.id}
            extraActions={[
              {
                label: t("cpTemplate.formAction"),
                onClick: (row) => router.push(`/clinical-pathway/formulir/${row.id}/formulir`),
                className: "border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/10",
              },
            ]}
            emptyMessage={t("cpTemplate.empty")}
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
        title={modal === "tambah" ? t("cpTemplate.modalAdd") : t("cpTemplate.modalEdit")}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}
          <div className="space-y-1.5">
            <Label>{t("cpTemplate.diagnosisLabel")}</Label>
            <Icd10SearchSelect value={diagnosa} onChange={setDiagnosa} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-hari">{t("cpTemplate.colMaxDays")}</Label>
            <Input
              id="tpl-hari"
              type="number"
              min={1}
              placeholder={t("cpTemplate.maxDaysPlaceholder")}
              value={maksimalHari}
              onChange={(e) => setMaksimalHari(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-ket">{t("common.description")}</Label>
            <Textarea
              id="tpl-ket"
              rows={3}
              placeholder={t("cpTemplate.notePlaceholder")}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-800">{t("cpTemplate.activeStatus")}</p>
              <p className="text-xs text-gray-400">{t("cpTemplate.activeStatusHint")}</p>
            </div>
            <Switch checked={isActive} onChange={setIsActive} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

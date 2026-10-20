"use client"

import { useEffect, useState } from "react"
import { Search, Ruler } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchUnits,
  setUnitSearch,
  setUnitPage,
  invalidateUnits,
  type UnitMaster,
} from "@/lib/store/slices/unitSlice"
import api from "@/lib/axios"
import { apiErrorMessage } from "@/lib/apiError"
import { useT } from "@/lib/i18n"

const emptyForm = {
  name: "",
  note: "",
}

export default function MasterUnitPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.units
  )

  const t = useT()
  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UnitMaster | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // Hasil simpan/hapus — berhasil maupun gagal selalu dikabarkan lewat dialog.
  const [result, setResult] = useState<{ variant: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchUnits())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setUnitSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: UnitMaster) {
    setForm({ name: row.name, note: row.note ?? "" })
    setEditId(row.id)
    setModal("edit")
  }

  const canSave = form.name.trim().length > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        note: form.note.trim() || null,
      }
      if (modal === "tambah") {
        await api.post("/master/units", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/units/${editId}`, payload)
      }
      dispatch(invalidateUnits())
      setResult({
        variant: "success",
        text: modal === "tambah" ? "masterUnit.added" : "masterUnit.updated",
      })
      setModal(null)
    } catch (err) {
      // Modalnya dibiarkan terbuka supaya isian tidak hilang — mis. nama yang
      // ternyata sudah dipakai tinggal diganti.
      setResult({ variant: "error", text: apiErrorMessage(err, "masterUnit.saveFailed") })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/units/${deleteTarget.id}`)
      dispatch(invalidateUnits())
      setDeleteTarget(null)
      setResult({ variant: "success", text: "masterUnit.deleted" })
    } catch (err) {
      setDeleteTarget(null)
      setResult({ variant: "error", text: apiErrorMessage(err, "masterUnit.deleteFailed") })
    } finally {
      setDeletingId(null)
    }
  }

  const kosong = <span className="text-gray-400 text-xs">—</span>

  const columns: Column<UnitMaster>[] = [
    {
      header: t("masterUnit.colName"),
      cell: (row) => (
        <div>
          <span className="font-medium text-gray-900">{row.name}</span>
          {row.note ? <p className="text-xs text-gray-400 mt-0.5">{row.note}</p> : null}
        </div>
      ),
    },
    {
      header: t("masterUnit.colCreatedBy"),
      cell: (row) => (row.created_by ? <span className="text-gray-700">{row.created_by}</span> : kosong),
      className: "w-44",
    },
    {
      header: t("masterUnit.colUpdatedBy"),
      cell: (row) => (row.updated_by ? <span className="text-gray-700">{row.updated_by}</span> : kosong),
      className: "w-44",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Ruler className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("masterUnit.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("masterUnit.subtitle")}</p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          {t("masterUnit.add")}
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("masterUnit.searchPlaceholder")}
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
            onDelete={(row) => setDeleteTarget(row)}
            isRowLoading={(row) => deletingId === row.id}
            emptyMessage={t("masterUnit.empty")}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setUnitPage(p))}
        />
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      <ResultDialog
        open={result !== null}
        onClose={() => setResult(null)}
        variant={result?.variant ?? "success"}
        description={result ? t(result.text) : ""}
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? t("masterUnit.modalAdd") : t("masterUnit.modalEdit")}
        size="sm"
        footer={
          <>
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
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="unit-name">
              {t("masterUnit.colName")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="unit-name"
              placeholder={t("masterUnit.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit-note">{t("common.description")}</Label>
            <Textarea
              id="unit-note"
              placeholder={t("common.optionalPlaceholder")}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

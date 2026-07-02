"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
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
  fetchCategoriCP,
  setCategoriCPSearch,
  setCategoriCPPage,
  invalidateCategoriCP,
  type CategoriClinicalPathway,
} from "@/lib/store/slices/categoriClinicalPathwaySlice"
import api from "@/lib/axios"

const emptyForm = { urutan: "", label: "" }

export default function CategoriClinicalPathwayPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.categoriCP)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoriClinicalPathway | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchCategoriCP())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setCategoriCPSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setFormError(null)
    setModal("tambah")
  }

  function openEdit(row: CategoriClinicalPathway) {
    setForm({ urutan: String(row.sort_order), label: row.label })
    setEditId(row.id)
    setFormError(null)
    setModal("edit")
  }

  async function handleSave() {
    if (!form.urutan.trim() || !form.label.trim()) {
      setFormError("Urutan dan label wajib diisi.")
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = { sort_order: Number(form.urutan), label: form.label.trim() }
    try {
      if (modal === "tambah") {
        await api.post("/clinical-pathway/categories", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/clinical-pathway/categories/${editId}`, payload)
      }
      dispatch(invalidateCategoriCP())
      setModal(null)
    } catch (err) {
      const x = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      setFormError(
        x.response?.data?.errors?.sort_order?.[0] ??
          x.response?.data?.message ??
          "Gagal menyimpan. Pastikan urutan belum dipakai.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/clinical-pathway/categories/${deleteTarget.id}`)
      dispatch(invalidateCategoriCP())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<CategoriClinicalPathway>[] = [
    {
      header: "Urutan",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.sort_order}
        </span>
      ),
      className: "w-24",
    },
    {
      header: "Label",
      cell: (row) => <span className="font-medium text-gray-900">{row.label}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Kategori Clinical Pathway" subtitle="Kelola kategori template clinical pathway" />
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Kategori
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari label atau urutan..."
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
            emptyMessage="Belum ada kategori."
            hideRowNumber
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setCategoriCPPage(p))}
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
        title={modal === "tambah" ? "Tambah Kategori" : "Edit Kategori"}
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
          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cp-urutan">Urutan</Label>
            <Input
              id="cp-urutan"
              type="number"
              min={1}
              placeholder="Contoh: 1"
              value={form.urutan}
              onChange={(e) => setForm((f) => ({ ...f, urutan: e.target.value }))}
            />
            <p className="text-xs text-gray-400">Urutan harus unik (tidak boleh sama).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-label">Label</Label>
            <Input
              id="cp-label"
              placeholder="Contoh: Anamnesis"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

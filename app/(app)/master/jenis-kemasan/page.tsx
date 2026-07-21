"use client"

import { useEffect, useState } from "react"
import { Search, Package } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchPackagingTypes,
  setPackagingTypeSearch,
  setPackagingTypePage,
  invalidatePackagingTypes,
  type PackagingTypeMaster,
} from "@/lib/store/slices/packagingTypeSlice"
import api from "@/lib/axios"

const emptyForm = {
  name: "",
  shelf_life_days: "",
  note: "",
}

export default function MasterPackagingTypePage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.packagingTypes
  )

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PackagingTypeMaster | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchPackagingTypes())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setPackagingTypeSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: PackagingTypeMaster) {
    setForm({
      name: row.name,
      shelf_life_days: row.shelf_life_days.toString(),
      note: row.note ?? "",
    })
    setEditId(row.id)
    setModal("edit")
  }

  const canSave = form.name.trim().length > 0 && Number(form.shelf_life_days) >= 1

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        shelf_life_days: Number(form.shelf_life_days),
        note: form.note.trim() || null,
      }
      if (modal === "tambah") {
        await api.post("/master/packaging-types", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/packaging-types/${editId}`, payload)
      }
      dispatch(invalidatePackagingTypes())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/packaging-types/${deleteTarget.id}`)
      dispatch(invalidatePackagingTypes())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<PackagingTypeMaster>[] = [
    {
      header: "Kode",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.code}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Jenis Kemasan",
      cell: (row) => (
        <div>
          <span className="font-medium text-gray-900">{row.name}</span>
          {row.note ? <p className="text-xs text-gray-400 mt-0.5">{row.note}</p> : null}
        </div>
      ),
    },
    {
      header: "Kadaluwarsa",
      cell: (row) => <span className="text-gray-700">{row.shelf_life_days} hari</span>,
      className: "w-40",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Master Packaging</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Kelola jenis kemasan & masa simpan sterilnya — menentukan tanggal kedaluwarsa saat
              pengemasan
            </p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Jenis Kemasan
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama / kode jenis kemasan..."
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
            emptyMessage="Belum ada jenis kemasan."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setPackagingTypePage(p))}
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
        title={modal === "tambah" ? "Tambah Jenis Kemasan" : "Edit Jenis Kemasan"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Batal
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pt-name">Jenis Kemasan</Label>
            <Input
              id="pt-name"
              placeholder="Contoh: Pouch Plastik"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-shelf-life">Kadaluwarsa (hari)</Label>
            <Input
              id="pt-shelf-life"
              type="number"
              min={1}
              placeholder="Contoh: 30"
              value={form.shelf_life_days}
              onChange={(e) => setForm((f) => ({ ...f, shelf_life_days: e.target.value }))}
            />
            <p className="text-xs text-gray-400">
              Tanggal kedaluwarsa batch = tanggal kemas + masa simpan ini. Mengubahnya tidak
              menggeser tanggal batch yang sudah terlanjur dikemas.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-note">Keterangan</Label>
            <Textarea
              id="pt-note"
              placeholder="Opsional"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

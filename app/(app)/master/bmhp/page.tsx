"use client"

import { useEffect, useState } from "react"
import { Search, Boxes } from "lucide-react"
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
  fetchBmhps,
  setBmhpSearch,
  setBmhpPage,
  invalidateBmhps,
  type Bmhp,
} from "@/lib/store/slices/bmhpSlice"
import api from "@/lib/axios"

const emptyForm = { name: "", unit: "pcs", stock_qty: 0, description: "" }

export default function MasterBmhpPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.bmhps
  )

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Bmhp | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchBmhps())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setBmhpSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: Bmhp) {
    setForm({
      name: row.name,
      unit: row.unit,
      stock_qty: row.stock_qty,
      description: row.description ?? "",
    })
    setEditId(row.id)
    setModal("edit")
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit.trim() || "pcs",
        stock_qty: Number(form.stock_qty) || 0,
        description: form.description.trim() || null,
      }
      if (modal === "tambah") {
        await api.post("/master/bmhps", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/bmhps/${editId}`, payload)
      }
      dispatch(invalidateBmhps())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/bmhps/${deleteTarget.id}`)
      dispatch(invalidateBmhps())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<Bmhp>[] = [
    {
      header: "Kode",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.code}
        </span>
      ),
      className: "w-32",
    },
    {
      header: "Nama BMHP",
      cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      header: "Satuan",
      cell: (row) => <span className="text-gray-700">{row.unit}</span>,
      className: "w-24",
    },
    {
      header: "Stok",
      cell: (row) => (
        <span className={`font-semibold ${row.stock_qty <= 5 ? "text-red-500" : "text-gray-900"}`}>
          {row.stock_qty}
        </span>
      ),
      className: "w-20",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Master BMHP</h1>
            <p className="text-sm text-gray-500 mt-0.5">Kelola Bahan Medis Habis Pakai (consumables)</p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah BMHP
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama / kode BMHP..."
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
            emptyMessage="Belum ada data BMHP."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setBmhpPage(p))}
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
        title={modal === "tambah" ? "Tambah BMHP" : "Edit BMHP"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Batal
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bmhp-name">Nama BMHP</Label>
            <Input
              id="bmhp-name"
              placeholder="Contoh: Kasa Steril"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bmhp-unit">Satuan</Label>
              <Input
                id="bmhp-unit"
                placeholder="pcs / box"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bmhp-stock">Stok</Label>
              <Input
                id="bmhp-stock"
                type="number"
                min={0}
                value={form.stock_qty}
                onChange={(e) => setForm((f) => ({ ...f, stock_qty: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bmhp-desc">Keterangan</Label>
            <Textarea
              id="bmhp-desc"
              placeholder="Opsional"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

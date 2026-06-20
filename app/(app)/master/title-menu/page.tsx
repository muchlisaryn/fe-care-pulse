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
  fetchTitleMenus,
  setTitleMenuSearch,
  setTitleMenuPage,
  invalidateTitleMenus,
  type TitleMenu,
} from "@/lib/store/slices/titleMenuSlice"
import api from "@/lib/axios"

type TitleMenuForm = {
  title: string
  sort_order: number
}

const emptyForm: TitleMenuForm = {
  title: "",
  sort_order: 0,
}

const PER_PAGE = 20

export default function MasterTitleMenuPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.titleMenus)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState<TitleMenuForm>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TitleMenu | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchTitleMenus())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setTitleMenuSearch(searchInput))
  }

  function handlePageChange(p: number) {
    dispatch(setTitleMenuPage(p))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: TitleMenu) {
    setForm({
      title: row.title,
      sort_order: row.sort_order,
    })
    setEditId(row.id)
    setModal("edit")
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        sort_order: form.sort_order,
      }
      if (modal === "tambah") {
        await api.post("/master/title-menus", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/title-menus/${editId}`, payload)
      }
      dispatch(invalidateTitleMenus())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/title-menus/${deleteTarget.id}`)
      dispatch(invalidateTitleMenus())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<TitleMenu>[] = [
    {
      header: "Judul",
      cell: (row) => <span className="font-semibold text-gray-900">{row.title}</span>,
    },
    {
      header: "Urutan",
      cell: (row) => <span className="text-sm text-gray-600">{row.sort_order}</span>,
      className: "w-24",
    },
    {
      header: "Menu",
      cell: (row) =>
        row.menus.length > 0 ? (
          <span className="inline-flex items-center rounded-full bg-[#075489]/10 px-2.5 py-0.5 text-xs font-medium text-[#075489]">
            {row.menus.length} menu
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
      className: "w-28",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Master Title Menu" subtitle="Kelola grup navigasi sidebar" />
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Title Menu
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari judul..."
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
            emptyMessage="Belum ada data title menu."
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? "Tambah Title Menu" : "Edit Title Menu"}
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
            <Label htmlFor="tm-title">Judul</Label>
            <Input
              id="tm-title"
              placeholder="Contoh: Master Data"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tm-sort">Urutan (Sort Order)</Label>
            <Input
              id="tm-sort"
              type="number"
              min={0}
              placeholder="0"
              value={String(form.sort_order)}
              onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Textarea } from "@/components/atoms/Textarea"
import { Checkbox } from "@/components/atoms/Checkbox"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchAuthorities,
  setAuthoritySearch,
  setAuthorityPage,
  invalidateAuthorities,
  flattenMenuOptions,
  type Authority,
  type MenuOption,
} from "@/lib/store/slices/authoritySlice"
import api from "@/lib/axios"

type AuthorityForm = {
  name: string
  description: string
  menu_ids: number[]
}

const emptyForm: AuthorityForm = { name: "", description: "", menu_ids: [] }
const PER_PAGE = 20

export default function MasterOtoritasPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.authorities)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState<AuthorityForm>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [menuOptions, setMenuOptions] = useState<MenuOption[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Authority | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchAuthorities())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setAuthoritySearch(searchInput))
  }

  function handlePageChange(p: number) {
    dispatch(setAuthorityPage(p))
  }

  function openTambah() {
    setForm(emptyForm)
    setMenuOptions([])
    setEditId(null)
    setModal("tambah")
    setModalLoading(true)
    api.get("/master/menus")
      .then((res) => setMenuOptions(flattenMenuOptions(res.data.data)))
      .catch(() => {})
      .finally(() => setModalLoading(false))
  }

  async function openEdit(row: Authority) {
    setEditId(row.id)
    setForm(emptyForm)
    setMenuOptions([])
    setModal("edit")
    setModalLoading(true)
    try {
      const [menuRes, detailRes] = await Promise.all([
        api.get("/master/menus"),
        api.get(`/master/authorities/${row.id}`),
      ])
      setMenuOptions(flattenMenuOptions(menuRes.data.data))
      const detail = detailRes.data.data
      setForm({
        name: detail.name,
        description: detail.description ?? "",
        menu_ids: detail.menus.map((m: MenuOption) => m.id),
      })
    } catch {
    } finally {
      setModalLoading(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        ...(form.description && { description: form.description }),
        menu_ids: form.menu_ids,
      }
      if (modal === "tambah") {
        await api.post("/master/authorities", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/authorities/${editId}`, payload)
      }
      setModal(null)
      dispatch(invalidateAuthorities())
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/authorities/${deleteTarget.id}`)
      dispatch(invalidateAuthorities())
      setDeleteTarget(null)
    } catch {
    } finally {
      setDeletingId(null)
    }
  }

  type MenuNode = MenuOption & { children: MenuOption[] }
  type TitleMenuGroup = { titleMenu: { id: number; title: string } | null; nodes: MenuNode[] }

  function buildMenuTree(menus: MenuOption[]): MenuNode[] {
    const map: Record<number, MenuNode> = {}
    const roots: MenuNode[] = []
    const sorted = [...menus].sort((a, b) => a.sort_order - b.sort_order)
    sorted.forEach((m) => { map[m.id] = { ...m, children: [] } })
    sorted.forEach((m) => {
      if (m.parent_id === null) roots.push(map[m.id])
      else if (map[m.parent_id]) map[m.parent_id].children.push(map[m.id])
    })
    return roots
  }

  function groupByTitleMenu(tree: MenuNode[]): TitleMenuGroup[] {
    const map = new Map<number | null, TitleMenuGroup>()
    for (const node of tree) {
      const key = node.title_menu_id
      if (!map.has(key)) {
        map.set(key, { titleMenu: node.title_menu, nodes: [] })
      }
      map.get(key)!.nodes.push(node)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === null) return 1
        if (b === null) return -1
        return (a as number) - (b as number)
      })
      .map(([, g]) => g)
  }

  function toggleMenu(id: number) {
    setForm((p) => ({
      ...p,
      menu_ids: p.menu_ids.includes(id)
        ? p.menu_ids.filter((m) => m !== id)
        : [...p.menu_ids, id],
    }))
  }

  function toggleGroup(parent: MenuNode) {
    const ids = [parent.id, ...parent.children.map((c) => c.id)]
    const allSelected = ids.every((id) => form.menu_ids.includes(id))
    setForm((p) => ({
      ...p,
      menu_ids: allSelected
        ? p.menu_ids.filter((id) => !ids.includes(id))
        : [...new Set([...p.menu_ids, ...ids])],
    }))
  }

  function toggleAll() {
    const allSelected = menuOptions.every((m) => form.menu_ids.includes(m.id))
    setForm((p) => ({
      ...p,
      menu_ids: allSelected ? [] : menuOptions.map((m) => m.id),
    }))
  }

  const allChecked = menuOptions.length > 0 && menuOptions.every((m) => form.menu_ids.includes(m.id))
  const someChecked = !allChecked && form.menu_ids.length > 0
  const menuTree = buildMenuTree(menuOptions)
  const menuGroups = groupByTitleMenu(menuTree)

  const columns: Column<Authority>[] = [
    {
      header: "Nama Otoritas",
      cell: (row) => <span className="font-semibold text-gray-900">{row.name}</span>,
    },
    {
      header: "Deskripsi",
      cell: (row) => (
        <span className="text-sm text-gray-500 line-clamp-1">
          {row.description ?? <span className="text-gray-400 text-xs">—</span>}
        </span>
      ),
    },
    {
      header: "Dibuat Oleh",
      cell: (row) => <Badge variant="default">{row.created_by}</Badge>,
      className: "w-36",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Master Otoritas" subtitle="Kelola peran dan hak akses menu sistem" />
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Otoritas
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama otoritas..."
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
            emptyMessage="Belum ada data otoritas."
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
        title={modal === "tambah" ? "Tambah Otoritas" : "Edit Otoritas"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Batal
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || modalLoading}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        {modalLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Nama Otoritas</Label>
              <Input
                id="auth-name"
                placeholder="Contoh: Admin, Perawat, Dokter"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-desc">Deskripsi</Label>
              <Textarea
                id="auth-desc"
                placeholder="Deskripsi singkat tentang otoritas ini..."
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Akses Menu</Label>
                <span className="text-xs text-gray-400">
                  {form.menu_ids.length} / {menuOptions.length} dipilih
                </span>
              </div>

              {menuOptions.length === 0 ? (
                <div className="rounded-lg border border-gray-200 py-8 text-center text-sm text-gray-400">
                  Tidak ada menu tersedia.
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <label className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={toggleAll}
                      className="cursor-pointer"
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Pilih Semua
                    </span>
                  </label>

                  <div className="max-h-64 overflow-y-auto">
                    {menuGroups.map(({ titleMenu, nodes }) => (
                      <div key={titleMenu?.id ?? "no-group"}>
                        {titleMenu && (
                          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#075489] bg-[#075489]/5 border-y border-gray-100">
                            {titleMenu.title}
                          </div>
                        )}
                        {nodes.map((parent) => {
                          const groupIds = [parent.id, ...parent.children.map((c) => c.id)]
                          const groupAllChecked = groupIds.every((id) => form.menu_ids.includes(id))
                          const groupSomeChecked = !groupAllChecked && groupIds.some((id) => form.menu_ids.includes(id))
                          return (
                            <div key={parent.id}>
                              <label className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                                <Checkbox
                                  checked={groupAllChecked}
                                  indeterminate={groupSomeChecked}
                                  onChange={() => toggleGroup(parent)}
                                  className="cursor-pointer"
                                />
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  {parent.name}
                                </span>
                                {parent.url && (
                                  <span className="font-mono text-xs text-gray-400 ml-auto">{parent.url}</span>
                                )}
                              </label>
                              {parent.children.map((child) => (
                                <label
                                  key={child.id}
                                  className="flex items-center gap-3 pl-9 pr-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                                >
                                  <Checkbox
                                    checked={form.menu_ids.includes(child.id)}
                                    onChange={() => toggleMenu(child.id)}
                                    className="cursor-pointer shrink-0"
                                  />
                                  <span className="flex-1 text-sm text-gray-800">{child.name}</span>
                                  {child.url && (
                                    <span className="font-mono text-xs text-gray-400 shrink-0">{child.url}</span>
                                  )}
                                </label>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

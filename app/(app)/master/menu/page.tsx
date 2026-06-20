"use client"

import { useEffect, useState } from "react"
import { Search, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Switch } from "@/components/atoms/Switch"
import { Badge } from "@/components/atoms/Badge"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { PageHeader } from "@/components/molecules/PageHeader"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchMenus,
  invalidateMenus,
  type MenuGroup,
  type MenuDetail,
} from "@/lib/store/slices/menuSlice"
import { invalidateTitleMenus, type TitleMenu } from "@/lib/store/slices/titleMenuSlice"
import api from "@/lib/axios"

// Flattened row for the table: a parent menu or one of its sub-menus.
type MenuRow = {
  id: number
  name: string
  url: string | null
  title_menu: string | null
  isChild: boolean
  hasChildren: boolean
  parentId: number | null
  sortOrder: number | null
}

type MenuForm = {
  is_parent: boolean
  name: string
  url: string
  title_menu_id: number | null
  parent_id: number | null
  sort_order: number
  icon: string
  is_open: boolean
}

type GroupForm = {
  title: string
  sort_order: number
}

type SelectOption = { value: string; label: string }

const emptyForm: MenuForm = {
  is_parent: false,
  name: "",
  url: "",
  title_menu_id: null,
  parent_id: null,
  sort_order: 0,
  icon: "",
  is_open: false,
}

const emptyGroupForm: GroupForm = {
  title: "",
  sort_order: 0,
}

// Flatten the grouped index tree into parent/child rows for the table.
function flattenGroups(groups: MenuGroup[]): MenuRow[] {
  if (!Array.isArray(groups)) return []
  const rows: MenuRow[] = []
  for (const g of groups) {
    for (const parent of g.menus ?? []) {
      rows.push({
        id: parent.id,
        name: parent.name,
        url: parent.url,
        title_menu: g.title_menu,
        isChild: false,
        hasChildren: (parent.menu?.length ?? 0) > 0,
        parentId: null,
        sortOrder: parent.sort_order,
      })
      for (const child of parent.menu ?? []) {
        rows.push({
          id: child.id,
          name: child.name,
          url: child.url,
          title_menu: g.title_menu,
          isChild: true,
          hasChildren: false,
          parentId: parent.id,
          sortOrder: null,
        })
      }
    }
  }
  return rows
}

export default function MasterMenuPage() {
  const dispatch = useAppDispatch()
  const { groups, loading, loaded, dirty } = useAppSelector((s) => s.menus)

  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const allRows = flattenGroups(groups)
  // Cari berdasarkan nama menu yang punya URL; parent dari menu yang cocok tetap ditampilkan.
  let rows = allRows
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    const keep = new Set<number>()
    for (const r of allRows) {
      if (r.url && r.name.toLowerCase().includes(q)) {
        keep.add(r.id)
        if (r.parentId !== null) keep.add(r.parentId)
      }
    }
    rows = allRows.filter((r) => keep.has(r.id))
  }

  // Kelompokkan baris berdasarkan title menu (grup) — urutan sudah per grup dari API.
  const rowGroups: { title: string | null; rows: MenuRow[] }[] = []
  for (const r of rows) {
    const last = rowGroups[rowGroups.length - 1]
    if (last && last.title === r.title_menu) last.rows.push(r)
    else rowGroups.push({ title: r.title_menu, rows: [r] })
  }

  // Menu CRUD state
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState<MenuForm>(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MenuRow | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [parentOptions, setParentOptions] = useState<SelectOption[]>([])
  const [titleMenuOptions, setTitleMenuOptions] = useState<SelectOption[]>([])
  const [editHasChildren, setEditHasChildren] = useState(false)

  // Group menu modal state
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupItems, setGroupItems] = useState<TitleMenu[]>([])
  const [groupLoading, setGroupLoading] = useState(false)
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm)
  const [groupSaving, setGroupSaving] = useState(false)
  const [groupEditId, setGroupEditId] = useState<number | null>(null)
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<TitleMenu | null>(null)
  const [groupDeletingId, setGroupDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchMenus())
  }, [loaded, dirty, dispatch])

  useEffect(() => {
    console.log("[menu] groups:", groups)
    console.log("[menu] rows:", rows)
  }, [groups, rows])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
  }

  // ── Menu modal helpers ──────────────────────────────────────────────────────

  function unwrapList<T>(res: { data?: { data?: T[] | { data?: T[] } } }): T[] {
    const inner = res?.data?.data
    if (Array.isArray(inner)) return inner
    return (inner?.data as T[]) ?? []
  }

  // Load dropdown options: title menus + parent menus (flattened from the grouped index).
  async function loadModalOptions(currentEditId: number | null) {
    const [tmRes, menuRes] = await Promise.all([
      api.get("/master/title-menus"),
      api.get("/master/menus"),
    ])
    const titleMenus = unwrapList<{ id: number; title: string }>(tmRes)
    setTitleMenuOptions([
      { value: "", label: "— Tidak ada —" },
      ...titleMenus.map((t) => ({ value: String(t.id), label: t.title })),
    ])
    const menuGroups = (Array.isArray(menuRes.data?.data) ? menuRes.data.data : []) as MenuGroup[]
    const parents = menuGroups.flatMap((g) => g.menus ?? [])
    setParentOptions([
      { value: "", label: "— Tidak ada (root) —" },
      ...parents
        .filter((m) => m.parent_id === null && m.id !== currentEditId)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({ value: String(m.id), label: m.name })),
    ])
  }

  async function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setEditHasChildren(false)
    setModal("tambah")
    setModalLoading(true)
    try {
      await loadModalOptions(null)
    } catch {
    } finally {
      setModalLoading(false)
    }
  }

  async function openEdit(row: MenuRow) {
    const id = row.id
    setForm(emptyForm)
    setEditId(id)
    setEditHasChildren(false)
    setModal("edit")
    setModalLoading(true)
    try {
      const [detailRes] = await Promise.all([
        api.get(`/master/menus/${id}`),
        loadModalOptions(id),
      ])
      const detail = detailRes.data.data as MenuDetail
      setEditHasChildren((detail.children?.length ?? 0) > 0)
      setForm({
        is_parent: detail.parent_id === null,
        name: detail.name,
        url: detail.url ?? "",
        title_menu_id: detail.title_menu_id,
        parent_id: detail.parent_id,
        sort_order: detail.sort_order,
        icon: detail.icon ?? "",
        is_open: detail.is_open ?? false,
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
      const payload = form.is_parent
        ? {
            name: form.name,
            title_menu_id: form.title_menu_id ?? undefined,
            sort_order: form.sort_order,
            is_open: form.is_open,
            icon: form.icon || undefined,
            parent_id: null,
            url: null,
          }
        : {
            name: form.name,
            sort_order: form.sort_order,
            url: form.url || undefined,
            parent_id: form.parent_id ?? undefined,
            title_menu_id: null,
          }
      if (modal === "tambah") {
        await api.post("/master/menus", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/menus/${editId}`, payload)
      }
      setModal(null)
      dispatch(invalidateMenus())
    } catch {
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/menus/${deleteTarget.id}`)
      dispatch(invalidateMenus())
      setDeleteTarget(null)
    } catch {
    } finally {
      setDeletingId(null)
    }
  }

  // ── Group menu modal helpers ─────────────────────────────────────────────────

  async function loadGroupItems() {
    setGroupLoading(true)
    try {
      const res = await api.get("/master/title-menus")
      setGroupItems(unwrapList<TitleMenu>(res))
    } catch {
    } finally {
      setGroupLoading(false)
    }
  }

  async function openGroupModal() {
    setGroupForm(emptyGroupForm)
    setGroupEditId(null)
    setGroupModalOpen(true)
    await loadGroupItems()
  }

  function startGroupEdit(item: TitleMenu) {
    setGroupEditId(item.id)
    setGroupForm({
      title: item.title,
      sort_order: item.sort_order,
    })
  }

  function cancelGroupEdit() {
    setGroupEditId(null)
    setGroupForm(emptyGroupForm)
  }

  async function handleGroupSave(e: React.FormEvent) {
    e.preventDefault()
    if (!groupForm.title.trim()) return
    setGroupSaving(true)
    try {
      const payload = {
        title: groupForm.title,
        sort_order: groupForm.sort_order,
      }
      if (groupEditId !== null) {
        await api.put(`/master/title-menus/${groupEditId}`, payload)
        setGroupEditId(null)
      } else {
        await api.post("/master/title-menus", payload)
      }
      setGroupForm(emptyGroupForm)
      await loadGroupItems()
      dispatch(invalidateTitleMenus())
    } catch {
    } finally {
      setGroupSaving(false)
    }
  }

  async function handleGroupDelete() {
    if (!groupDeleteTarget) return
    setGroupDeletingId(groupDeleteTarget.id)
    try {
      await api.delete(`/master/title-menus/${groupDeleteTarget.id}`)
      setGroupDeleteTarget(null)
      await loadGroupItems()
      dispatch(invalidateTitleMenus())
    } catch {
    } finally {
      setGroupDeletingId(null)
    }
  }

  // ── Table columns ────────────────────────────────────────────────────────────

  const columns: Column<MenuRow>[] = [
    {
      header: "Nama Menu",
      cell: (row) =>
        !row.isChild ? (
          <span className="font-semibold text-gray-900">{row.name}</span>
        ) : (
          <span className="flex items-center gap-1.5 pl-5">
            <span className="text-gray-300 select-none">↳</span>
            <span className="font-medium text-gray-700">{row.name}</span>
          </span>
        ),
    },
    {
      header: "URL",
      cell: (row) =>
        row.url ? (
          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
            {row.url}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Master Menu" subtitle="Kelola data menu navigasi sistem" />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openGroupModal}
            className="text-[#075489] border-[#075489] hover:bg-[#075489]/5"
          >
            Tambah Group Menu
          </Button>
          <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
            + Tambah Menu
          </Button>
        </div>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama menu..."
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
        ) : rowGroups.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Belum ada data menu.</div>
        ) : (
          rowGroups.map((g, i) => (
            <div key={g.title ?? `no-group-${i}`}>
              <div className="px-5 py-2.5 bg-[#075489]/5 border-y border-gray-100 text-xs font-bold uppercase tracking-wide text-[#075489]">
                {g.title ?? "Tanpa Grup"}
              </div>
              <DataTable
                columns={columns}
                data={g.rows}
                rowNumber={(row) => (row.isChild ? null : row.sortOrder)}
                onEdit={openEdit}
                onDelete={(row) => setDeleteTarget(row)}
                canDelete={(row) => !row.hasChildren}
                isRowLoading={(row) => deletingId === row.id}
                emptyMessage="Belum ada data menu."
              />
            </div>
          ))
        )}
      </Card>

      {/* ── Menu delete confirm ── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      {/* ── Menu tambah / edit modal ── */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? "Tambah Menu" : "Edit Menu"}
        size="md"
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
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Parent Menu</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Aktifkan jika menu ini adalah grup induk (dropdown), bukan halaman.
                </p>
              </div>
              <Switch
                checked={form.is_parent}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    is_parent: v,
                    // Saat jadi parent: kosongkan URL & parent menu.
                    ...(v ? { url: "", parent_id: null } : {}),
                  }))
                }
                disabled={editHasChildren}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="menu-name">Nama Menu</Label>
              <Input
                id="menu-name"
                placeholder="Contoh: Dashboard"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            {form.is_parent ? (
              <>
                <div className="space-y-1.5">
                  <Label>Grup Menu</Label>
                  <SelectSearch
                    options={titleMenuOptions}
                    value={form.title_menu_id === null ? "" : String(form.title_menu_id)}
                    onChange={(v) => setForm((p) => ({ ...p, title_menu_id: v ? Number(v) : null }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="menu-sort">Urutan (Sort Order)</Label>
                  <Input
                    id="menu-sort"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={String(form.sort_order)}
                    onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Terbuka otomatis</p>
                    <p className="text-xs text-gray-400 mt-0.5">Menu langsung terbuka saat halaman dimuat</p>
                  </div>
                  <Switch
                    checked={form.is_open}
                    onChange={(v) => setForm((p) => ({ ...p, is_open: v }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="menu-icon">Icon</Label>
                  <Input
                    id="menu-icon"
                    placeholder="Contoh: database"
                    value={form.icon}
                    onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="menu-sort">Urutan (Sort Order)</Label>
                  <Input
                    id="menu-sort"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={String(form.sort_order)}
                    onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="menu-url">URL</Label>
                  <Input
                    id="menu-url"
                    placeholder="Contoh: /dashboard"
                    value={form.url}
                    onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Parent Menu</Label>
                  <SelectSearch
                    options={parentOptions}
                    value={form.parent_id === null ? "" : String(form.parent_id)}
                    onChange={(v) => setForm((p) => ({ ...p, parent_id: v ? Number(v) : null }))}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── Group menu modal ── */}
      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title="Kelola Grup Menu"
        size="md"
        footer={
          <Button variant="outline" onClick={() => setGroupModalOpen(false)}>
            Tutup
          </Button>
        }
      >
        <div className="space-y-5">
          {/* Form — tambah atau edit */}
          <form onSubmit={handleGroupSave} className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              {groupEditId !== null ? "Edit Grup Menu" : "Tambah Grup Menu"}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="grp-title">Judul</Label>
              <Input
                id="grp-title"
                placeholder="Contoh: Master Data"
                value={groupForm.title}
                onChange={(e) => setGroupForm((p) => ({ ...p, title: e.target.value }))}
                disabled={groupSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grp-sort">Urutan</Label>
              <Input
                id="grp-sort"
                type="number"
                min={0}
                placeholder="0"
                value={String(groupForm.sort_order)}
                onChange={(e) => setGroupForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                disabled={groupSaving}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              {groupEditId !== null && (
                <Button type="button" variant="outline" onClick={cancelGroupEdit} disabled={groupSaving}>
                  Batal
                </Button>
              )}
              <Button
                type="submit"
                disabled={groupSaving || !groupForm.title.trim()}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {groupSaving ? "Menyimpan..." : groupEditId !== null ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </form>

          {/* List */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Daftar Grup Menu</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {groupLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">Memuat data...</div>
              ) : groupItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">Belum ada grup menu.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {groupItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 px-4 py-3 ${groupEditId === item.id ? "bg-[#075489]/5" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                      </div>
                      {item.menus.length > 0 && (
                        <span className="text-xs text-gray-400 shrink-0">{item.menus.length} menu</span>
                      )}
                      <button
                        type="button"
                        onClick={() => startGroupEdit(item)}
                        disabled={groupDeletingId === item.id}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-[#075489]/10 hover:text-[#075489] transition-colors disabled:opacity-40"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupDeleteTarget(item)}
                        disabled={groupDeletingId === item.id}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Group menu delete confirm — dirender setelah modal grup agar tampil di depan ── */}
      <ConfirmDialog
        open={groupDeleteTarget !== null}
        onClose={() => setGroupDeleteTarget(null)}
        onConfirm={handleGroupDelete}
        loading={groupDeletingId !== null}
      />
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchUsers,
  setUserSearch,
  setUserPage,
  invalidateUsers,
  type User,
} from "@/lib/store/slices/userSlice"
import {
  fetchAuthorities,
} from "@/lib/store/slices/authoritySlice"
import api from "@/lib/axios"

type UserForm = {
  name: string
  username: string
  email: string
  no_telephone: string
  authority_id: number | ""
  password: string
  password_confirmation: string
}

type RegisterForm = UserForm
type EditForm = UserForm

const emptyRegister: RegisterForm = {
  name: "",
  username: "",
  email: "",
  no_telephone: "",
  authority_id: "",
  password: "",
  password_confirmation: "",
}

const emptyEdit: EditForm = {
  name: "",
  username: "",
  email: "",
  no_telephone: "",
  authority_id: "",
  password: "",
  password_confirmation: "",
}

const PER_PAGE = 20

export default function MasterUserPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } =
    useAppSelector((s) => s.users)
  const { items: authorities, loaded: authoritiesLoaded } =
    useAppSelector((s) => s.authorities)

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState<RegisterForm>(emptyRegister)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchUsers())
  }, [loaded, dirty, dispatch])

  useEffect(() => {
    if (!authoritiesLoaded) dispatch(fetchAuthorities())
  }, [authoritiesLoaded, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setUserSearch(searchInput))
  }

  function handlePageChange(p: number) {
    dispatch(setUserPage(p))
  }

  function openTambah() {
    setForm(emptyRegister)
    setErrors({})
    setModal("tambah")
  }

  function openEdit(row: User) {
    setEditId(row.id)
    setEditForm({
      name: row.name,
      username: row.username,
      email: row.email,
      no_telephone: row.no_telephone ?? "",
      authority_id: row.authority_id ?? "",
      password: "",
      password_confirmation: "",
    })
    setErrors({})
    setModal("edit")
  }

  async function handleRegister() {
    if (!form.name.trim() || !form.username.trim() || !form.email.trim() || !form.authority_id || !form.password) return
    setErrors({})
    setSaving(true)
    try {
      await api.post("/master/users", form)
      setModal(null)
      dispatch(invalidateUsers())
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })
        ?.response?.data
      if (data?.errors) {
        const flat: Record<string, string> = {}
        for (const [key, msgs] of Object.entries(data.errors)) flat[key] = msgs[0]
        setErrors(flat)
      } else if (data?.message) {
        setErrors({ _: data.message })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!editForm.name.trim() || !editForm.username.trim() || !editForm.email.trim()) return
    setErrors({})
    setSaving(true)
    try {
      const payload: Record<string, string | number> = {
        name: editForm.name,
        username: editForm.username,
        email: editForm.email,
        no_telephone: editForm.no_telephone,
      }
      if (editForm.authority_id !== "") payload.authority_id = editForm.authority_id
      if (editForm.password) {
        payload.password = editForm.password
        payload.password_confirmation = editForm.password_confirmation
      }
      await api.put(`/master/users/${editId}`, payload)
      setModal(null)
      dispatch(invalidateUsers())
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })
        ?.response?.data
      if (data?.errors) {
        const flat: Record<string, string> = {}
        for (const [key, msgs] of Object.entries(data.errors)) flat[key] = msgs[0]
        setErrors(flat)
      } else if (data?.message) {
        setErrors({ _: data.message })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/users/${deleteTarget.id}`)
      dispatch(invalidateUsers())
      setDeleteTarget(null)
    } catch {
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<User>[] = [
    {
      header: "Nama",
      cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      header: "Username",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.username}
        </span>
      ),
      className: "w-36",
    },
    {
      header: "Email",
      cell: (row) => <span className="text-sm text-gray-500">{row.email}</span>,
    },
    {
      header: "Otoritas",
      cell: (row) =>
        row.authority ? (
          <span className="text-sm text-gray-700">{row.authority.name}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
      className: "w-36",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Master User" subtitle="Kelola data pengguna sistem" />
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah User
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama, username, atau email..."
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
            emptyMessage="Belum ada data user."
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

      {/* Modal Tambah */}
      <Modal
        open={modal === "tambah"}
        onClose={() => setModal(null)}
        title="Tambah User"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button onClick={handleRegister} disabled={saving} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors._ && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errors._}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Nama Lengkap</Label>
            <Input
              id="u-name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-username">Username</Label>
              <Input
                id="u-username"
                placeholder="johndoe"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              />
              {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-authority">Otoritas</Label>
              <Select
                id="u-authority"
                value={form.authority_id}
                onChange={(e) => setForm((p) => ({ ...p, authority_id: e.target.value ? Number(e.target.value) : "" }))}
                error={!!errors.authority_id}
              >
                <option value="">Pilih otoritas...</option>
                {authorities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
              {errors.authority_id && <p className="text-xs text-red-500">{errors.authority_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-telephone">No. Telepon</Label>
              <Input
                id="u-telephone"
                placeholder="081234567890"
                value={form.no_telephone}
                onChange={(e) => setForm((p) => ({ ...p, no_telephone: e.target.value }))}
              />
              {errors.no_telephone && <p className="text-xs text-red-500">{errors.no_telephone}</p>}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-password">Password</Label>
                <Input
                  id="u-password"
                  type="password"
                  placeholder="Min. 8 karakter"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-confirm">Konfirmasi Password</Label>
                <Input
                  id="u-confirm"
                  type="password"
                  placeholder="Ulangi password"
                  value={form.password_confirmation}
                  onChange={(e) => setForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Edit */}
      <Modal
        open={modal === "edit"}
        onClose={() => setModal(null)}
        title="Edit User"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {errors._ && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errors._}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Nama Lengkap</Label>
            <Input
              id="e-name"
              placeholder="John Doe"
              value={editForm.name}
              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-username">Username</Label>
              <Input
                id="e-username"
                placeholder="johndoe"
                value={editForm.username}
                onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
              />
              {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Email</Label>
              <Input
                id="e-email"
                type="email"
                placeholder="john@example.com"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-authority">Otoritas</Label>
              <Select
                id="e-authority"
                value={editForm.authority_id}
                onChange={(e) => setEditForm((p) => ({ ...p, authority_id: e.target.value ? Number(e.target.value) : "" }))}
                error={!!errors.authority_id}
              >
                <option value="">Pilih otoritas...</option>
                {authorities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
              {errors.authority_id && <p className="text-xs text-red-500">{errors.authority_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-telephone">No. Telepon</Label>
              <Input
                id="e-telephone"
                placeholder="081234567890"
                value={editForm.no_telephone}
                onChange={(e) => setEditForm((p) => ({ ...p, no_telephone: e.target.value }))}
              />
              {errors.no_telephone && <p className="text-xs text-red-500">{errors.no_telephone}</p>}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400 mb-3">Kosongkan jika tidak ingin mengubah password</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="e-password">Password Baru</Label>
                <Input
                  id="e-password"
                  type="password"
                  placeholder="Min. 8 karakter"
                  value={editForm.password}
                  onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                />
                {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-confirm">Konfirmasi Password</Label>
                <Input
                  id="e-confirm"
                  type="password"
                  placeholder="Ulangi password"
                  value={editForm.password_confirmation}
                  onChange={(e) => setEditForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Search, WashingMachine } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchWasherMachines,
  setWasherMachineSearch,
  setWasherMachinePage,
  invalidateWasherMachines,
  type WasherMachine,
} from "@/lib/store/slices/washerMachineSlice"
import api from "@/lib/axios"

const emptyForm = {
  name: "",
  location: "",
  min_temperature: "",
  max_temperature: "",
  min_duration_minutes: "",
  max_duration_minutes: "",
  status: "aktif",
  note: "",
}

export default function MasterWasherMachinePage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.washerMachines
  )

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WasherMachine | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchWasherMachines())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setWasherMachineSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: WasherMachine) {
    setForm({
      name: row.name,
      location: row.location ?? "",
      min_temperature: row.min_temperature ?? "",
      max_temperature: row.max_temperature ?? "",
      min_duration_minutes: row.min_duration_minutes?.toString() ?? "",
      max_duration_minutes: row.max_duration_minutes?.toString() ?? "",
      status: row.status,
      note: row.note ?? "",
    })
    setEditId(row.id)
    setModal("edit")
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v))
      const payload = {
        name: form.name.trim(),
        location: form.location.trim() || null,
        min_temperature: num(form.min_temperature),
        max_temperature: num(form.max_temperature),
        min_duration_minutes: num(form.min_duration_minutes),
        max_duration_minutes: num(form.max_duration_minutes),
        status: form.status,
        note: form.note.trim() || null,
      }
      if (modal === "tambah") {
        await api.post("/master/washer-machines", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/washer-machines/${editId}`, payload)
      }
      dispatch(invalidateWasherMachines())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/washer-machines/${deleteTarget.id}`)
      dispatch(invalidateWasherMachines())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  const fmtTemp = (v: string | null) => (v === null ? "—" : `${Number(v)}°C`)
  const fmtRange = (min: string | number | null, max: string | number | null, suffix: string) => {
    if (min === null && max === null) return "—"
    const lo = min === null ? "?" : Number(min)
    const hi = max === null ? "?" : Number(max)
    return `${lo}–${hi}${suffix}`
  }

  const columns: Column<WasherMachine>[] = [
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
      header: "Nama Mesin",
      cell: (row) => (
        <div>
          <span className="font-medium text-gray-900">{row.name}</span>
          {row.location ? <p className="text-xs text-gray-400 mt-0.5">{row.location}</p> : null}
        </div>
      ),
    },
    {
      header: "Suhu",
      cell: (row) => (
        <span className="text-gray-700">
          {fmtRange(row.min_temperature, row.max_temperature, "°C")}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Durasi",
      cell: (row) => (
        <span className="text-gray-700">
          {fmtRange(row.min_duration_minutes, row.max_duration_minutes, " mnt")}
        </span>
      ),
      className: "w-28",
    },
    {
      header: "Status",
      cell: (row) => (
        <Badge variant={row.status === "aktif" ? "success" : "default"}>{row.status}</Badge>
      ),
      className: "w-24",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <WashingMachine className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Master Mesin Washer</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Kelola mesin pencuci (washer disinfector) & ambang parameter pencucian
            </p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Mesin
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama / kode / lokasi mesin..."
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
            emptyMessage="Belum ada mesin washer."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setWasherMachinePage(p))}
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
        title={modal === "tambah" ? "Tambah Mesin Washer" : "Edit Mesin Washer"}
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
            <Label htmlFor="wm-name">Nama Mesin</Label>
            <Input
              id="wm-name"
              placeholder="Contoh: Washer Disinfector 1"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wm-location">Lokasi</Label>
            <Input
              id="wm-location"
              placeholder="Contoh: Ruang Dekontaminasi"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wm-min-temp">Suhu Min (°C)</Label>
              <Input
                id="wm-min-temp"
                type="number"
                step="0.01"
                placeholder="55"
                value={form.min_temperature}
                onChange={(e) => setForm((f) => ({ ...f, min_temperature: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wm-max-temp">Suhu Max (°C)</Label>
              <Input
                id="wm-max-temp"
                type="number"
                step="0.01"
                placeholder="93"
                value={form.max_temperature}
                onChange={(e) => setForm((f) => ({ ...f, max_temperature: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wm-min-dur">Durasi Min (mnt)</Label>
              <Input
                id="wm-min-dur"
                type="number"
                min={0}
                placeholder="10"
                value={form.min_duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, min_duration_minutes: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wm-max-dur">Durasi Max (mnt)</Label>
              <Input
                id="wm-max-dur"
                type="number"
                min={0}
                placeholder="30"
                value={form.max_duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, max_duration_minutes: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wm-status">Status</Label>
            <Select
              id="wm-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wm-note">Keterangan</Label>
            <Textarea
              id="wm-note"
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

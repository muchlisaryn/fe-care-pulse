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
  fetchSterilizerMachines,
  setSterilizerMachineSearch,
  setSterilizerMachinePage,
  invalidateSterilizerMachines,
  type SterilizerMachine,
} from "@/lib/store/slices/sterilizerMachineSlice"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"

const emptyForm = {
  name: "",
  location: "",
  temperature: "",
  duration_minutes: "",
  status: "aktif",
  note: "",
}

export default function MasterSterilizerMachinePage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.sterilizerMachines
  )

  const t = useT()
  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SterilizerMachine | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchSterilizerMachines())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setSterilizerMachineSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: SterilizerMachine) {
    setForm({
      name: row.name,
      location: row.location ?? "",
      temperature: row.temperature ?? "",
      duration_minutes: row.duration_minutes?.toString() ?? "",
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
        temperature: num(form.temperature),
        duration_minutes: num(form.duration_minutes),
        status: form.status,
        note: form.note.trim() || null,
      }
      if (modal === "tambah") {
        await api.post("/master/sterilizer-machines", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/sterilizer-machines/${editId}`, payload)
      }
      dispatch(invalidateSterilizerMachines())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/sterilizer-machines/${deleteTarget.id}`)
      dispatch(invalidateSterilizerMachines())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  const fmtValue = (v: string | number | null, suffix: string) =>
    v === null || v === "" ? "—" : `${Number(v)}${suffix}`

  const columns: Column<SterilizerMachine>[] = [
    {
      header: t("common.code"),
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.code}
        </span>
      ),
      className: "w-28",
    },
    {
      header: t("machine.colName"),
      cell: (row) => (
        <div>
          <span className="font-medium text-gray-900">{row.name}</span>
          {row.location ? <p className="text-xs text-gray-400 mt-0.5">{row.location}</p> : null}
        </div>
      ),
    },
    {
      header: t("machine.colTemp"),
      cell: (row) => <span className="text-gray-700">{fmtValue(row.temperature, "°C")}</span>,
      className: "w-28",
    },
    {
      header: t("machine.colDuration"),
      cell: (row) => <span className="text-gray-700">{fmtValue(row.duration_minutes, " " + t("common.minutesShort"))}</span>,
      className: "w-28",
    },
    {
      header: t("common.status"),
      cell: (row) => (
        <Badge variant={row.status === "aktif" ? "success" : "default"}>
          {row.status === "aktif" ? t("common.active") : t("common.inactive")}
        </Badge>
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
            <h1 className="text-2xl font-bold text-gray-900">{t("machine.sterilizerTitle")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("machine.sterilizerSubtitle")}
            </p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          {t("machine.addMachine")}
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("machine.searchPlaceholder")}
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
            emptyMessage={t("machine.sterilizerEmpty")}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setSterilizerMachinePage(p))}
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
        title={modal === "tambah" ? t("machine.sterilizerModalAdd") : t("machine.sterilizerModalEdit")}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sm-name">{t("machine.colName")}</Label>
            <Input
              id="sm-name"
              placeholder={t("machine.sterilizerNamePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sm-location">{t("common.location")}</Label>
            <Input
              id="sm-location"
              placeholder={t("machine.sterilizerLocationPlaceholder")}
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sm-temp">{t("machine.stdTemp")}</Label>
              <Input
                id="sm-temp"
                type="number"
                step="0.01"
                placeholder="134"
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sm-dur">{t("machine.stdDuration")}</Label>
              <Input
                id="sm-dur"
                type="number"
                min={0}
                placeholder="30"
                value={form.duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sm-status">{t("common.status")}</Label>
            <Select
              id="sm-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="aktif">{t("common.active")}</option>
              <option value="nonaktif">{t("common.inactive")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sm-note">{t("common.description")}</Label>
            <Textarea
              id="sm-note"
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

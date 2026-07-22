"use client"

import { useEffect, useState } from "react"
import { Search, Archive } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
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
  fetchRacks,
  setRackSearch,
  setRackPage,
  invalidateRacks,
  type Rack,
} from "@/lib/store/slices/rackSlice"
import api from "@/lib/axios"

const emptyForm = {
  name: "",
  note: "",
}

// Nama & keterangan rak adalah teks bebas, sementara label dicetak lewat
// document.write — lolos-kan dulu agar karakter HTML tidak merusak halaman cetak.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export default function MasterRakPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.racks
  )

  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Rack | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // Rak yang labelnya sedang dipratinjau untuk dicetak.
  const [labelTarget, setLabelTarget] = useState<Rack | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchRacks())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setRackSearch(searchInput))
  }

  function openTambah() {
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: Rack) {
    setForm({ name: row.name, note: row.note ?? "" })
    setEditId(row.id)
    setModal("edit")
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        note: form.note.trim() || null,
      }
      if (modal === "tambah") {
        await api.post("/master/racks", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/racks/${editId}`, payload)
      }
      dispatch(invalidateRacks())
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/racks/${deleteTarget.id}`)
      dispatch(invalidateRacks())
      setDeleteTarget(null)
    } finally {
      setDeletingId(null)
    }
  }

  // Cetak label rak: QR berisi NAMA rak persis seperti di master — itu yang
  // dicocokkan saat scan di halaman Storage Steril. Karena itu label wajib
  // dicetak ulang bila nama rak diubah.
  function handlePrintLabel() {
    if (!labelTarget) return
    const svg = document.getElementById("rak-label-qr")
    const qr = svg ? new XMLSerializer().serializeToString(svg) : ""
    const w = window.open("", "_blank", "width=480,height=360")
    if (!w) return
    w.document.write(`
      <html>
        <head>
          <title>Label ${escapeHtml(labelTarget.name)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
            .label { display: flex; gap: 16px; align-items: flex-start; border: 1px solid #000; padding: 12px 16px; width: 380px; }
            .label .qr { flex: none; }
            .label .qr svg { display: block; width: 108px; height: 108px; }
            .label .body { flex: 1; min-width: 0; }
            .label .kind { font-size: 11px; font-weight: 600; letter-spacing: 1px; color: #111; }
            .label .name { font-size: 22px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: #111; margin-top: 2px; word-break: break-word; }
            .label .note { margin-top: 8px; font-size: 11px; color: #111; }
            @media print { @page { margin: 8mm; } }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="qr">${qr}</div>
            <div class="body">
              <div class="kind">LOKASI RAK</div>
              <div class="name">${escapeHtml(labelTarget.name)}</div>
              ${labelTarget.note ? `<div class="note">${escapeHtml(labelTarget.note)}</div>` : ""}
            </div>
          </div>
        </body>
      </html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  const columns: Column<Rack>[] = [
    {
      header: "Nama Rak",
      cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      header: "Keterangan",
      cell: (row) =>
        row.note ? (
          <span className="text-gray-700">{row.note}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Archive className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Master Rak</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Kelola rak gudang steril — dipakai sebagai pilihan lokasi rak saat menyimpan ke gudang
            </p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          + Tambah Rak
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Cari nama rak / keterangan..."
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
            extraActions={[{ label: "Cetak Label", onClick: (row) => setLabelTarget(row) }]}
            onEdit={openEdit}
            onDelete={(row) => setDeleteTarget(row)}
            isRowLoading={(row) => deletingId === row.id}
            emptyMessage="Belum ada rak."
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setRackPage(p))}
        />
      </Card>

      <Modal
        open={labelTarget !== null}
        onClose={() => setLabelTarget(null)}
        title="Label Rak"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setLabelTarget(null)}>
              Tutup
            </Button>
            <Button
              onClick={handlePrintLabel}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              Cetak
            </Button>
          </>
        }
      >
        {labelTarget && (
          <div className="space-y-3">
            <div className="flex items-start gap-4 rounded-lg border border-gray-200 px-4 py-3">
              <QRCodeSVG
                id="rak-label-qr"
                value={labelTarget.name}
                size={108}
                level="M"
                marginSize={0}
                className="shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wider text-gray-500">LOKASI RAK</p>
                <p className="text-lg font-bold uppercase text-gray-900 break-words">{labelTarget.name}</p>
                {labelTarget.note && <p className="mt-1 text-xs text-gray-500">{labelTarget.note}</p>}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Tempel label ini di rak. QR-nya berisi nama rak, jadi bila nama rak diubah, label
              wajib dicetak ulang.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? "Tambah Rak" : "Edit Rak"}
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
            <Label htmlFor="rak-name">Nama Rak</Label>
            <Input
              id="rak-name"
              placeholder="Contoh: Rak A1"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rak-note">Keterangan</Label>
            <Textarea
              id="rak-note"
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

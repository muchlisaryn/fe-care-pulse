"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Plus, Pencil, Trash2, Copy } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { PageHeader } from "@/components/molecules/PageHeader"
import api from "@/lib/axios"

type Category = { id: number; sort_order: number; label: string }

type Point = {
  id: number
  template_id: number
  category_id: number
  parent_id: number | null
  label: string
  filled_by: string
  required_days: number[] | null
  sort_order: number
}

type TemplateDetail = {
  id: number
  max_days: number
  icd10?: { code: string; display: string } | null
}

// Item daftar formulir untuk picker "Salin dari Formulir Lain".
type TemplateListItem = {
  id: number
  points_count?: number
  icd10?: { code: string; display: string } | null
}

const PENGISI_OPTIONS = [
  { value: "dokter", label: "Dokter" },
  { value: "perawat", label: "Perawat" },
  { value: "farmasi", label: "Farmasi" },
  { value: "ahli_gizi", label: "Ahli Gizi" },
  { value: "penunjang", label: "Penunjang" },
]
const pengisiLabel = (v: string) => PENGISI_OPTIONS.find((o) => o.value === v)?.label ?? v

type ModalState = {
  mode: "add" | "edit"
  categoriId: number
  parentId: number | null
  editId: number | null
  label: string
  pengisi: string
  hari: Set<number>
}

export default function FormulirPage() {
  const params = useParams()
  const router = useRouter()
  const templateId = Number(params.id)

  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState<ModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Point | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Salin formulir dari diagnosa lain.
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyOptions, setCopyOptions] = useState<{ value: string; label: string }[]>([])
  const [copyListLoading, setCopyListLoading] = useState(false)
  const [copySourceId, setCopySourceId] = useState("")
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const loadPoints = useCallback(async () => {
    const res = await api.get(`/clinical-pathway/templates/${templateId}/points`)
    setPoints(res.data.data as Point[])
  }, [templateId])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        // Detail template (untuk maksimal_hari + diagnosa).
        const tplRes = await api.get(`/clinical-pathway/templates/${templateId}`)
        // Semua kategori (paginated) → gabungkan jadi satu daftar terurut.
        const cats: Category[] = []
        let page = 1
        let last = 1
        do {
          const res = await api.get("/clinical-pathway/categories", { params: { page } })
          const p = res.data.data
          cats.push(...p.data)
          last = p.last_page
          page++
        } while (page <= last)

        const ptRes = await api.get(`/clinical-pathway/templates/${templateId}/points`)
        if (!active) return
        setTemplate(tplRes.data.data)
        setCategories(cats.sort((a, b) => a.sort_order - b.sort_order))
        setPoints(ptRes.data.data)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [templateId])

  const maxHari = template?.max_days ?? 0
  const days = Array.from({ length: maxHari }, (_, i) => i + 1)

  // Pengisi sub-poin selalu mengikuti poin induknya.
  const pengisiOfParent = (parentId: number | null) =>
    parentId != null ? (points.find((p) => p.id === parentId)?.filled_by ?? "dokter") : "dokter"

  function openAdd(categoriId: number, parentId: number | null) {
    setFormError(null)
    setModal({
      mode: "add",
      categoriId,
      parentId,
      editId: null,
      label: "",
      // Sub-poin → ikut induk; poin level atas → default "dokter".
      pengisi: pengisiOfParent(parentId),
      hari: new Set(),
    })
  }

  function openEdit(point: Point) {
    setFormError(null)
    setModal({
      mode: "edit",
      categoriId: point.category_id,
      parentId: point.parent_id,
      editId: point.id,
      label: point.label,
      // Sub-poin → tampilkan pengisi induk (mengikuti), bukan nilai sendiri.
      pengisi: point.parent_id != null ? pengisiOfParent(point.parent_id) : point.filled_by,
      hari: new Set(point.required_days ?? []),
    })
  }

  function toggleHari(d: number) {
    setModal((m) => {
      if (!m) return m
      const next = new Set(m.hari)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return { ...m, hari: next }
    })
  }

  async function handleSave() {
    if (!modal) return
    if (!modal.label.trim()) {
      setFormError("Label poin wajib diisi.")
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      category_id: modal.categoriId,
      parent_id: modal.parentId,
      label: modal.label.trim(),
      filled_by: modal.pengisi,
      required_days: [...modal.hari].sort((a, b) => a - b),
    }
    try {
      if (modal.mode === "add") {
        await api.post(`/clinical-pathway/templates/${templateId}/points`, payload)
      } else if (modal.editId !== null) {
        await api.put(`/clinical-pathway/points/${modal.editId}`, payload)
      }
      await loadPoints()
      setModal(null)
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setFormError(x.response?.data?.message ?? "Gagal menyimpan poin.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/clinical-pathway/points/${deleteTarget.id}`)
      await loadPoints()
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  // Buka modal salin → muat daftar formulir lain yang punya poin.
  async function openCopy() {
    setCopyError(null)
    setCopySourceId("")
    setCopyOpen(true)
    setCopyListLoading(true)
    try {
      const opts: { value: string; label: string }[] = []
      let page = 1
      let last = 1
      do {
        const res = await api.get("/clinical-pathway/templates", { params: { page } })
        const p = res.data.data
        for (const t of p.data as TemplateListItem[]) {
          if (t.id === templateId) continue
          if ((t.points_count ?? 0) === 0) continue
          const code = t.icd10?.code ?? "—"
          const display = t.icd10?.display ?? "Tanpa diagnosa"
          opts.push({ value: String(t.id), label: `${code} — ${display} (${t.points_count} poin)` })
        }
        last = p.last_page
        page++
      } while (page <= last)
      setCopyOptions(opts)
    } finally {
      setCopyListLoading(false)
    }
  }

  async function handleCopy() {
    if (!copySourceId) {
      setCopyError("Pilih formulir sumber dulu.")
      return
    }
    setCopying(true)
    setCopyError(null)
    try {
      await api.post(`/clinical-pathway/templates/${templateId}/copy-points`, {
        source_template_id: Number(copySourceId),
      })
      await loadPoints()
      setCopyOpen(false)
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setCopyError(x.response?.data?.message ?? "Gagal menyalin formulir.")
    } finally {
      setCopying(false)
    }
  }

  // Anak langsung dari sebuah poin, terurut.
  const childrenOf = (parentId: number) =>
    points
      .filter((p) => p.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

  // Poin level atas dalam satu kategori.
  const topPointsOf = (catId: number) =>
    points
      .filter((p) => p.category_id === catId && p.parent_id === null)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

  function renderPoint(point: Point, number: string, depth: number) {
    const subs = childrenOf(point.id)
    return (
      <div key={point.id} className="space-y-1">
        <div
          className="flex flex-col gap-2 rounded-lg border border-gray-200 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
          style={{ marginLeft: depth * 24 }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
                {number}
              </span>
              <span className="font-medium text-gray-900">{point.label}</span>
              <Badge variant="info">{pengisiLabel(point.filled_by)}</Badge>
            </div>
            {/* Hari wajib ceklis — hanya untuk poin tanpa sub-poin.
                Poin yang punya sub-poin jadi kelompok (tidak diceklis). */}
            {subs.length === 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="text-xs text-gray-400">Wajib ceklis hari:</span>
                {point.required_days && point.required_days.length > 0 ? (
                  point.required_days.map((d) => (
                    <span
                      key={d}
                      className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-[#4ba69d]/15 px-1 text-[11px] font-semibold text-[#4ba69d]"
                    >
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
            ) : (
              <div className="mt-1.5">
                <span className="text-xs text-gray-400">Kelompok poin (punya sub-poin)</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="xs"
              variant="outline"
              className="border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/10"
              onClick={() => openAdd(point.category_id, point.id)}
            >
              <Plus className="h-3.5 w-3.5" />
              Sub Poin
            </Button>
            <Button size="xs" variant="outline" onClick={() => openEdit(point)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="xs" variant="destructive" onClick={() => setDeleteTarget(point)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {subs.map((sub, i) => renderPoint(sub, `${number}.${i + 1}`, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="xs"
            className="mt-1"
            onClick={() => router.push("/clinical-pathway/formulir")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader
            title="Formulir Clinical Pathway"
            subtitle={
              template?.icd10
                ? `${template.icd10.code} — ${template.icd10.display} · maksimal ${maxHari} hari`
                : "Susun poin formulir per kategori"
            }
          />
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={openCopy}
          className="border-[#4ba69d] text-[#4ba69d] hover:bg-[#4ba69d]/10"
        >
          <Copy className="h-4 w-4" />
          Salin dari Formulir Lain
        </Button>
      </div>

      {loading ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">Memuat data...</p>
        </Card>
      ) : categories.length === 0 ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">
            Belum ada kategori. Tambahkan kategori dulu di menu Kategori.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const tops = topPointsOf(cat.id)
            return (
              <Card key={cat.id}>
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 min-w-[28px] items-center justify-center rounded-md bg-[#075489] px-2 text-sm font-semibold text-white">
                      {cat.sort_order}
                    </span>
                    <span className="text-base font-semibold text-gray-900">{cat.label}</span>
                  </div>
                  <Button
                    size="xs"
                    className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                    onClick={() => openAdd(cat.id, null)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Poin
                  </Button>
                </div>
                <div className="space-y-1 pt-3">
                  {tops.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-400">
                      Belum ada poin pada kategori ini.
                    </p>
                  ) : (
                    tops.map((p, i) => renderPoint(p, `${cat.sort_order}.${i + 1}`, 0))
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Hapus Poin"
        description="Poin ini beserta seluruh sub-poinnya akan dihapus. Lanjutkan?"
      />

      {/* Salin dari formulir lain */}
      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Salin dari Formulir Lain"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleCopy}
              disabled={copying || copyListLoading || copyOptions.length === 0}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {copying ? "Menyalin..." : "Salin"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {copyError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{copyError}</p>
          )}
          {points.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Formulir ini sudah memiliki poin. Poin dari formulir sumber akan{" "}
              <strong>ditambahkan</strong>, bukan menggantikan yang sudah ada.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Formulir sumber (diagnosa lain)</Label>
            {copyListLoading ? (
              <p className="py-4 text-center text-sm text-gray-400">Memuat daftar formulir...</p>
            ) : copyOptions.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                Belum ada formulir lain yang memiliki poin untuk disalin.
              </p>
            ) : (
              <SelectSearch
                options={copyOptions}
                value={copySourceId}
                onChange={setCopySourceId}
                placeholder="Pilih diagnosa sumber..."
              />
            )}
          </div>
          <p className="text-xs text-gray-400">
            Seluruh poin & sub-poin akan disalin. Hari wajib yang melebihi maksimal {maxHari} hari
            pada formulir ini akan diabaikan.
          </p>
        </div>
      </Modal>

      {/* Tambah / Edit poin */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.mode === "edit" ? "Edit Poin" : modal?.parentId ? "Tambah Sub Poin" : "Tambah Poin"}
        size="md"
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
        {modal && (
          <div className="space-y-4">
            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="point-label">Label Poin</Label>
              <Input
                id="point-label"
                placeholder="Contoh: Pemeriksaan tanda vital"
                value={modal.label}
                onChange={(e) => setModal((m) => (m ? { ...m, label: e.target.value } : m))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Diisi oleh</Label>
              {modal.parentId != null ? (
                <>
                  <Input value={pengisiLabel(modal.pengisi)} readOnly disabled />
                  <p className="text-xs text-gray-400">
                    Mengikuti poin induk — tidak bisa diubah.
                  </p>
                </>
              ) : (
                <SelectSearch
                  options={PENGISI_OPTIONS}
                  value={modal.pengisi}
                  onChange={(v) => setModal((m) => (m ? { ...m, pengisi: v } : m))}
                />
              )}
            </div>
            {modal.mode === "edit" &&
            modal.editId !== null &&
            childrenOf(modal.editId).length > 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Poin ini punya sub-poin, jadi menjadi kelompok dan tidak perlu ceklis hari. Ceklis
                dilakukan di tiap sub-poin.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label>Wajib ceklis pada hari</Label>
                <p className="text-xs text-gray-400">
                  Pilih hari ke berapa saja poin ini wajib diceklis.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {days.map((d) => {
                    const active = modal.hari.has(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleHari(d)}
                        className={
                          "flex h-9 min-w-[36px] items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors " +
                          (active
                            ? "border-[#075489] bg-[#075489] text-white"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50")
                        }
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

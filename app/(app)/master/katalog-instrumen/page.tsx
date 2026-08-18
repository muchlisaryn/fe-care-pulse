"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Library, ChevronRight, Package, X, Image as ImageIcon, Upload, ZoomIn } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"
// Halaman Instrumen dipakai ulang sebagai salah satu tab di sini (fitur terpusat).
import MasterInstrumenPage from "../instrumen/page"

type InstrumentLite = { id: number; code: string; name: string }
type ConditionLite = { id: number; name: string }

type CatalogItem = {
  id: number
  instrument_id: number
  quantity: number
  standard_condition_id: number | null
  note: string | null
  instrument: InstrumentLite | null
  standard_condition: ConditionLite | null
}

type InstrumentCatalog = {
  id: number
  code: string
  name: string
  image_url: string | null
  type: "single" | "paket"
  description: string | null
  items_count: number
}

// Rincian instrumen yang dipilih saat membuat/mengedit katalog.
type PickedItem = {
  instrument_id: number
  code: string
  name: string
  quantity: number
  standard_condition_id: string // "" = mengikuti kondisi standar instrumen
}

const emptyForm = { code: "", name: "", type: "paket" as "single" | "paket", description: "" }

function SetManager() {
  const t = useT()
  const [catalogs, setCatalogs] = useState<InstrumentCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")

  // Expand baris → muat rincian katalog (lazy).
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [expandedItems, setExpandedItems] = useState<Record<number, CatalogItem[]>>({})
  const [expandedLoading, setExpandedLoading] = useState<Record<number, boolean>>({})

  // Opsi untuk form.
  const [instruments, setInstruments] = useState<InstrumentLite[]>([])
  const [conditions, setConditions] = useState<ConditionLite[]>([])

  // Modal tambah/edit.
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [picked, setPicked] = useState<PickedItem[]>([])
  const [pickValue, setPickValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Gambar set/paket (opsional): file baru, gambar lama dari server, penanda hapus.
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [existingImage, setExistingImage] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Pratinjau (zoom) gambar set di modal terpisah.
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null)

  // Pratinjau gambar yang baru dipilih; object URL dibersihkan saat berganti/unmount.
  const objectUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile])
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])
  const previewSrc = objectUrl ?? (removeImage ? null : existingImage)

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f) {
      setImageFile(f)
      setRemoveImage(false)
    }
  }

  function handleClearImage() {
    setImageFile(null)
    setRemoveImage(true)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function resetImageState() {
    setImageFile(null)
    setExistingImage(null)
    setRemoveImage(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Hapus.
  const [deleteTarget, setDeleteTarget] = useState<InstrumentCatalog | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function loadCatalogs() {
    setLoading(true)
    try {
      const res = await api.get("/master/instrument-catalogs", {
        params: { search: appliedSearch || undefined, page },
      })
      const p = res.data.data
      setCatalogs(p.data)
      setTotalPages(p.last_page)
      setTotalItems(p.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCatalogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, page])

  // Kondisi untuk dropdown rincian.
  useEffect(() => {
    api
      .get("/master/conditions", { params: { page: 1 } })
      .then((r) => setConditions(r.data.data.data))
      .catch(() => {})
  }, [])

  // Semua instrumen (lintas halaman) untuk dipilih jadi rincian katalog.
  async function loadInstruments() {
    const collected: InstrumentLite[] = []
    let cur = 1
    let last = 1
    do {
      const res = await api.get("/master/instruments", { params: { page: cur } })
      const p = res.data.data
      collected.push(...p.data)
      last = p.last_page
      cur += 1
    } while (cur <= last)
    setInstruments(collected)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setAppliedSearch(searchInput.trim())
  }

  async function toggleExpand(cat: InstrumentCatalog) {
    const open = !expanded[cat.id]
    setExpanded((p) => ({ ...p, [cat.id]: open }))
    if (open && !expandedItems[cat.id]) {
      setExpandedLoading((p) => ({ ...p, [cat.id]: true }))
      try {
        const res = await api.get(`/master/instrument-catalogs/${cat.id}`)
        setExpandedItems((p) => ({ ...p, [cat.id]: res.data.data.items ?? [] }))
      } finally {
        setExpandedLoading((p) => ({ ...p, [cat.id]: false }))
      }
    }
  }

  function openTambah() {
    setForm(emptyForm)
    setPicked([])
    setPickValue("")
    setEditId(null)
    setFormError(null)
    resetImageState()
    setModal("tambah")
    loadInstruments()
  }

  async function openEdit(cat: InstrumentCatalog) {
    setEditId(cat.id)
    setModal("edit")
    setPickValue("")
    setFormError(null)
    resetImageState()
    loadInstruments()
    // Muat detail untuk dapat rincian terkini.
    const res = await api.get(`/master/instrument-catalogs/${cat.id}`)
    const data = res.data.data as InstrumentCatalog & { items: CatalogItem[] }
    setExistingImage(data.image_url ?? null)
    setForm({
      code: data.code,
      name: data.name,
      type: data.type,
      description: data.description ?? "",
    })
    setPicked(
      (data.items ?? []).map((it) => ({
        instrument_id: it.instrument_id,
        code: it.instrument?.code ?? `#${it.instrument_id}`,
        name: it.instrument?.name ?? "—",
        quantity: it.quantity,
        standard_condition_id: it.standard_condition_id ? String(it.standard_condition_id) : "",
      }))
    )
  }

  function addPicked(instrumentId: string) {
    const id = Number(instrumentId)
    setPickValue("")
    if (!id || picked.some((p) => p.instrument_id === id)) return
    // Tipe single hanya boleh punya tepat 1 rincian.
    if (form.type === "single" && picked.length >= 1) {
      setFormError(t("catalog.errSingleOne"))
      return
    }
    const instrument = instruments.find((s) => s.id === id)
    if (instrument) {
      setPicked((p) => [
        ...p,
        { instrument_id: id, code: instrument.code, name: instrument.name, quantity: 1, standard_condition_id: "" },
      ])
      setFormError(null)
    }
  }

  function removePicked(id: number) {
    setPicked((p) => p.filter((x) => x.instrument_id !== id))
  }

  function updatePicked(id: number, patch: Partial<PickedItem>) {
    setPicked((p) => p.map((x) => (x.instrument_id === id ? { ...x, ...patch } : x)))
  }

  async function handleSave() {
    if (saving) return
    if (!form.code.trim() || !form.name.trim()) {
      setFormError(t("catalog.errCodeName"))
      return
    }
    if (picked.length === 0) {
      setFormError(t("catalog.errMinOne"))
      return
    }
    if (form.type === "single" && picked.length !== 1) {
      setFormError(t("catalog.errSingleExactly"))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        items: picked.map((p) => ({
          instrument_id: p.instrument_id,
          quantity: p.quantity,
          standard_condition_id: p.standard_condition_id ? Number(p.standard_condition_id) : null,
        })),
      }
      let catalogId = editId
      if (modal === "tambah") {
        const res = await api.post("/master/instrument-catalogs", payload)
        catalogId = res.data.data.id
      } else if (editId !== null) {
        await api.put(`/master/instrument-catalogs/${editId}`, payload)
        // Buang cache expand agar rincian dimuat ulang saat dibuka.
        setExpandedItems((p) => {
          const next = { ...p }
          delete next[editId]
          return next
        })
        setExpanded((p) => ({ ...p, [editId]: false }))
      }
      // Sinkronkan gambar set (opsional) setelah katalog tersimpan.
      if (catalogId != null) {
        if (imageFile) {
          const fd = new FormData()
          fd.append("image", imageFile)
          await api.post(`/master/instrument-catalogs/${catalogId}/image`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        } else if (removeImage && existingImage) {
          await api.delete(`/master/instrument-catalogs/${catalogId}/image`)
        }
      }
      setModal(null)
      loadCatalogs()
    } catch (err) {
      // 422 mengembalikan pesan generik di `message`; pesan yang berguna (mis. kode /
      // nama katalog sudah dipakai) ada di `errors` per field — tampilkan itu dulu.
      const e = err as {
        response?: { data?: { message?: string; errors?: Record<string, string[]> } }
      }
      const fieldError = Object.values(e.response?.data?.errors ?? {})[0]?.[0]
      setFormError(fieldError ?? e.response?.data?.message ?? t("catalog.errSave"))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/instrument-catalogs/${deleteTarget.id}`)
      setDeleteTarget(null)
      loadCatalogs()
    } finally {
      setDeletingId(null)
    }
  }

  // Opsi instrumen di dropdown = belum dipilih.
  const instrumentOptions = instruments
    .filter((s) => !picked.some((p) => p.instrument_id === s.id))
    .map((s) => ({ value: String(s.id), label: `${s.code} — ${s.name}` }))

  const conditionOptions = conditions.map((c) => ({ value: String(c.id), label: c.name }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Library className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("catalog.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("catalog.subtitle")}
            </p>
          </div>
        </div>
        <Button onClick={openTambah} className="bg-[#075489] hover:bg-[#075489]/90 text-white">
          {t("catalog.addSet")}
        </Button>
      </div>

      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("catalog.searchPlaceholder")}
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
        ) : catalogs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("catalog.empty")}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Header tabel */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50/60">
              <div className="col-span-2">{t("catalog.colCode")}</div>
              <div className="col-span-4">{t("catalog.colName")}</div>
              <div className="col-span-1 text-center">{t("catalog.colItems")}</div>
              <div className="col-span-5 text-right">{t("common.actions")}</div>
            </div>

            {catalogs.map((cat) => {
              const isOpen = !!expanded[cat.id]
              const items = expandedItems[cat.id]
              return (
                <div key={cat.id}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-gray-50/60 sm:grid sm:grid-cols-12 sm:gap-3 sm:px-5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(cat)}
                      className="order-1 flex items-center gap-2 text-left sm:order-none sm:col-span-2"
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
                        {cat.code}
                      </span>
                    </button>
                    <div className="order-3 flex w-full items-center gap-2.5 font-medium text-gray-900 sm:order-none sm:col-span-4 sm:w-auto">
                      {cat.image_url ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ src: cat.image_url!, name: cat.name })}
                          title={t("catalog.viewImage")}
                          className="group relative shrink-0 cursor-zoom-in overflow-hidden rounded border border-gray-200 transition hover:ring-2 hover:ring-[#075489]/40"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={cat.image_url} alt={cat.name} className="h-8 w-8 object-cover" />
                          <span className="absolute inset-0 hidden items-center justify-center bg-black/30 text-white group-hover:flex">
                            <ZoomIn className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-100 bg-gray-50 text-gray-300">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                      <span className="truncate">{cat.name}</span>
                    </div>
                    <div className="order-2 ml-auto text-sm font-semibold text-gray-700 sm:order-none sm:col-span-1 sm:ml-0 sm:text-center">
                      {cat.items_count}
                      <span className="ml-1 text-xs font-normal text-gray-400 sm:hidden">{t("catalog.itemsSuffix")}</span>
                    </div>
                    <div className="order-4 flex w-full justify-end gap-2 sm:order-none sm:col-span-5 sm:w-auto">
                      <Button size="xs" variant="outline" onClick={() => openEdit(cat)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="border-red-300 text-red-500 hover:bg-red-50"
                        disabled={deletingId === cat.id}
                        onClick={() => setDeleteTarget(cat)}
                      >
                        {t("common.delete")}
                      </Button>
                    </div>
                  </div>

                  {/* Panel rincian instrumen */}
                  {isOpen && (
                    <div className="bg-gray-50/70 px-4 pb-4 pt-1 sm:px-5 sm:pl-12">
                      {cat.description && (
                        <p className="py-2 text-xs text-gray-500">{cat.description}</p>
                      )}
                      {expandedLoading[cat.id] ? (
                        <p className="py-3 text-xs text-gray-400">{t("catalog.loadingItems")}</p>
                      ) : !items || items.length === 0 ? (
                        <p className="py-3 text-xs text-gray-400">{t("catalog.noItems")}</p>
                      ) : (
                        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="font-mono text-xs font-semibold text-[#4ba69d] bg-[#4ba69d]/10 px-2 py-1 rounded">
                                {it.instrument?.code ?? "—"}
                              </span>
                              <span className="flex-1 text-sm text-gray-700">
                                {it.instrument?.name ?? "—"}
                              </span>
                              {it.standard_condition && (
                                <Badge variant="default">{it.standard_condition.name}</Badge>
                              )}
                              <span className="text-sm font-semibold text-gray-600">
                                ×{it.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={setPage}
        />
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      {/* Tambah / Edit Katalog */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? t("catalog.modalAdd") : t("catalog.modalEdit")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.code.trim() || !form.name.trim()}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-code">{t("catalog.codeLabel")}</Label>
              <Input
                id="cat-code"
                placeholder={t("catalog.codePlaceholder")}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">{t("catalog.colName")}</Label>
              <Input
                id="cat-name"
                placeholder={t("catalog.namePlaceholder")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-desc">{t("catalog.descLabel")}</Label>
              <Textarea
                id="cat-desc"
                rows={2}
                placeholder={t("catalog.descPlaceholder")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Gambar set/paket (opsional) */}
          <div className="space-y-1.5 border-t border-gray-100 pt-4">
            <Label>{t("catalog.imageLabel")}</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewSrc} alt={t("catalog.imagePreviewAlt")} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-gray-300" />
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-[#075489] text-[#075489] hover:bg-[#075489]/10"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {previewSrc ? t("catalog.replaceImage") : t("catalog.pickImage")}
                  </Button>
                  {previewSrc && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={handleClearImage}
                      className="border-red-300 text-red-500 hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("common.delete")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-400">{t("catalog.imageHint")}</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePickImage}
                className="hidden"
              />
            </div>
          </div>

          {/* Pemilih rincian instrumen */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <Label>{t("catalog.itemsLabel")}</Label>
            <SelectSearch
              options={instrumentOptions}
              value={pickValue}
              onChange={addPicked}
              placeholder={t("catalog.addInstrument")}
              searchPlaceholder={t("catalog.searchInstrument")}
              disabled={form.type === "single" && picked.length >= 1}
            />
            {picked.length === 0 ? (
              <p className="text-xs text-gray-400">{t("catalog.noPicked")}</p>
            ) : (
              <div className="space-y-2 pt-1">
                {picked.map((p) => (
                  <div
                    key={p.instrument_id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-[#4ba69d]" />
                      <span className="font-mono text-xs font-semibold text-[#075489]">{p.code}</span>
                      <span className="text-sm text-gray-700">{p.name}</span>
                    </span>
                    <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">{t("catalog.qty")}</span>
                        <Input
                          type="number"
                          min={1}
                          value={String(p.quantity)}
                          onChange={(e) =>
                            updatePicked(p.instrument_id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-16 text-center"
                        />
                      </div>
                      <div className="flex-1 sm:w-44">
                        <SelectSearch
                          options={conditionOptions}
                          value={p.standard_condition_id}
                          onChange={(v) => updatePicked(p.instrument_id, { standard_condition_id: v })}
                          placeholder={t("catalog.standardCondition")}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePicked(p.instrument_id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              {form.type === "single"
                ? t("catalog.hintSingle")
                : t("catalog.hintPackage", { n: picked.length })}
            </p>
          </div>

          {formError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
          )}
        </div>
      </Modal>

      {/* Pratinjau / zoom gambar set */}
      <Modal
        open={previewImage !== null}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.name ?? t("catalog.imageModalTitle")}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setPreviewImage(null)}>
            {t("common.close")}
          </Button>
        }
      >
        {previewImage && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="max-h-[70vh] w-auto rounded-lg object-contain"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

// Halaman terpusat: tab "Satuan" (jenis instrumen + unit fisik) dan "Set Paket".
export default function SetInstrumenPage() {
  const t = useT()
  const [tab, setTab] = useState<"instrumen" | "set">("instrumen")

  const tabClass = (active: boolean) =>
    `rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-[#075489] text-white" : "text-gray-600 hover:text-gray-900"
    }`

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
        <button type="button" onClick={() => setTab("instrumen")} className={tabClass(tab === "instrumen")}>
          {t("catalog.tabSingle")}
        </button>
        <button type="button" onClick={() => setTab("set")} className={tabClass(tab === "set")}>
          {t("catalog.tabPackage")}
        </button>
      </div>

      {tab === "instrumen" ? <MasterInstrumenPage /> : <SetManager />}
    </div>
  )
}

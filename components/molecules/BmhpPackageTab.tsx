"use client"

import { useEffect, useState } from "react"
import { Search, Trash2 } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchPackageBmhps,
  setPackageBmhpSearch,
  setPackageBmhpPage,
  invalidatePackageBmhps,
  type PackageBmhp,
} from "@/lib/store/slices/packageBmhpSlice"
import api from "@/lib/axios"
import { apiErrorMessage } from "@/lib/apiError"
import { useT } from "@/lib/i18n"

// Pilihan BMHP satuan untuk diisikan ke paket.
type BmhpOption = { id: number; code: string; name: string; unit: string | null; price: number }

// Satu baris isi paket di form. `qty` disimpan sebagai teks selama diketik
// supaya pecahan ("0,5" yang baru setengah jadi) tidak dibulatkan di tengah jalan.
type FormItem = { bmhp_id: number; name: string; unit: string | null; price: number; qty: string }

const emptyForm = { code: "", name: "", items: [] as FormItem[] }

function rupiah(nilai: number): string {
  return `Rp ${Number(nilai ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 0 })}`
}

/**
 * Tab "Paket BMHP" pada halaman Master BMHP: daftar paket (kumpulan BMHP satuan)
 * beserta form tambah/ubahnya. Judul halaman dipegang halamannya; di sini hanya
 * isi tabnya.
 */
export function BmhpPackageTab() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.packageBmhps
  )

  const t = useT()
  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PackageBmhp | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // Hasil simpan/hapus — berhasil maupun gagal selalu dikabarkan lewat dialog.
  const [result, setResult] = useState<{ variant: "success" | "error"; text: string } | null>(null)

  // Pilihan BMHP — dimuat saat form dibuka pertama kali.
  const [bmhps, setBmhps] = useState<BmhpOption[]>([])
  const [bmhpsLoading, setBmhpsLoading] = useState(false)
  const [bmhpsLoaded, setBmhpsLoaded] = useState(false)
  // BMHP & jumlah yang sedang dipilih di baris tambah.
  const [newBmhpId, setNewBmhpId] = useState("")
  const [newQty, setNewQty] = useState("1")

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchPackageBmhps())
  }, [loaded, dirty, dispatch])

  async function loadBmhps() {
    if (bmhpsLoaded || bmhpsLoading) return
    setBmhpsLoading(true)
    try {
      const res = await api.get("/master/bmhps/options")
      setBmhps(res.data.data)
      setBmhpsLoaded(true)
    } catch (err) {
      setResult({ variant: "error", text: apiErrorMessage(err, "masterPackageBmhp.bmhpsFailed") })
    } finally {
      setBmhpsLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setPackageBmhpSearch(searchInput))
  }

  function resetAdder() {
    setNewBmhpId("")
    setNewQty("1")
  }

  function openTambah() {
    loadBmhps()
    setForm(emptyForm)
    setEditId(null)
    resetAdder()
    setModal("tambah")
  }

  function openEdit(row: PackageBmhp) {
    loadBmhps()
    setForm({
      code: row.code,
      name: row.name,
      items: row.items.map((it) => ({
        bmhp_id: it.bmhp_id,
        name: it.bmhp?.name ?? "—",
        unit: it.bmhp?.unit ?? null,
        price: it.bmhp?.price ?? 0,
        qty: String(it.qty),
      })),
    })
    setEditId(row.id)
    resetAdder()
    setModal("edit")
  }

  // BMHP yang sudah masuk paket tidak ditawarkan lagi — satu BMHP hanya boleh
  // muncul sekali dalam satu paket.
  const terpakai = new Set(form.items.map((it) => it.bmhp_id))
  const bmhpOptions = bmhps
    .filter((b) => !terpakai.has(b.id))
    .map((b) => ({ value: String(b.id), label: `${b.code} — ${b.name}` }))

  function addItem() {
    const bmhp = bmhps.find((b) => String(b.id) === newBmhpId)
    if (!bmhp || !(Number(newQty) > 0)) return
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { bmhp_id: bmhp.id, name: bmhp.name, unit: bmhp.unit, price: bmhp.price, qty: newQty },
      ],
    }))
    resetAdder()
  }

  const total = form.items.reduce((n, it) => n + (Number(it.qty) || 0) * it.price, 0)
  const canSave =
    form.code.trim().length > 0 &&
    form.name.trim().length > 0 &&
    form.items.length > 0 &&
    form.items.every((it) => Number(it.qty) > 0)

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        items: form.items.map((it) => ({ bmhp_id: it.bmhp_id, qty: Number(it.qty) })),
      }
      if (modal === "tambah") {
        await api.post("/master/package-bmhps", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/package-bmhps/${editId}`, payload)
      }
      dispatch(invalidatePackageBmhps())
      setResult({
        variant: "success",
        text: modal === "tambah" ? "masterPackageBmhp.added" : "masterPackageBmhp.updated",
      })
      setModal(null)
    } catch (err) {
      // Modalnya dibiarkan terbuka supaya isian tidak hilang — mis. kode yang
      // ternyata sudah dipakai tinggal diganti.
      setResult({ variant: "error", text: apiErrorMessage(err, "masterPackageBmhp.saveFailed") })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/package-bmhps/${deleteTarget.id}`)
      dispatch(invalidatePackageBmhps())
      setDeleteTarget(null)
      setResult({ variant: "success", text: "masterPackageBmhp.deleted" })
    } catch (err) {
      setDeleteTarget(null)
      setResult({ variant: "error", text: apiErrorMessage(err, "masterPackageBmhp.deleteFailed") })
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<PackageBmhp>[] = [
    {
      header: t("common.code"),
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
          {row.code}
        </span>
      ),
      className: "w-32",
    },
    {
      header: t("masterPackageBmhp.colName"),
      cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      header: t("masterPackageBmhp.colTotal"),
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700">{rupiah(row.total_price)}</span>
      ),
      className: "w-36",
    },
  ]

  return (
    <>
      <Card className="p-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("masterPackageBmhp.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              {t("common.search")}
            </Button>
            {/* Tombol tambah ikut di baris ini: judul halaman dipakai bersama
                tab BMHP, jadi tidak ada tempat untuknya di kepala halaman. */}
            <Button
              type="button"
              onClick={openTambah}
              className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white shrink-0"
            >
              {t("masterPackageBmhp.add")}
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
            emptyMessage={t("masterPackageBmhp.empty")}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={20}
          onPageChange={(p) => dispatch(setPackageBmhpPage(p))}
        />
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      <ResultDialog
        open={result !== null}
        onClose={() => setResult(null)}
        variant={result?.variant ?? "success"}
        description={result ? t(result.text) : ""}
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? t("masterPackageBmhp.modalAdd") : t("masterPackageBmhp.modalEdit")}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-bmhp-code">
                {t("common.code")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="pkg-bmhp-code"
                placeholder={t("masterPackageBmhp.codePlaceholder")}
                value={form.code}
                maxLength={50}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-bmhp-name">
                {t("masterPackageBmhp.colName")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="pkg-bmhp-name"
                placeholder={t("masterPackageBmhp.namePlaceholder")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>

          {/* Isi paket: pilih BMHP + jumlah, lalu Tambah. */}
          <div className="space-y-2">
            <Label>
              {t("masterPackageBmhp.colContents")} <span className="text-red-500">*</span>
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <SelectSearch
                  options={bmhpOptions}
                  value={newBmhpId}
                  onChange={setNewBmhpId}
                  loading={bmhpsLoading}
                  placeholder={t("masterPackageBmhp.selectBmhp")}
                  searchPlaceholder={t("masterPackageBmhp.searchBmhp")}
                />
              </div>
              <Input
                type="number"
                min={0}
                step="0.01"
                aria-label={t("masterPackageBmhp.qty")}
                placeholder={t("masterPackageBmhp.qty")}
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="sm:w-28"
              />
              <Button
                type="button"
                onClick={addItem}
                disabled={!newBmhpId || !(Number(newQty) > 0)}
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white shrink-0"
              >
                {t("common.add")}
              </Button>
            </div>

            {form.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
                {t("masterPackageBmhp.itemsEmpty")}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {form.items.map((it) => (
                  <li key={it.bmhp_id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{it.name}</p>
                      <p className="text-xs text-gray-400">
                        {rupiah(it.price)}
                        {it.unit ? ` / ${it.unit}` : ""}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label={t("masterPackageBmhp.qty")}
                      value={it.qty}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          items: f.items.map((x) =>
                            x.bmhp_id === it.bmhp_id ? { ...x, qty: e.target.value } : x
                          ),
                        }))
                      }
                      className="w-24"
                    />
                    <span className="w-28 shrink-0 text-right text-sm tabular-nums text-gray-700">
                      {rupiah((Number(it.qty) || 0) * it.price)}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("common.delete")}
                      title={t("common.delete")}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          items: f.items.filter((x) => x.bmhp_id !== it.bmhp_id),
                        }))
                      }
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
                  <span>{t("masterPackageBmhp.colTotal")}</span>
                  <span className="tabular-nums">{rupiah(total)}</span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

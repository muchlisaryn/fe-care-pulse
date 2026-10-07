"use client"

import { useEffect, useState } from "react"
import { Search, Boxes, PackagePlus } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { NumberInput } from "@/components/atoms/NumberInput"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { Pagination } from "@/components/molecules/Pagination"
import { BmhpPackageTab } from "@/components/molecules/BmhpPackageTab"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchBmhps,
  setBmhpSearch,
  setBmhpPage,
  invalidateBmhps,
  type Bmhp,
} from "@/lib/store/slices/bmhpSlice"
import api from "@/lib/axios"
import { apiErrorMessage } from "@/lib/apiError"
import { useT } from "@/lib/i18n"

// Kode diketik manual oleh admin — server tidak lagi membuatkannya.
const emptyForm = { code: "", name: "", unit_id: "", stock_qty: 0, price: "" }

export default function MasterBmhpPage() {
  const dispatch = useAppDispatch()
  const { items, totalItems, totalPages, page, search, loading, loaded, dirty } = useAppSelector(
    (s) => s.bmhps
  )

  const t = useT()
  // BMHP satuan & paket BMHP satu halaman, dua tab.
  const [tab, setTab] = useState<"bmhp" | "paket">("bmhp")
  const [searchInput, setSearchInput] = useState(search)
  const [modal, setModal] = useState<"tambah" | "edit" | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Bmhp | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // Galat simpan/hapus (mis. kode yang sudah dipakai) dikabarkan lewat dialog.
  const [galat, setGalat] = useState<string | null>(null)

  // Pilihan satuan dari master satuan — dimuat saat form dibuka pertama kali.
  const [units, setUnits] = useState<{ value: string; label: string }[]>([])
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [unitsLoaded, setUnitsLoaded] = useState(false)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchBmhps())
  }, [loaded, dirty, dispatch])

  async function loadUnits() {
    if (unitsLoaded || unitsLoading) return
    setUnitsLoading(true)
    try {
      const res = await api.get("/master/units/options")
      setUnits(
        (res.data.data as { value: number; label: string }[]).map((u) => ({
          value: String(u.value),
          label: u.label,
        }))
      )
      setUnitsLoaded(true)
    } catch (err) {
      setGalat(apiErrorMessage(err, "masterBmhp.unitsFailed"))
    } finally {
      setUnitsLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setBmhpSearch(searchInput))
  }

  function openTambah() {
    loadUnits()
    setForm(emptyForm)
    setEditId(null)
    setModal("tambah")
  }

  function openEdit(row: Bmhp) {
    loadUnits()
    setForm({
      code: row.code,
      name: row.name,
      unit_id: row.unit_id != null ? String(row.unit_id) : "",
      stock_qty: row.stock_qty,
      // Isian harga hanya menerima digit — pecahan rupiahnya dibulatkan.
      price: row.price ? String(Math.round(row.price)) : "",
    })
    setEditId(row.id)
    setModal("edit")
  }

  const canSave =
    form.code.trim().length > 0 && form.name.trim().length > 0 && form.unit_id !== ""

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        unit_id: Number(form.unit_id),
        stock_qty: Number(form.stock_qty) || 0,
        price: Number(form.price) || 0,
      }
      if (modal === "tambah") {
        await api.post("/master/bmhps", payload)
      } else if (modal === "edit" && editId !== null) {
        await api.put(`/master/bmhps/${editId}`, payload)
      }
      dispatch(invalidateBmhps())
      setModal(null)
    } catch (err) {
      // Modalnya dibiarkan terbuka supaya isian tidak hilang — kode yang ternyata
      // sudah dipakai tinggal diganti.
      setGalat(apiErrorMessage(err, "masterBmhp.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingId !== null) return
    setDeletingId(deleteTarget.id)
    try {
      await api.delete(`/master/bmhps/${deleteTarget.id}`)
      dispatch(invalidateBmhps())
      setDeleteTarget(null)
    } catch (err) {
      setDeleteTarget(null)
      setGalat(apiErrorMessage(err, "masterBmhp.deleteFailed"))
    } finally {
      setDeletingId(null)
    }
  }

  const columns: Column<Bmhp>[] = [
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
      header: t("masterBmhp.colName"),
      cell: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      header: t("common.unitOfMeasure"),
      cell: (row) =>
        row.unit ? (
          <span className="text-gray-700">{row.unit}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
      className: "w-24",
    },
    {
      header: t("common.stock"),
      cell: (row) => (
        <span className={`font-semibold ${row.stock_qty <= 5 ? "text-red-500" : "text-gray-900"}`}>
          {row.stock_qty}
        </span>
      ),
      className: "w-20",
    },
    {
      header: t("masterBmhp.colPrice"),
      // Ditulis menyatu ("Rp 90.000") dan rata kiri seperti kolom lain — bukan
      // "Rp" di kiri dan angkanya di kanan, yang di kolom sesempit ini terbaca
      // sebagai dua isi yang terpisah.
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700">
          Rp {Number(row.price ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 0 })}
        </span>
      ),
      className: "w-36",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("masterBmhp.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("masterBmhp.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Tab berbentuk tombol terpisah berikon — sama dengan sub-tab di halaman
          Produksi CSSD: yang aktif biru penuh, yang lain abu-abu muda. */}
      <div className="flex max-w-full gap-2 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { key: "bmhp" as const, icon: Boxes, label: t("masterBmhp.tabBmhp") },
            { key: "paket" as const, icon: PackagePlus, label: t("masterBmhp.tabPackage") },
          ]
        ).map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setTab(v.key)}
            className={
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2 font-medium transition-colors " +
              (tab === v.key
                ? "border-[#075489] bg-[#075489] text-white shadow-sm"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100")
            }
          >
            <v.icon className="h-4 w-4 shrink-0" />
            {v.label}
          </button>
        ))}
      </div>

      {tab === "paket" && <BmhpPackageTab />}

      {tab === "bmhp" && (
        <Card className="p-0">
          <div className="px-5 py-4 border-b border-gray-100">
            <form onSubmit={handleSearch} className="flex gap-2 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  placeholder={t("masterBmhp.searchPlaceholder")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
                {t("common.search")}
              </Button>
              {/* Tombol tambah di bawah tab, sebaris dengan pencarian — sama
                  seperti di tab Paket BMHP. */}
              <Button
                type="button"
                onClick={openTambah}
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white shrink-0"
              >
                {t("masterBmhp.addBmhp")}
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
              emptyMessage={t("masterBmhp.empty")}
            />
          )}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={20}
            onPageChange={(p) => dispatch(setBmhpPage(p))}
          />
        </Card>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingId !== null}
      />

      <ResultDialog
        open={galat !== null}
        onClose={() => setGalat(null)}
        variant="error"
        description={galat ? t(galat) : ""}
      />

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "tambah" ? t("masterBmhp.modalAdd") : t("masterBmhp.modalEdit")}
        size="sm"
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
          <div className="space-y-1.5">
            <Label htmlFor="bmhp-code">
              {t("common.code")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="bmhp-code"
              placeholder={t("masterBmhp.codePlaceholder")}
              value={form.code}
              maxLength={50}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bmhp-name">
              {t("masterBmhp.colName")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="bmhp-name"
              placeholder={t("masterBmhp.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {t("common.unitOfMeasure")} <span className="text-red-500">*</span>
              </Label>
              <SelectSearch
                options={units}
                value={form.unit_id}
                onChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}
                loading={unitsLoading}
                placeholder={t("masterBmhp.unitPlaceholder")}
                searchPlaceholder={t("masterBmhp.unitSearch")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bmhp-stock">{t("common.stock")}</Label>
              <Input
                id="bmhp-stock"
                type="number"
                min={0}
                // Stok boleh pecahan, dua angka di belakang koma.
                step="0.01"
                value={form.stock_qty}
                onChange={(e) => setForm((f) => ({ ...f, stock_qty: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bmhp-price">{t("masterBmhp.colPrice")}</Label>
            <NumberInput
              id="bmhp-price"
              prefix="Rp"
              placeholder="0"
              value={form.price}
              onValueChange={(v) => setForm((f) => ({ ...f, price: v }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

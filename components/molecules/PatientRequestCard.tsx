"use client"

import { useState } from "react"
import { Boxes, ChevronRight, Plus, Trash2, User, Wrench } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { QtyStepper } from "@/components/atoms/QtyStepper"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"
import {
  digitsOnly,
  MAX_RM_LENGTH,
  patientAccent,
  totalQtyOf,
  type AddMode,
  type InstrumentType,
  type PaketCatalog,
  type PaketContent,
  type PaketItem,
  type PatientGroup,
  type RequestLine,
} from "@/lib/orderRequest"

type PatientRequestCardProps = {
  /** Nomor urut pasien pada form (1, 2, 3, ...). */
  index: number
  group: PatientGroup
  onChange: (group: PatientGroup) => void
  onRemove: () => void
  /** Grup terakhir tidak boleh dihapus — minimal satu pasien harus ada. */
  canRemove: boolean
  /** Identitas pasien hanya diisi untuk layanan RAWAT INAP. */
  showPatientFields: boolean
  instruments: InstrumentType[]
  catalogs: PaketCatalog[]
  instrumentLoading: boolean
  catalogLoading: boolean
  /** Stok steril total satu instrumen/paket (belum dikurangi isi form). */
  sterileAvailFor: (type: AddMode, refId: number) => number
  /** Jumlah yang sudah dipesan pasien LAIN pada form ini — ikut mengurangi stok. */
  usedByOthers: (type: AddMode, refId: number) => number
  /** Pesan kesalahan ditampilkan terpusat di bawah form halaman. */
  onError: (message: string | null) => void
}

/**
 * Satu pasien pada form order: identitas pasien + daftar permintaannya. Satu kartu =
 * satu record order saat disimpan, sehingga beberapa pasien bisa diorder sekaligus
 * dalam satu pengisian form (data peminjam, ruangan & jadwalnya dipakai bersama).
 *
 * Sisa stok dihitung lintas pasien: yang sudah dipesan pasien lain di form yang sama
 * ikut mengurangi stok yang boleh ditambahkan di sini.
 */
export function PatientRequestCard({
  index,
  group,
  onChange,
  onRemove,
  canRemove,
  showPatientFields,
  instruments,
  catalogs,
  instrumentLoading,
  catalogLoading,
  sterileAvailFor,
  usedByOthers,
  onError,
}: PatientRequestCardProps) {
  const t = useT()
  // Mode penambahan: per jenis instrumen (satuan) atau per paket (katalog tipe paket).
  const [addMode, setAddMode] = useState<AddMode>("satuan")
  const [newInstrumentId, setNewInstrumentId] = useState("")
  const [newInstrumentQty, setNewInstrumentQty] = useState("1")
  const [newCatalogId, setNewCatalogId] = useState("")
  const [newCatalogQty, setNewCatalogQty] = useState("1")
  // Isi paket terpilih (ditampilkan agar peminjam tahu instrumen apa saja di dalamnya).
  const [paketItems, setPaketItems] = useState<PaketItem[]>([])
  const [loadingPaketItems, setLoadingPaketItems] = useState(false)
  // Baris paket yang sedang dibuka (menampilkan rincian isi paket).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const requests = group.requests
  const totalQty = totalQtyOf(requests)

  // Label pilihan: NAMA + sisa stok saja, tanpa kode instrumen — peminjam mengenali
  // barang dari namanya, bukan dari kode internal CSSD.
  //
  // Angka yang ditampilkan adalah SISA: stok steril dikurangi yang sudah masuk form
  // ini (pasien ini + pasien lain). Barang yang sisanya habis TIDAK ditampilkan lagi,
  // supaya tidak sempat dipilih hanya untuk ditolak saat ditambahkan.
  const instrumentOptions = instruments
    .map((i) => ({
      instrument: i,
      left: sterileAvailFor("satuan", i.id) - ownQty("satuan", i.id) - usedByOthers("satuan", i.id),
    }))
    .filter(({ left }) => left > 0)
    .map(({ instrument, left }) => ({
      value: String(instrument.id),
      label: t("patientCard.availableSuffix", { name: instrument.name, n: left }),
    }))

  // Hanya paket yang seluruh komponennya bisa dipenuhi dari stok steril, dan yang
  // sisanya belum habis dipesan di form ini.
  const catalogOptions = catalogs
    .map((c) => ({
      catalog: c,
      left: sterileAvailFor("paket", c.id) - ownQty("paket", c.id) - usedByOthers("paket", c.id),
    }))
    .filter(({ left }) => left > 0)
    .map(({ catalog, left }) => ({
      value: String(catalog.id),
      label: t("patientCard.availableSets", { name: catalog.name, n: left }),
    }))

  function setRequests(next: RequestLine[]) {
    onChange({ ...group, requests: next })
  }

  /** Jumlah yang sudah masuk daftar untuk instrumen/paket ini (pasien ini saja). */
  function ownQty(type: AddMode, refId: number): number {
    return Number(requests.find((r) => r.type === type && r.refId === refId)?.quantity) || 0
  }

  // Tambah / gabungkan baris permintaan. Bila jenis/paket yang sama sudah ada pada
  // pasien ini, jumlahnya diakumulasi alih-alih membuat baris baru.
  function addRequest(type: AddMode, refId: number, name: string, quantity: number, contents?: PaketContent[]) {
    if (quantity <= 0) return
    const idx = requests.findIndex((r) => r.type === type && r.refId === refId)
    if (idx === -1) {
      setRequests([...requests, { type, refId, name, quantity: String(quantity), contents }])
      return
    }
    const next = [...requests]
    next[idx] = { ...next[idx], quantity: String((Number(next[idx].quantity) || 0) + quantity) }
    setRequests(next)
  }

  function handleAddInstrument() {
    const inst = instruments.find((i) => String(i.id) === newInstrumentId)
    const qty = Number(newInstrumentQty)
    if (!inst || !qty || qty <= 0) return
    // Tidak boleh melebihi stok steril — termasuk yang sudah dipesan pasien lain.
    const avail = sterileAvailFor("satuan", inst.id)
    const already = ownQty("satuan", inst.id) + usedByOthers("satuan", inst.id)
    if (already + qty > avail) {
      onError(
        t("patientCard.errStockSingle", {
          name: inst.name,
          avail,
          already: already ? t("patientCard.alreadyInForm", { n: already }) : "",
        }),
      )
      return
    }
    onError(null)
    addRequest("satuan", inst.id, inst.name, qty)
    setNewInstrumentId("")
    setNewInstrumentQty("1")
  }

  // Saat paket dipilih, muat rincian isinya (jenis instrumen + jumlah per set).
  async function handleSelectCatalog(catalogId: string) {
    setNewCatalogId(catalogId)
    if (!catalogId) {
      setPaketItems([])
      return
    }
    setLoadingPaketItems(true)
    try {
      const res = await api.get(`/master/instrument-catalogs/${catalogId}`)
      setPaketItems(res.data.data.items ?? [])
    } finally {
      setLoadingPaketItems(false)
    }
  }

  function handleAddPaket() {
    const cat = catalogs.find((c) => String(c.id) === newCatalogId)
    const qty = Number(newCatalogQty)
    if (!cat || !qty || qty <= 0) return
    const avail = sterileAvailFor("paket", cat.id)
    const already = ownQty("paket", cat.id) + usedByOthers("paket", cat.id)
    if (already + qty > avail) {
      onError(
        t("patientCard.errStockPackage", {
          name: cat.name,
          avail,
          already: already ? t("patientCard.alreadyInForm", { n: already }) : "",
        }),
      )
      return
    }
    onError(null)
    const contents: PaketContent[] = paketItems.map((it) => ({
      name: it.instrument?.name ?? t("patientCard.instrumentFallback", { id: it.instrument_id }),
      perSet: it.quantity,
    }))
    addRequest("paket", cat.id, cat.name, qty, contents)
    setNewCatalogId("")
    setNewCatalogQty("1")
    setPaketItems([])
  }

  function handleRemoveLine(lineIndex: number) {
    setRequests(requests.filter((_, i) => i !== lineIndex))
  }

  // Boleh kosong saat diketik; validasi minimal 1 dilakukan saat Simpan.
  function setRequestQty(lineIndex: number, value: string) {
    onError(null)
    setRequests(requests.map((r, i) => (i === lineIndex ? { ...r, quantity: value } : r)))
  }

  // Buka/tutup rincian isi paket pada sebuah baris permintaan.
  function toggleRow(key: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Warna aksen per urutan pasien: nomor + latar kepala kartu memakai warna
  // yang sama, sehingga order satu pasien mudah dibedakan dari pasien lain
  // saat beberapa order diisi sekaligus.
  const accent = patientAccent(index)

  return (
    <Card className="overflow-hidden p-0">
      {/* Kepala kartu: nomor pasien + total unit + tombol hapus pasien */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4"
        style={{ backgroundColor: `${accent}0f` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: `${accent}26`, color: accent }}
          >
            {index + 1}
          </span>
          {/* Judul kartu = NAMA PASIEN begitu diisi (tanpa keterangan "1 record"). */}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              {showPatientFields
                ? group.patientName || t("patientCard.patientFallback", { n: index + 1 })
                : t("patientCard.requestList")}
            </p>
            {showPatientFields && group.medicalRecordNo && (
              <p className="font-mono text-xs text-gray-400">{t("patientCard.mrPrefix")} {group.medicalRecordNo}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {requests.length > 0 && <Badge variant="info">{t("patientCard.unitsBadge", { n: totalQty })}</Badge>}
          {canRemove && (
            <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
              {t("patientCard.removePatient")}
            </Button>
          )}
        </div>
      </div>

      {/* Identitas pasien — hanya untuk layanan RAWAT INAP (wajib). Layanan
          rawat jalan / IGD tidak memerlukan identitas pasien. */}
      {showPatientFields && (
        <div className="border-b border-gray-100 px-5 py-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <User className="h-3.5 w-3.5" />
            {t("patientCard.patientIdentity")}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`no-rm-${group.id}`}>
                {t("patientCard.mrLabel")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id={`no-rm-${group.id}`}
                value={group.medicalRecordNo}
                onChange={(e) => onChange({ ...group, medicalRecordNo: digitsOnly(e.target.value) })}
                // `inputMode` memunculkan papan angka di ponsel; tetap <input type="text">
                // agar nol di depan tidak hilang dan tombol spinner tidak muncul.
                inputMode="numeric"
                maxLength={MAX_RM_LENGTH}
                placeholder={t("patientCard.mrPlaceholder")}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`nama-pasien-${group.id}`}>
                {t("patientCard.patientName")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id={`nama-pasien-${group.id}`}
                value={group.patientName}
                // Nama pasien dikapitalkan saat mengetik, jadi yang TERSIMPAN memang
                // kapital — seragam dengan laporan yang menampilkannya kapital.
                onChange={(e) => onChange({ ...group, patientName: e.target.value.toUpperCase() })}
                placeholder={t("patientCard.patientNamePlaceholder")}
              />
            </div>
          </div>
        </div>
      )}

      {/* Form tambah permintaan — langkah 1 (pilih jenis) → 2 (pilih barang & jumlah) */}
      <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-4">
        {/* Pilihan mode: satuan vs paket — tab kecil polos, tanpa ikon. */}
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {(
            [
              { key: "satuan", labelKey: "common.single" },
              { key: "paket", labelKey: "common.package" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setAddMode(m.key)}
              className={
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                (addMode === m.key ? "bg-[#075489] text-white" : "text-gray-500 hover:text-gray-700")
              }
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_auto] lg:items-end">
          {addMode === "satuan" ? (
            <div className="space-y-1.5">
              <Label>{t("patientCard.instrumentType")}</Label>
              <SelectSearch
                options={instrumentOptions}
                value={newInstrumentId}
                onChange={setNewInstrumentId}
                loading={instrumentLoading}
                disabled={instrumentLoading}
                placeholder={t("patientCard.selectInstrument")}
                searchPlaceholder={t("patientCard.searchInstrument")}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("patientCard.packageCatalog")}</Label>
              <SelectSearch
                options={catalogOptions}
                value={newCatalogId}
                onChange={handleSelectCatalog}
                loading={catalogLoading}
                disabled={catalogLoading}
                placeholder={t("patientCard.selectPackage")}
                searchPlaceholder={t("patientCard.searchPackage")}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{addMode === "paket" ? t("patientCard.packageQty") : t("common.quantity")}</Label>
            <QtyStepper
              value={addMode === "paket" ? newCatalogQty : newInstrumentQty}
              onChange={addMode === "paket" ? setNewCatalogQty : setNewInstrumentQty}
            />
          </div>

          {addMode === "satuan" ? (
            <Button
              type="button"
              onClick={handleAddInstrument}
              disabled={!newInstrumentId || Number(newInstrumentQty) <= 0}
              className="shrink-0 bg-[#075489] text-white hover:bg-[#075489]/90"
            >
              <Plus className="h-4 w-4" />
              {t("common.add")}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleAddPaket}
              disabled={!newCatalogId || Number(newCatalogQty) <= 0}
              className="shrink-0 bg-[#075489] text-white hover:bg-[#075489]/90"
            >
              <Plus className="h-4 w-4" />
              {t("patientCard.addPackage")}
            </Button>
          )}
        </div>

        {/* Isi paket terpilih: instrumen apa saja di dalamnya */}
        {addMode === "paket" && newCatalogId && (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <Boxes className="h-3.5 w-3.5 text-[#075489]" />
                {t("patientCard.packageContents")}
              </span>
              {Number(newCatalogQty) > 1 && (
                <span className="text-xs text-gray-400">{t("patientCard.totalFormula", { n: Number(newCatalogQty) })}</span>
              )}
            </div>
            {loadingPaketItems ? (
              <p className="px-3 py-3 text-xs text-gray-400">{t("patientCard.loadingContents")}</p>
            ) : paketItems.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400">{t("patientCard.noBreakdownYet")}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {paketItems.map((it) => {
                  const total = it.quantity * (Number(newCatalogQty) || 1)
                  return (
                    <li key={it.instrument_id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-700">
                        {it.instrument?.name ??
                          t("patientCard.instrumentFallback", { id: it.instrument_id })}
                      </span>
                      <span className="text-xs text-gray-500">
                        {it.quantity}
                        {t("patientCard.perSet")}
                        {Number(newCatalogQty) > 1 && (
                          <span className="ml-2 font-semibold text-gray-700">= {total}</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Daftar permintaan pasien ini — bentuk kartu (bukan tabel) supaya tetap terbaca
          di layar sempit tanpa geser ke samping, dan tiap baris jelas jenisnya.
          Saat masih kosong, bagiannya tidak dirender sama sekali. */}
      {requests.length > 0 && (
        <div className="space-y-2 px-5 py-4">
          {requests.map((r, i) => {
            const rowKey = `${r.type}-${r.refId}`
            const open = expandedRows.has(rowKey)
            const isPaket = r.type === "paket"
            const hasContents = isPaket && !!r.contents && r.contents.length > 0
            const qty = Number(r.quantity) || 0
            return (
              <div
                key={rowKey}
                className={
                  "overflow-hidden rounded-xl border bg-white transition-colors " +
                  (isPaket ? "border-[#075489]/25" : "border-gray-200")
                }
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  {/* Ikon jenis: paket (set berisi banyak) vs satuan (satu instrumen) */}
                  <span
                    className={
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                      (isPaket ? "bg-[#075489]/10 text-[#075489]" : "bg-[#4ba69d]/10 text-[#4ba69d]")
                    }
                  >
                    {isPaket ? <Boxes className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs text-gray-300">{i + 1}.</span>
                      <span className="truncate text-sm font-semibold text-gray-900">{r.name}</span>
                      <Badge variant={isPaket ? "info" : "default"}>
                        {isPaket ? t("common.package") : t("common.single")}
                      </Badge>
                    </div>
                    {/* Paket: tombol buka/tutup rincian isi set */}
                    {isPaket ? (
                      <button
                        type="button"
                        onClick={() => toggleRow(rowKey)}
                        className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 hover:text-[#075489]"
                      >
                        <ChevronRight className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-90" : "")} />
                        {hasContents
                          ? t("patientCard.typesPerSet", { n: r.contents!.length })
                          : t("patientCard.noBreakdown")}
                        <span className="text-gray-300">
                          — {open ? t("patientCard.hide") : t("patientCard.viewContents")}
                        </span>
                      </button>
                    ) : (
                      <p className="mt-0.5 text-xs text-gray-400">{t("patientCard.instrumentUnits", { n: qty })}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <QtyStepper value={r.quantity} onChange={(v) => setRequestQty(i, v)} />
                    <span className="w-8 text-xs text-gray-400">{isPaket ? t("common.set") : t("common.unit")}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(i)}
                      title={t("patientCard.removeRequest")}
                      aria-label={t("patientCard.removeNamed", { name: r.name })}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Rincian isi paket: nama instrumen + total unit setelah dikali jumlah set */}
                {isPaket && open && (
                  <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2.5">
                    {hasContents ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {r.contents!.map((c) => (
                          <li
                            key={`${rowKey}-${c.name}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                          >
                            <span className="text-gray-700">{c.name}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-gray-400">
                              {c.perSet}
                              {t("patientCard.perSet")}
                            </span>
                            <span className="font-semibold text-[#075489]">= {c.perSet * qty}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-400">{t("patientCard.packageNoBreakdown")}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

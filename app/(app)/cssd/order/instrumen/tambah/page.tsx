"use client"

import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, Minus } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { fetchRooms } from "@/lib/store/slices/roomSlice"
import { invalidateOrders } from "@/lib/store/slices/orderSlice"
import api from "@/lib/axios"

// Jenis instrumen (master) — dipakai untuk permintaan satuan.
type InstrumentType = {
  id: number
  code: string
  name: string
  available_stocks_count?: number // jumlah unit berstatus `tersedia`
  available_sterile_count?: number // jumlah unit STERIL siap-order (di gudang steril)
}

// Katalog paket instrumen (Master › Katalog Instrumen, tipe `paket`).
type PaketCatalog = {
  id: number
  code: string
  name: string
  items_count?: number
  available_sets?: number // set yang bisa dipenuhi dari stok tersedia
  available_sterile_sets?: number // set yang bisa dipenuhi dari stok STERIL
}

// Rincian isi paket (jenis instrumen + jumlah per set), dari endpoint show katalog.
type PaketItem = {
  instrument_id: number
  quantity: number
  instrument?: { id: number; code: string; name: string } | null
}

type AddMode = "satuan" | "paket"

// Isi paket per baris permintaan: nama instrumen + jumlah per satu set paket.
type PaketContent = { name: string; perSet: number }

// Baris permintaan: hanya jumlah. Unit fisik di-generate saat CSSD menerima pesanan.
type RequestLine = {
  type: AddMode
  refId: number // instrument_id (satuan) / instrument_catalog_id (paket)
  name: string
  quantity: string // disimpan sebagai teks agar boleh kosong; divalidasi saat simpan
  contents?: PaketContent[] // isi paket (instrumen yang akan di-order) — untuk type paket
}

export default function TambahOrderInstrumenPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()

  const currentUserName = useAppSelector((s) => s.auth.name)
  const rooms = useAppSelector((s) => s.rooms.items)
  const roomOptions = rooms.map((r) => ({ value: String(r.id), label: r.name }))

  const [roomId, setRoomId] = useState("")
  const [borrowedBy, setBorrowedBy] = useState("")
  const [orderDate, setOrderDate] = useState("")
  const [orderTime, setOrderTime] = useState("")
  const [returnPlanDate, setReturnPlanDate] = useState("")
  const [note, setNote] = useState("")
  const [requests, setRequests] = useState<RequestLine[]>([])
  // Baris paket yang sedang dibuka (menampilkan rincian isi paket).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  // Pesan validasi yang baru ditampilkan saat klik Simpan.
  const [formError, setFormError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)

  // Mode penambahan: per jenis instrumen (satuan) atau per paket (katalog tipe paket)
  const [addMode, setAddMode] = useState<AddMode>("satuan")

  const [instruments, setInstruments] = useState<InstrumentType[]>([])
  const [instrumentLoading, setInstrumentLoading] = useState(true)
  const [catalogs, setCatalogs] = useState<PaketCatalog[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)

  // Pilihan + jumlah yang sedang diisi pada form tambah.
  const [newInstrumentId, setNewInstrumentId] = useState("")
  const [newInstrumentQty, setNewInstrumentQty] = useState("1")
  const [newCatalogId, setNewCatalogId] = useState("")
  const [newCatalogQty, setNewCatalogQty] = useState("1")
  // Isi paket terpilih (ditampilkan agar peminjam tahu instrumen apa saja di dalamnya).
  const [paketItems, setPaketItems] = useState<PaketItem[]>([])
  const [loadingPaketItems, setLoadingPaketItems] = useState(false)

  useEffect(() => {
    dispatch(fetchRooms())

    let active = true

    // Muat SEMUA jenis instrumen (lintas halaman) — endpoint paginate(20).
    ;(async () => {
      try {
        const collected: InstrumentType[] = []
        let cur = 1
        let last = 1
        do {
          const res = await api.get("/master/instruments", { params: { page: cur } })
          const p = res.data.data
          collected.push(...p.data)
          last = p.last_page
          cur += 1
        } while (cur <= last && active)
        if (active) setInstruments(collected)
      } finally {
        if (active) setInstrumentLoading(false)
      }
    })()

    // Daftar katalog paket (Master › Katalog Instrumen, tipe `paket`)
    api
      .get("/master/instrument-catalogs", { params: { type: "paket" } })
      .then((res) => {
        if (active) setCatalogs(res.data.data.data)
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })
    return () => {
      active = false
    }
  }, [dispatch])

  // Prefill nama peminjam dengan user yang login (tetap bisa diubah manual).
  useEffect(() => {
    if (currentUserName) setBorrowedBy((prev) => prev || currentUserName)
  }, [currentUserName])

  // Prefill tanggal & jam pinjam dengan waktu sekarang (tetap bisa diubah manual).
  useEffect(() => {
    const { date, time } = nowDateAndTime()
    setOrderDate((prev) => prev || date)
    setOrderTime((prev) => prev || time)
  }, [])

  // Order = peminjaman barang yang SUDAH STERIL. Hanya tampilkan instrumen yang
  // punya stok steril (sudah disterilkan & tersimpan di gudang steril).
  const instrumentOptions = instruments
    .filter((i) => (i.available_sterile_count ?? 0) > 0)
    .map((i) => ({
      value: String(i.id),
      label: `${i.code ? `${i.code} — ` : ""}${i.name} · steril ${i.available_sterile_count}`,
    }))

  // Hanya paket yang seluruh komponennya bisa dipenuhi dari stok steril.
  const catalogOptions = catalogs
    .filter((c) => (c.available_sterile_sets ?? 0) > 0)
    .map((c) => ({
      value: String(c.id),
      label: `${c.code} — ${c.name} · steril ${c.available_sterile_sets} set`,
    }))

  // Stok steril yang tersedia untuk satu instrumen (satuan) / paket (set).
  function sterileAvailFor(type: AddMode, refId: number): number {
    if (type === "satuan") return instruments.find((i) => i.id === refId)?.available_sterile_count ?? 0
    return catalogs.find((c) => c.id === refId)?.available_sterile_sets ?? 0
  }

  // Tambah / gabungkan baris permintaan. Bila jenis/paket yang sama sudah ada,
  // jumlahnya diakumulasi alih-alih membuat baris baru.
  function addRequest(
    type: AddMode,
    refId: number,
    name: string,
    quantity: number,
    contents?: PaketContent[],
  ) {
    if (quantity <= 0) return
    setRequests((prev) => {
      const idx = prev.findIndex((r) => r.type === type && r.refId === refId)
      if (idx === -1) return [...prev, { type, refId, name, quantity: String(quantity), contents }]
      const next = [...prev]
      next[idx] = { ...next[idx], quantity: String((Number(next[idx].quantity) || 0) + quantity) }
      return next
    })
  }

  function handleAddInstrument() {
    const inst = instruments.find((i) => String(i.id) === newInstrumentId)
    const qty = Number(newInstrumentQty)
    if (!inst || !qty || qty <= 0) return
    // Tidak boleh melebihi stok steril (termasuk yang sudah ada di daftar).
    const avail = inst.available_sterile_count ?? 0
    const already = Number(requests.find((r) => r.type === "satuan" && r.refId === inst.id)?.quantity) || 0
    if (already + qty > avail) {
      setFormError(`Stok steril "${inst.name}" hanya ${avail}${already ? ` (sudah ${already} di daftar)` : ""}.`)
      return
    }
    setFormError(null)
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
    // Tidak boleh melebihi jumlah set yang bisa dipenuhi dari stok steril.
    const avail = cat.available_sterile_sets ?? 0
    const already = Number(requests.find((r) => r.type === "paket" && r.refId === cat.id)?.quantity) || 0
    if (already + qty > avail) {
      setFormError(`Stok steril paket "${cat.name}" hanya cukup untuk ${avail} set${already ? ` (sudah ${already})` : ""}.`)
      return
    }
    setFormError(null)
    const contents: PaketContent[] = paketItems.map((it) => ({
      name: it.instrument?.name ?? `Instrumen #${it.instrument_id}`,
      perSet: it.quantity,
    }))
    addRequest("paket", cat.id, cat.name, qty, contents)
    setNewCatalogId("")
    setNewCatalogQty("1")
    setPaketItems([])
  }

  function handleRemove(index: number) {
    setRequests((prev) => prev.filter((_, i) => i !== index))
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

  // Boleh kosong saat diketik; validasi minimal 1 dilakukan saat Simpan.
  function setRequestQty(index: number, value: string) {
    setFormError(null)
    setRequests((prev) => prev.map((r, i) => (i === index ? { ...r, quantity: value } : r)))
  }

  const totalQty = requests.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  const canSubmit = borrowedBy.trim() && roomId && orderDate && requests.length > 0 && !saving

  async function handleSubmit() {
    if (!canSubmit) return
    // Validasi jumlah baru di sini (saat klik Simpan).
    const invalid = requests.some((r) => !/^\d+$/.test(r.quantity) || Number(r.quantity) < 1)
    if (invalid) {
      setFormError("Jumlah pada setiap permintaan harus diisi minimal 1.")
      return
    }
    // Pastikan tiap baris tidak melebihi stok steril (mis. setelah diedit manual).
    const over = requests.find((r) => Number(r.quantity) > sterileAvailFor(r.type, r.refId))
    if (over) {
      const avail = sterileAvailFor(over.type, over.refId)
      setFormError(`"${over.name}" melebihi stok steril (maks ${avail}${over.type === "paket" ? " set" : ""}).`)
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      await api.post("/master/orders", {
        room_id: Number(roomId),
        borrowed_by: borrowedBy.trim() || null,
        order_date: orderDate,
        order_time: orderTime || null,
        return_plan_date: returnPlanDate || null,
        note: note.trim() || null,
        items: requests.map((r) =>
          r.type === "paket"
            ? {
                type: "paket",
                instrument_catalog_id: r.refId,
                package_name: r.name,
                quantity: Number(r.quantity),
              }
            : {
                type: "satuan",
                instrument_id: r.refId,
                quantity: Number(r.quantity),
              },
        ),
      })
      dispatch(invalidateOrders())
      router.push("/cssd/order/instrumen")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tambah Order Instrumen"
        subtitle="Buat order peminjaman instrumen CSSD baru"
      />

      {/* Informasi Peminjaman */}
      <Card>
        <h2 className="mb-5 text-base font-semibold text-gray-900">Informasi Peminjaman</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dipinjam">
                Dipinjam Oleh <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dipinjam"
                value={borrowedBy}
                onChange={(e) => setBorrowedBy(e.target.value)}
                placeholder="Nama peminjam"
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Ruangan / Unit <span className="text-red-500">*</span>
              </Label>
              <SelectSearch
                options={roomOptions}
                value={roomId}
                onChange={setRoomId}
                placeholder="-- Pilih Ruangan --"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tgl-pinjam">
                Tanggal Pinjam <span className="text-red-500">*</span>
              </Label>
              <Input
                id="tgl-pinjam"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jam-pinjam">Jam Pinjam</Label>
              <Input
                id="jam-pinjam"
                type="time"
                value={orderTime}
                onChange={(e) => setOrderTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tgl-kembali">Rencana Kembali</Label>
              <Input
                id="tgl-kembali"
                type="date"
                value={returnPlanDate}
                onChange={(e) => setReturnPlanDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Catatan</Label>
            <Textarea
              id="note"
              rows={2}
              placeholder="Opsional..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Daftar Permintaan */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Daftar Permintaan</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Hanya barang yang sudah steril (tersimpan di gudang steril) yang bisa diorder.
            </p>
          </div>
          {requests.length > 0 && <Badge variant="info">{totalQty} unit</Badge>}
        </div>

        {/* Form tambah permintaan */}
        <div className="bg-gray-50 px-5 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Tambah Permintaan</p>

          {/* Pilihan mode: satuan vs paket */}
          <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {([
              { key: "satuan", label: "Satuan" },
              { key: "paket", label: "Paket" },
            ] as const).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setAddMode(m.key)}
                className={
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                  (addMode === m.key ? "bg-[#4ba69d] text-white" : "text-gray-500 hover:text-gray-700")
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_auto] lg:items-end">
            {addMode === "satuan" ? (
              <div className="space-y-1.5">
                <Label>Jenis Instrumen</Label>
                <SelectSearch
                  options={instrumentOptions}
                  value={newInstrumentId}
                  onChange={setNewInstrumentId}
                  disabled={instrumentLoading}
                  placeholder={instrumentLoading ? "Memuat instrumen..." : "-- Pilih instrumen --"}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Paket Instrumen (katalog)</Label>
                <SelectSearch
                  options={catalogOptions}
                  value={newCatalogId}
                  onChange={handleSelectCatalog}
                  disabled={catalogLoading}
                  placeholder={catalogLoading ? "Memuat paket..." : "-- Pilih paket --"}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{addMode === "paket" ? "Jumlah Paket" : "Jumlah"}</Label>
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
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white shrink-0"
              >
                + Tambah
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleAddPaket}
                disabled={!newCatalogId || Number(newCatalogQty) <= 0}
                className="bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white shrink-0"
              >
                + Tambah Paket
              </Button>
            )}
          </div>

          {/* Isi paket terpilih: instrumen apa saja di dalamnya */}
          {addMode === "paket" && newCatalogId && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-xs font-semibold text-gray-500">Isi Paket</span>
                {Number(newCatalogQty) > 1 && (
                  <span className="text-xs text-gray-400">total = isi × {Number(newCatalogQty)} paket</span>
                )}
              </div>
              {loadingPaketItems ? (
                <p className="px-3 py-3 text-xs text-gray-400">Memuat isi paket...</p>
              ) : paketItems.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">Paket ini belum punya rincian instrumen.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {paketItems.map((it) => {
                    const total = it.quantity * (Number(newCatalogQty) || 1)
                    return (
                      <li
                        key={it.instrument_id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span className="text-gray-700">
                          {it.instrument?.name ?? `Instrumen #${it.instrument_id}`}
                        </span>
                        <span className="text-xs text-gray-500">
                          {it.quantity} / paket
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

        {/* Tabel permintaan */}
        <div className="border-t border-gray-100">
          {requests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-10">
                      No
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-28">
                      Jenis
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Nama
                    </th>
                    <th className="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-28">
                      Jumlah
                    </th>
                    <th className="py-3 pl-3 pr-4 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {requests.map((r, i) => {
                    const rowKey = `${r.type}-${r.refId}`
                    const open = expandedRows.has(rowKey)
                    const hasContents = r.type === "paket" && !!r.contents && r.contents.length > 0
                    return (
                    <Fragment key={rowKey}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 pl-4 pr-3 align-top text-gray-400">{i + 1}</td>
                        <td className="py-3 px-3 align-top">
                          <Badge variant={r.type === "paket" ? "info" : "default"}>
                            {r.type === "paket" ? "Paket" : "Satuan"}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          {/* Paket: klik untuk buka/tutup rincian isi paket */}
                          {r.type === "paket" ? (
                            <button
                              type="button"
                              onClick={() => toggleRow(rowKey)}
                              className="flex items-center gap-1.5 text-left font-medium text-gray-900 hover:text-[#075489]"
                            >
                              <ChevronRight
                                className={
                                  "h-4 w-4 text-gray-400 transition-transform " + (open ? "rotate-90" : "")
                                }
                              />
                              {r.name}
                              {hasContents && (
                                <span className="text-xs font-normal text-gray-400">
                                  ({r.contents!.length} jenis)
                                </span>
                              )}
                            </button>
                          ) : (
                            <span className="font-medium text-gray-900">{r.name}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 align-top">
                          <QtyStepper value={r.quantity} onChange={(v) => setRequestQty(i, v)} />
                        </td>
                        <td className="py-3 pl-3 pr-4 align-top">
                          <button
                            onClick={() => handleRemove(i)}
                            className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>

                      {/* Rincian isi paket — baris penuh, satu instrumen per baris (tampil saat dibuka) */}
                      {r.type === "paket" && open && hasContents &&
                        r.contents!.map((c) => (
                          <tr key={`${rowKey}-${c.name}`} className="bg-gray-50/60">
                            <td className="py-2.5 pl-4 pr-3" />
                            <td className="py-2.5 px-3" />
                            <td className="py-2.5 px-3">
                              <span className="flex items-center gap-1.5 pl-5 text-gray-700">
                                <span className="text-gray-300">└</span>
                                {c.name}
                                <span className="text-xs text-gray-400">— {c.perSet}/paket</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3 align-middle">
                              <span className="font-semibold text-gray-700">
                                {c.perSet * (Number(r.quantity) || 0)}
                              </span>
                              <span className="ml-1 text-xs text-gray-400">unit</span>
                            </td>
                            <td className="py-2.5 pl-3 pr-4" />
                          </tr>
                        ))}

                      {/* Paket dibuka tetapi tanpa rincian instrumen */}
                      {r.type === "paket" && open && !hasContents && (
                        <tr className="bg-gray-50/60">
                          <td className="py-2.5 pl-4 pr-3" />
                          <td className="py-2.5 px-3" />
                          <td className="py-2.5 px-3 text-xs text-gray-400" colSpan={3}>
                            Paket tanpa rincian instrumen.
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">Belum ada permintaan ditambahkan.</div>
          )}
        </div>
      </Card>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {formError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 sm:mr-auto">{formError}</p>
        )}
        <Button variant="outline" type="button" onClick={() => router.push("/cssd/order/instrumen")}>
          Batal
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-[#075489] hover:bg-[#075489]/90 text-white"
        >
          {saving ? "Menyimpan..." : "Simpan Order"}
        </Button>
      </div>
    </div>
  )
}

// Tanggal & jam sekarang (zona waktu lokal) untuk prefill input date & time.
function nowDateAndTime(): { date: string; time: string } {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

// Stepper jumlah: tombol −/+ dan input teks yang boleh dikosongkan (hanya digit).
function QtyStepper({
  value,
  onChange,
  min = 1,
}: {
  value: string
  onChange: (value: string) => void
  min?: number
}) {
  const num = Number(value)
  const current = Number.isFinite(num) && value !== "" ? num : min
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(min, current - 1)))}
        className="px-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
        aria-label="Kurangi"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (v === "" || /^\d+$/.test(v)) onChange(v)
        }}
        className="w-14 border-x border-gray-300 py-1.5 text-center text-sm outline-none focus:ring-2 focus:ring-[#4ba69d]/30"
      />
      <button
        type="button"
        onClick={() => onChange(String((value === "" ? min - 1 : current) + 1))}
        className="px-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
        aria-label="Tambah"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Badge } from "@/components/atoms/Badge"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { fetchRoomOptions } from "@/lib/store/slices/roomSlice"
import {
  fetchDistributions,
  invalidateDistributions,
  setDistributionSearch,
  type Distribution,
} from "@/lib/store/slices/distributionSlice"
import api from "@/lib/axios"

type BmhpOption = { id: number; code: string; name: string; unit: string; stock_qty: number }

// Item BMHP yang dipilih di form sebelum disubmit.
type FormItem = {
  bmhp_id: number
  bmhpName: string
  bmhpUnit: string
  quantity: number
  note: string
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// nilai default untuk <input type="datetime-local"> = sekarang (waktu lokal)
function nowLocalInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function DistribusiPage() {
  const dispatch = useAppDispatch()
  const rooms = useAppSelector((s) => s.rooms.options)
  const { items: distributions, search, loading, loaded, dirty } = useAppSelector((s) => s.distributions)

  // Data referensi untuk form
  const [bmhps, setBmhps] = useState<BmhpOption[]>([])

  // Form
  const [roomId, setRoomId] = useState("")
  const [sender, setSender] = useState("")
  const [receiver, setReceiver] = useState("")
  const [distributedAt, setDistributedAt] = useState(nowLocalInput())
  const [note, setNote] = useState("")
  const [formItems, setFormItems] = useState<FormItem[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Penambahan item
  const [newBmhpId, setNewBmhpId] = useState("")
  const [newQty, setNewQty] = useState(1)

  // List search + detail
  const [searchInput, setSearchInput] = useState(search)
  const [detail, setDetail] = useState<Distribution | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    dispatch(fetchRoomOptions())
    let active = true
    ;(async () => {
      try {
        const bm = await api.get("/master/bmhps")
        if (!active) return
        setBmhps(bm.data.data.data)
      } catch {
        if (!active) return
        setFormError("Failed to load BMHP reference data.")
      }
    })()
    return () => {
      active = false
    }
  }, [dispatch])

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchDistributions())
  }, [loaded, dirty, dispatch])

  const roomOptions = rooms.map((r) => ({ value: String(r.id), label: r.name }))
  const bmhpOptions = bmhps.map((b) => ({
    value: String(b.id),
    label: `${b.name} (${b.stock_qty} ${b.unit} left)`,
  }))

  function handleAddBmhp() {
    if (!newBmhpId || newQty < 1) return
    const bmhp = bmhps.find((b) => String(b.id) === newBmhpId)
    if (!bmhp) return
    setFormItems((prev) => [
      ...prev,
      {
        bmhp_id: bmhp.id,
        bmhpName: bmhp.name,
        bmhpUnit: bmhp.unit,
        quantity: newQty,
        note: "",
      },
    ])
    setNewBmhpId("")
    setNewQty(1)
  }

  function setItemNote(index: number, value: string) {
    setFormItems((prev) => prev.map((it, i) => (i === index ? { ...it, note: value } : it)))
  }

  function handleRemove(index: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== index))
  }

  function resetForm() {
    setRoomId("")
    setSender("")
    setReceiver("")
    setDistributedAt(nowLocalInput())
    setNote("")
    setFormItems([])
    setFormError(null)
  }

  const canSubmit = roomId && sender.trim() && receiver.trim() && formItems.length > 0 && !saving

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    setFormError(null)
    try {
      await api.post("/master/distributions", {
        room_id: Number(roomId),
        sender: sender.trim(),
        receiver: receiver.trim(),
        distributed_at: distributedAt || null,
        note: note.trim() || null,
        items: formItems.map((it) => ({
          bmhp_id: it.bmhp_id,
          quantity: it.quantity,
          note: it.note || null,
        })),
      })
      resetForm()
      dispatch(invalidateDistributions())
      // Muat ulang referensi BMHP (stok berubah ketersediaannya)
      const bm = await api.get("/master/bmhps")
      setBmhps(bm.data.data.data)
    } catch (e) {
      const res = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
      const firstError = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined
      setFormError(firstError ?? res?.data?.message ?? "Failed to save the distribution.")
    } finally {
      setSaving(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setDistributionSearch(searchInput))
  }

  async function openDetail(d: Distribution) {
    setDetail(d)
    setDetailLoading(true)
    try {
      const res = await api.get(`/master/distributions/${d.id}`)
      setDetail(res.data.data)
    } finally {
      setDetailLoading(false)
    }
  }

  const visibleDistributions = useMemo(() => distributions, [distributions])

  return (
    <div className="space-y-6">
      <PageHeader
        title="BMHP Distribution"
        subtitle="Handover of medical consumables (BMHP) from CSSD to units/rooms"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* Kiri: Daftar distribusi */}
        <Card className="p-0">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="mb-2 text-sm font-semibold text-gray-700">BMHP Distribution List</p>
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search code / room / recipient..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </form>
          </div>
          <div className="max-h-[640px] divide-y divide-gray-100 overflow-y-auto">
            {loading ? (
              <p className="py-10 text-center text-sm text-gray-400">Loading data...</p>
            ) : visibleDistributions.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No distribution yet.</p>
            ) : (
              visibleDistributions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDetail(d)}
                  className="block w-full px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-[#075489]">{d.code}</span>
                    {d.status === "dibatalkan" ? (
                      <Badge variant="danger">Canceled</Badge>
                    ) : (
                      <Badge variant="success">Distributed</Badge>
                    )}
                  </div>
                  <dl className="space-y-0.5 text-xs text-gray-600">
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Sender</dt>
                      <dd>: {d.sender ?? "—"}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Unit</dt>
                      <dd>: {d.room?.name ?? "—"}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Recipient</dt>
                      <dd>: {d.receiver ?? "—"}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="w-16 shrink-0 text-gray-400">Date</dt>
                      <dd>: {formatDateTime(d.distributed_at)}</dd>
                    </div>
                  </dl>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Kanan: Form distribusi baru */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-gray-900">BMHP Distribution Data</h2>

          <div className="space-y-5">
            {/* Unit */}
            <div className="space-y-1.5">
              <Label>
                Unit <span className="text-red-500">*</span>
              </Label>
              <SelectSearch
                options={roomOptions}
                value={roomId}
                onChange={setRoomId}
                placeholder="-- Select unit/room --"
                searchPlaceholder="Search unit/room..."
                loadingText="Loading options..."
                emptyText="Not found."
              />
            </div>

            {/* Pemilihan BMHP */}
            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <p className="text-sm font-semibold text-gray-700">BMHP Selection</p>
              </div>

              <div className="space-y-3 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <SelectSearch
                      options={bmhpOptions}
                      value={newBmhpId}
                      onChange={setNewBmhpId}
                      placeholder="-- Select BMHP --"
                      searchPlaceholder="Search BMHP..."
                      loadingText="Loading options..."
                      emptyText="Not found."
                    />
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="w-24"
                    placeholder="Qty"
                  />
                  <Button
                    type="button"
                    onClick={handleAddBmhp}
                    disabled={!newBmhpId}
                    className="shrink-0 bg-[#4ba69d] text-white hover:bg-[#4ba69d]/90"
                  >
                    Add
                  </Button>
                </div>

                {/* Tabel item terpilih */}
                {formItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-6 text-gray-400">
                    <p className="text-sm">No BMHP selected yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[440px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2 w-24">Quantity</th>
                          <th className="px-3 py-2">Note</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {formItems.map((it, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <span className="font-medium text-gray-900">{it.bmhpName}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {it.quantity} <span className="text-xs text-gray-400">{it.bmhpUnit}</span>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={it.note}
                                onChange={(e) => setItemNote(idx, e.target.value)}
                                placeholder="Note"
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => handleRemove(idx)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Informasi Penerima */}
            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <p className="text-sm font-semibold text-gray-700">Recipient Information</p>
              </div>
              <div className="grid grid-cols-1 gap-4 px-4 py-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    Sender <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={sender}
                    onChange={(e) => setSender(e.target.value)}
                    placeholder="Sender name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Distribution Date</Label>
                  <Input
                    type="datetime-local"
                    value={distributedAt}
                    onChange={(e) => setDistributedAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Recipient <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={receiver}
                    onChange={(e) => setReceiver(e.target.value)}
                    placeholder="Recipient name"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Note</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
                </div>
              </div>
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{formError}</div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Reset
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-[#075489] text-white hover:bg-[#075489]/90"
              >
                {saving ? "Saving..." : "Distribute"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Detail distribusi */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Distribution — ${detail.code}` : "Distribution"}
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setDetail(null)}>
            <X className="h-4 w-4" /> Close
          </Button>
        }
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading data...</div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Info label="Unit" value={detail.room?.name} />
              <Info label="Status" value={detail.status === "dibatalkan" ? "Canceled" : "Distributed"} />
              <Info label="Sender" value={detail.sender} />
              <Info label="Recipient" value={detail.receiver} />
              <Info label="Date" value={formatDateTime(detail.distributed_at)} />
              <Info label="Note" value={detail.note} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 w-24">Quantity</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {detail.items?.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2">{it.bmhp?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {it.quantity} <span className="text-xs text-gray-400">{it.bmhp?.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">{it.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-800">{value ? value : <span className="text-gray-400">—</span>}</p>
    </div>
  )
}

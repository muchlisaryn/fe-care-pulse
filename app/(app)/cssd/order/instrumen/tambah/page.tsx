"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { FormSectionHeader } from "@/components/molecules/FormSectionHeader"
import { PatientRequestCard } from "@/components/molecules/PatientRequestCard"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { fetchRoomOptions } from "@/lib/store/slices/roomSlice"
import { invalidateOrders } from "@/lib/store/slices/orderSlice"
import { useUserOptions } from "@/lib/useUserOptions"
import { apiErrorMessage } from "@/lib/apiError"
import { setOrderFlash } from "@/lib/orderFlash"
import {
  emptyPatientGroup,
  totalQtyOf,
  type AddMode,
  type InstrumentType,
  type PaketCatalog,
  type PatientGroup,
} from "@/lib/orderRequest"
import api from "@/lib/axios"

// Label layanan ruangan (untuk tampilan opsi ruangan).
const LAYANAN_LABEL: Record<string, string> = {
  igd: "IGD",
  rawat_jalan: "Rawat Jalan",
  rawat_inap: "Rawat Inap",
}

export default function TambahOrderInstrumenPage() {
  const router = useRouter()
  const dispatch = useAppDispatch()

  const rooms = useAppSelector((s) => s.rooms.options)
  // Pilihan ruangan di-cache di Redux: `optionsLoaded` baru true setelah
  // fetchRoomOptions selesai, dan tetap true saat halaman dibuka lagi (tidak
  // memuat ulang) — jadi dropdown hanya terkunci pada pemuatan pertama.
  const roomLoading = useAppSelector((s) => !s.rooms.optionsLoaded)
  const roomOptions = rooms.map((r) => ({
    value: String(r.id),
    label: r.layanan ? `${r.name} · ${LAYANAN_LABEL[r.layanan]}` : r.name,
  }))

  // Identitas sesi login — dipakai sebagai nilai awal "Dipinjam Oleh".
  const authUsername = useAppSelector((s) => s.auth.username)
  const authName = useAppSelector((s) => s.auth.name)

  // Data peminjaman dipakai BERSAMA oleh seluruh pasien pada form ini.
  const [roomId, setRoomId] = useState("")
  // Berisi USERNAME peminjam terpilih, bukan nama — lihat useUserOptions. Kosong
  // berarti "belum dipilih", dan nilai efektifnya jatuh ke user yang sedang login
  // (lihat `borrowerUsername`). Diturunkan saat render, bukan lewat useEffect, agar
  // tidak memicu render berantai saat sesi login selesai dimuat.
  const [borrowedBy, setBorrowedBy] = useState("")
  const { options: userOptions, loading: userLoading, nameOf } = useUserOptions()
  const [orderDate, setOrderDate] = useState("")
  const [orderTime, setOrderTime] = useState("")
  const [returnPlanDate, setReturnPlanDate] = useState("")
  const [note, setNote] = useState("")

  // Satu grup = satu pasien = satu record order. Selalu ada minimal satu grup.
  const [patients, setPatients] = useState<PatientGroup[]>(() => [emptyPatientGroup()])

  // Pesan validasi yang baru ditampilkan saat klik Simpan.
  const [formError, setFormError] = useState<string | null>(null)
  // Kegagalan simpan dari server ditampilkan sebagai modal agar tidak terlewat —
  // pesannya tetap ikut tercetak di bawah tombol setelah modalnya ditutup.
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [instruments, setInstruments] = useState<InstrumentType[]>([])
  const [instrumentLoading, setInstrumentLoading] = useState(true)
  const [catalogs, setCatalogs] = useState<PaketCatalog[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)

  useEffect(() => {
    dispatch(fetchRoomOptions())

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

  // Prefill tanggal & jam pinjam dengan waktu sekarang (tetap bisa diubah manual).
  // Sengaja lewat efek, BUKAN nilai awal useState: jam dihitung dari waktu perangkat,
  // dan bila dirender ikut HTML dari server nilainya bisa berbeda dengan klien
  // sehingga hidrasinya tak cocok.
  useEffect(() => {
    const { date, time } = nowDateAndTime()
    /* eslint-disable react-hooks/set-state-in-effect */
    setOrderDate((prev) => prev || date)
    setOrderTime((prev) => prev || time)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // Peminjam efektif: pilihan petugas, atau user yang sedang login sebagai default.
  const borrowerUsername = borrowedBy || authUsername || ""

  // Yang disimpan server pada `borrowed_by` adalah NAMA, bukan username. Saat daftar
  // user belum selesai dimuat, nama diambil dari sesi login agar nilai default tidak
  // hilang bila petugas langsung menyimpan.
  const borrowerName = useMemo(() => {
    const mapped = nameOf(borrowerUsername)
    if (mapped && mapped !== borrowerUsername) return mapped
    if (borrowerUsername && borrowerUsername === authUsername) return authName ?? borrowerUsername
    return borrowerUsername || null
    // nameOf identitasnya berubah tiap render (bukan useCallback); yang menentukan
    // hasilnya adalah userOptions, jadi itu yang dijadikan penanda perubahan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userOptions, borrowerUsername, authUsername, authName])

  // Stok steril yang tersedia untuk satu instrumen (satuan) / paket (set).
  function sterileAvailFor(type: AddMode, refId: number): number {
    if (type === "satuan") return instruments.find((i) => i.id === refId)?.available_sterile_count ?? 0
    return catalogs.find((c) => c.id === refId)?.available_sterile_sets ?? 0
  }

  /** Jumlah instrumen/paket yang sudah dipesan pasien SELAIN `groupId` di form ini. */
  function usedByOthers(groupId: string, type: AddMode, refId: number): number {
    return patients
      .filter((p) => p.id !== groupId)
      .reduce(
        (sum, p) =>
          sum + (Number(p.requests.find((r) => r.type === type && r.refId === refId)?.quantity) || 0),
        0,
      )
  }

  function updatePatient(next: PatientGroup) {
    setPatients((prev) => prev.map((p) => (p.id === next.id ? next : p)))
  }

  function addPatient() {
    setFormError(null)
    setPatients((prev) => [...prev, emptyPatientGroup()])
  }

  function removePatient(id: string) {
    setPatients((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.id !== id)))
  }

  // Ruangan terpilih + layanannya. Identitas pasien hanya WAJIB untuk RAWAT INAP;
  // rawat jalan / IGD → identitas pasien disembunyikan & tidak wajib. Order untuk
  // beberapa pasien sekaligus juga hanya masuk akal di rawat inap — di layanan lain
  // formnya tetap satu grup permintaan.
  const selectedRoom = rooms.find((r) => String(r.id) === roomId)
  const needPatient = selectedRoom?.layanan === "rawat_inap"

  const totalQty = patients.reduce((sum, p) => sum + totalQtyOf(p.requests), 0)
  const filledPatients = patients.filter((p) => p.requests.length > 0)

  // Ruangan DIKUNCI begitu ada identitas pasien yang sudah diisi: mengganti ruangan
  // bisa mengubah layanannya (rawat inap ↔ bukan), sehingga identitas yang sudah
  // diketik jadi tidak berlaku dan simpanan gagal divalidasi. Kosongkan identitasnya
  // dulu bila ruangannya memang perlu diganti.
  const roomLocked = patients.some((p) => p.medicalRecordNo.trim() !== "" || p.patientName.trim() !== "")

  // Wajib: peminjam, ruangan, tanggal + jam pinjam, minimal 1 permintaan pada TIAP
  // pasien, dan (khusus rawat inap) identitas tiap pasien.
  const canSubmit =
    borrowerUsername.trim() &&
    roomId &&
    orderDate &&
    orderTime &&
    patients.length > 0 &&
    patients.every(
      (p) =>
        p.requests.length > 0 &&
        (!needPatient || (p.medicalRecordNo.trim() && p.patientName.trim())),
    ) &&
    !saving

  async function handleSubmit() {
    if (!canSubmit) {
      setFormError(
        needPatient
          ? "Lengkapi identitas & minimal satu permintaan untuk setiap pasien, serta field wajib (bertanda *)."
          : "Lengkapi semua field wajib (bertanda *) dan minimal satu permintaan.",
      )
      return
    }
    // Validasi jumlah baru di sini (saat klik Simpan).
    const invalid = patients.some((p) =>
      p.requests.some((r) => !/^\d+$/.test(r.quantity) || Number(r.quantity) < 1),
    )
    if (invalid) {
      setFormError("Jumlah pada setiap permintaan harus diisi minimal 1.")
      return
    }
    // Satu pasien = satu order: No. RM tidak boleh dobel antar grup.
    if (needPatient) {
      const rms = patients.map((p) => p.medicalRecordNo.trim())
      if (new Set(rms).size !== rms.length) {
        setFormError("No. Rekam Medis tidak boleh sama antar pasien — gabungkan permintaannya jadi satu pasien.")
        return
      }
    }
    // Total lintas pasien tidak boleh melebihi stok steril (mis. setelah diedit manual).
    const totals = new Map<string, { type: AddMode; refId: number; name: string; qty: number }>()
    for (const p of patients) {
      for (const r of p.requests) {
        const key = `${r.type}-${r.refId}`
        const cur = totals.get(key) ?? { type: r.type, refId: r.refId, name: r.name, qty: 0 }
        cur.qty += Number(r.quantity) || 0
        totals.set(key, cur)
      }
    }
    const over = [...totals.values()].find((t) => t.qty > sterileAvailFor(t.type, t.refId))
    if (over) {
      const avail = sterileAvailFor(over.type, over.refId)
      setFormError(
        `"${over.name}" melebihi stok steril (maks ${avail}${over.type === "paket" ? " set" : ""}, diminta ${over.qty}).`,
      )
      return
    }

    setFormError(null)
    setSaving(true)
    try {
      // Satu pengiriman untuk seluruh pasien — server membuat satu record order per
      // pasien dalam SATU transaksi, jadi tidak ada order yang tersimpan sebagian
      // bila salah satunya gagal.
      await api.post("/master/orders/bulk", {
        room_id: Number(roomId),
        borrowed_by: borrowerName,
        order_date: orderDate,
        order_time: orderTime || null,
        return_plan_date: returnPlanDate || null,
        note: note.trim() || null,
        patients: patients.map((p) => ({
          // Identitas pasien hanya dikirim untuk layanan rawat inap.
          medical_record_no: needPatient ? p.medicalRecordNo.trim() || null : null,
          patient_name: needPatient ? p.patientName.trim() || null : null,
          items: p.requests.map((r) =>
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
        })),
      })
      dispatch(invalidateOrders())
      // Modal "berhasil" muncul di halaman daftar setelah redirect.
      setOrderFlash(
        patients.length > 1
          ? `${patients.length} order instrumen berhasil dibuat.`
          : "Order instrumen berhasil dibuat.",
      )
      router.push("/cssd/order/instrumen")
    } catch (err) {
      // Server memvalidasi ulang stok steril saat menyimpan (422) — stok bisa
      // sudah diambil order lain sejak halaman ini dimuat. Tampilkan alasannya
      // agar peminjam tahu harus memuat ulang, bukan gagal diam-diam.
      const message = apiErrorMessage(err, "Gagal menyimpan order.")
      setFormError(message)
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tambah Order Instrumen"
        subtitle="Buat order peminjaman instrumen CSSD — bisa beberapa pasien sekaligus"
      />

      {/* Data peminjaman — SATU kotak berisi peminjam, jadwal & catatan. Ketiganya
          dipakai bersama oleh seluruh pasien pada form ini, jadi tidak dipecah
          menjadi beberapa kartu. */}
      <Card className="space-y-4">
        <FormSectionHeader
          title="Data Peminjaman"
          description="Peminjam, ruangan, jadwal & catatan akan tercatat pada order ini"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Dipinjam Oleh <span className="text-red-500">*</span>
            </Label>
            <SelectSearch
              options={userOptions}
              value={borrowerUsername}
              onChange={setBorrowedBy}
              loading={userLoading}
              disabled={userLoading}
              placeholder="-- Pilih Peminjam --"
              searchPlaceholder="Cari nama peminjam..."
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
              loading={roomLoading}
              // Terkunci setelah identitas pasien diisi — lihat `roomLocked`.
              disabled={roomLoading || roomLocked}
              placeholder="-- Pilih Ruangan --"
            />
          </div>
        </div>

        {/* Jadwal peminjaman */}
        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3">
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
            <Label htmlFor="jam-pinjam">
              Jam Pinjam <span className="text-red-500">*</span>
            </Label>
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

        {/* Catatan (opsional) */}
        <div className="space-y-1.5 border-t border-gray-100 pt-4">
          <Label htmlFor="note">Catatan</Label>
          <Textarea
            id="note"
            rows={2}
            placeholder="Keterangan tambahan (opsional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Card>

      {/* Pasien & permintaannya — tiap kartu menjadi satu record order. Baru muncul
          setelah ruangan dipilih: layanan ruangan yang menentukan perlu-tidaknya
          identitas pasien, jadi mengisi permintaan sebelum itu hanya menimbulkan
          form yang berubah bentuk di tengah pengisian. */}
      {roomId && (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Permintaan</h2>
          <p className="text-xs text-gray-500">
            {filledPatients.length} order · {totalQty} unit
          </p>
        </div>

        {patients.map((p, i) => (
          <PatientRequestCard
            key={p.id}
            index={i}
            group={p}
            onChange={updatePatient}
            onRemove={() => removePatient(p.id)}
            canRemove={patients.length > 1}
            showPatientFields={needPatient}
            instruments={instruments}
            catalogs={catalogs}
            instrumentLoading={instrumentLoading}
            catalogLoading={catalogLoading}
            sterileAvailFor={sterileAvailFor}
            usedByOthers={(type, refId) => usedByOthers(p.id, type, refId)}
            onError={setFormError}
          />
        ))}

        {/* Pasien tambahan hanya untuk RAWAT INAP: pengelompokannya memang per
            pasien (No. RM + nama), yang tidak dipakai layanan lain. */}
        {needPatient && (
          <Button
            type="button"
            onClick={addPatient}
            // Hijau teal merek (#4ba69d) — aksi menambah, dibedakan dari tombol
            // simpan yang memakai biru tua.
            className="w-full justify-center bg-[#4ba69d] text-white hover:bg-[#4ba69d]/90"
          >
            <UserPlus className="h-4 w-4" />
            Tambah Pasien
          </Button>
        )}
      </div>
      )}

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
          className="bg-[#075489] text-white hover:bg-[#075489]/90"
        >
          {saving ? "Menyimpan..." : patients.length > 1 ? `Simpan ${patients.length} Order` : "Simpan Order"}
        </Button>
      </div>

      {/* Gagal menyimpan order (mis. stok steril keburu diambil order lain) */}
      <ResultDialog
        open={saveError !== null}
        onClose={() => setSaveError(null)}
        variant="error"
        title="Order Gagal Disimpan"
        description={saveError}
      />
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

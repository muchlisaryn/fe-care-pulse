"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Check, Plus, FileText, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Textarea } from "@/components/atoms/Textarea"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { useAppSelector } from "@/lib/store/hooks"
import api from "@/lib/axios"

type Category = { id: number; urutan: number; label: string }

type Point = {
  id: number
  categori_id: number
  parent_id: number | null
  label: string
  pengisi: string
  hari_wajib: number[] | null
  urutan: number
}

type AsesmenPointValue = {
  point_id: number
  checked_hari: number[] | null
  keterangan: string | null
}

type Asesmen = {
  id: number
  template_id: number
  no_rm: string
  nama_pasien: string
  jenis_kelamin: "L" | "P"
  tanggal_lahir: string
  diagnosa_masuk: string
  penyakit_utama: string | null
  penyakit_penyerta: string | null
  komplikasi: string | null
  tindakan: string | null
  bb: string | null
  tb: string | null
  tanggal_jam_masuk: string
  tanggal_jam_keluar: string | null
  lama_rawat: number | null
  rencana_rawat: string | null
  ruang_id: number | null
  rujukan: boolean
  template?: {
    id: number
    maksimal_hari: number
    icd10?: { code: string; display: string } | null
  } | null
  ruang?: { id: number; name: string } | null
  points?: AsesmenPointValue[]
  verifikasi_dokter_by: string | null
  verifikasi_dokter_at: string | null
  verifikasi_perawat_by: string | null
  verifikasi_perawat_at: string | null
  verifikasi_pelaksana_by: string | null
  verifikasi_pelaksana_at: string | null
}

type VerifRole = "dokter" | "perawat" | "pelaksana"

type Varian = {
  id: number
  asesmen_id: number
  tanggal_waktu: string
  varian: string
  alasan: string | null
  paraf: string
}

const PENGISI_LABEL: Record<string, string> = {
  dokter: "Dokter",
  perawat: "Perawat",
  farmasi: "Farmasi",
  ahli_gizi: "Ahli Gizi",
  penunjang: "Penunjang",
}

// Warna baris per pengisi agar mudah dikenali siapa yang mengisi.
const PENGISI_ROW_BG: Record<string, string> = {
  dokter: "bg-blue-50",
  perawat: "bg-emerald-50",
  farmasi: "bg-purple-50",
  ahli_gizi: "bg-amber-50",
  penunjang: "bg-rose-50",
}
const pengisiRowBg = (pengisi: string) => PENGISI_ROW_BG[pengisi] ?? ""
const jkLabel = (v: string) => (v === "L" ? "Laki-laki" : v === "P" ? "Perempuan" : v)
const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : "—")
const fmtDateTime = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—")

type PointValue = { checked: number[]; keterangan: string }
type SaveStatus = "saving" | "saved" | "error"

export default function IsiAsesmenPage() {
  const params = useParams()
  const router = useRouter()
  const asesmenId = Number(params.id)

  const [asesmen, setAsesmen] = useState<Asesmen | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [values, setValues] = useState<Record<number, PointValue>>({})
  const [status, setStatus] = useState<Record<number, SaveStatus>>({})
  const [loading, setLoading] = useState(true)

  // Pencatatan varian (penyimpangan) clinical pathway.
  const currentUsername = useAppSelector((s) => s.auth.username)
  const [varians, setVarians] = useState<Varian[]>([])
  const [varianModal, setVarianModal] = useState<"tambah" | "edit" | null>(null)
  const [varianEditId, setVarianEditId] = useState<number | null>(null)
  const [varianForm, setVarianForm] = useState({ tanggal_waktu: "", varian: "", alasan: "" })
  const [varianSaving, setVarianSaving] = useState(false)
  const [varianError, setVarianError] = useState<string | null>(null)
  const [varianDeleteTarget, setVarianDeleteTarget] = useState<Varian | null>(null)
  const [varianDeletingId, setVarianDeletingId] = useState<number | null>(null)

  // Verifikasi clinical pathway (dokter PJ / perawat PJ / pelaksana).
  const [verifying, setVerifying] = useState<VerifRole | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  // Preview PDF (di-fetch sebagai blob agar header Bearer ikut terkirim).
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  // Timer debounce per-poin untuk auto-save keterangan.
  const ketTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const aRes = await api.get(`/clinical-pathway/asesmen/${asesmenId}`)
        const a = aRes.data.data as Asesmen
        const templateId = a.template_id

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

        const initial: Record<number, PointValue> = {}
        for (const v of a.points ?? []) {
          initial[v.point_id] = {
            checked: v.checked_hari ?? [],
            keterangan: v.keterangan ?? "",
          }
        }

        setAsesmen(a)
        setCategories(cats.sort((x, y) => x.urutan - y.urutan))
        setPoints(ptRes.data.data as Point[])
        setValues(initial)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [asesmenId])

  const maxHari = asesmen?.template?.maksimal_hari ?? 0
  const days = Array.from({ length: maxHari }, (_, i) => i + 1)

  const dokterVerified = !!asesmen?.verifikasi_dokter_at
  const perawatVerified = !!asesmen?.verifikasi_perawat_at
  const pelaksanaVerified = !!asesmen?.verifikasi_pelaksana_at

  // Poin terkunci (tak bisa diedit) bila peran pengisinya sudah verifikasi,
  // atau bila pelaksana sudah verifikasi (clinical pathway selesai → kunci semua).
  function isPointLocked(pengisi: string) {
    if (pelaksanaVerified) return true
    if (pengisi === "dokter" && dokterVerified) return true
    if (pengisi === "perawat" && perawatVerified) return true
    return false
  }

  const valueOf = (pointId: number): PointValue =>
    values[pointId] ?? { checked: [], keterangan: "" }

  const save = useCallback(
    async (pointId: number, next: PointValue) => {
      setStatus((s) => ({ ...s, [pointId]: "saving" }))
      try {
        await api.put(`/clinical-pathway/asesmen/${asesmenId}/points/${pointId}`, {
          checked_hari: next.checked,
          keterangan: next.keterangan || null,
        })
        setStatus((s) => ({ ...s, [pointId]: "saved" }))
      } catch {
        setStatus((s) => ({ ...s, [pointId]: "error" }))
      }
    },
    [asesmenId],
  )

  async function handleVerify(role: VerifRole, action: "verify" | "batal") {
    setVerifying(role)
    setVerifyError(null)
    try {
      const res = await api.post(`/clinical-pathway/asesmen/${asesmenId}/verify`, { role, action })
      const updated = res.data.data as Asesmen
      setAsesmen((prev) => (prev ? { ...prev, ...updated } : updated))
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setVerifyError(x.response?.data?.message ?? "Gagal memproses verifikasi.")
    } finally {
      setVerifying(null)
    }
  }

  // Buka preview PDF: ambil sebagai blob (lewat axios agar token Bearer terkirim),
  // lalu tampilkan di iframe via object URL.
  async function openPdf() {
    setPdfOpen(true)
    setPdfError(null)
    setPdfLoading(true)
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    try {
      const res = await api.get(`/clinical-pathway/asesmen/${asesmenId}/pdf`, {
        responseType: "blob",
      })
      setPdfUrl(URL.createObjectURL(res.data as Blob))
    } catch {
      setPdfError("Gagal memuat PDF.")
    } finally {
      setPdfLoading(false)
    }
  }

  function closePdf() {
    setPdfOpen(false)
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
  }

  function downloadPdf() {
    if (!pdfUrl) return
    const a = document.createElement("a")
    a.href = pdfUrl
    a.download = `asesmen-clinical-pathway-${asesmenId}.pdf`
    a.click()
  }

  // Bebaskan object URL saat komponen di-unmount.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  // Muat ulang daftar varian milik asesmen ini.
  const reloadVarian = useCallback(async () => {
    const res = await api.get(`/clinical-pathway/asesmen/${asesmenId}/varian`)
    setVarians(res.data.data as Varian[])
  }, [asesmenId])

  useEffect(() => {
    reloadVarian()
  }, [reloadVarian])

  function openTambahVarian() {
    setVarianEditId(null)
    setVarianForm({ tanggal_waktu: "", varian: "", alasan: "" })
    setVarianError(null)
    setVarianModal("tambah")
  }

  function openEditVarian(row: Varian) {
    setVarianEditId(row.id)
    setVarianForm({
      tanggal_waktu: (row.tanggal_waktu ?? "").slice(0, 16),
      varian: row.varian,
      alasan: row.alasan ?? "",
    })
    setVarianError(null)
    setVarianModal("edit")
  }

  async function handleSaveVarian() {
    if (!varianForm.tanggal_waktu) {
      setVarianError("Tanggal & waktu wajib diisi.")
      return
    }
    if (!varianForm.varian.trim()) {
      setVarianError("Varian yang terjadi wajib diisi.")
      return
    }
    setVarianSaving(true)
    setVarianError(null)
    const payload = {
      tanggal_waktu: varianForm.tanggal_waktu,
      varian: varianForm.varian.trim(),
      alasan: varianForm.alasan.trim() || null,
    }
    try {
      if (varianModal === "tambah") {
        await api.post(`/clinical-pathway/asesmen/${asesmenId}/varian`, payload)
      } else if (varianEditId !== null) {
        await api.put(`/clinical-pathway/varian/${varianEditId}`, payload)
      }
      await reloadVarian()
      setVarianModal(null)
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setVarianError(x.response?.data?.message ?? "Gagal menyimpan catatan varian.")
    } finally {
      setVarianSaving(false)
    }
  }

  async function handleDeleteVarian() {
    if (!varianDeleteTarget) return
    setVarianDeletingId(varianDeleteTarget.id)
    try {
      await api.delete(`/clinical-pathway/varian/${varianDeleteTarget.id}`)
      await reloadVarian()
      setVarianDeleteTarget(null)
    } finally {
      setVarianDeletingId(null)
    }
  }

  const varianColumns: Column<Varian>[] = [
    {
      header: "Tanggal & Waktu",
      cell: (row) => <span className="text-gray-700">{fmtDateTime(row.tanggal_waktu)}</span>,
      className: "w-44",
    },
    {
      header: "Varian yang Terjadi",
      cell: (row) => <span className="whitespace-pre-wrap text-gray-900">{row.varian}</span>,
    },
    {
      header: "Alasan Varian Terjadi",
      cell: (row) =>
        row.alasan ? (
          <span className="whitespace-pre-wrap text-gray-700">{row.alasan}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      header: "Paraf",
      cell: (row) => <span className="font-medium text-gray-700">{row.paraf}</span>,
      className: "w-32",
    },
  ]

  // Cek kunci berdasarkan pointId (cari peran pengisinya).
  function isPointIdLocked(pointId: number) {
    const p = points.find((x) => x.id === pointId)
    return p ? isPointLocked(p.pengisi) : false
  }

  function toggleDay(pointId: number, day: number) {
    if (isPointIdLocked(pointId)) return
    const current = valueOf(pointId)
    const has = current.checked.includes(day)
    const checked = has
      ? current.checked.filter((d) => d !== day)
      : [...current.checked, day].sort((a, b) => a - b)
    const next = { ...current, checked }
    setValues((v) => ({ ...v, [pointId]: next }))
    save(pointId, next) // ceklis → simpan langsung
  }

  function changeKeterangan(pointId: number, keterangan: string) {
    if (isPointIdLocked(pointId)) return
    const next = { ...valueOf(pointId), keterangan }
    setValues((v) => ({ ...v, [pointId]: next }))
    setStatus((s) => ({ ...s, [pointId]: "saving" }))
    // Debounce simpan keterangan.
    clearTimeout(ketTimers.current[pointId])
    ketTimers.current[pointId] = setTimeout(() => save(pointId, next), 600)
  }

  const childrenOf = (parentId: number) =>
    points.filter((p) => p.parent_id === parentId).sort((a, b) => a.urutan - b.urutan || a.id - b.id)
  const topPointsOf = (catId: number) =>
    points
      .filter((p) => p.categori_id === catId && p.parent_id === null)
      .sort((a, b) => a.urutan - b.urutan || a.id - b.id)

  function statusText(pointId: number) {
    const s = status[pointId]
    if (s === "saving") return <span className="text-xs text-gray-400">Menyimpan...</span>
    if (s === "saved")
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#4ba69d]">
          <Check className="h-3 w-3" /> Tersimpan
        </span>
      )
    if (s === "error") return <span className="text-xs text-red-500">Gagal menyimpan</span>
    return null
  }

  // Satu baris poin — layout menyamping: label | ceklis hari | keterangan.
  function renderRow(point: Point, number: string, depth: number) {
    const val = valueOf(point.id)
    const wajib = point.hari_wajib ?? []
    const hasChildren = childrenOf(point.id).length > 0
    const locked = isPointLocked(point.pengisi)

    // Poin yang punya sub-poin jadi kelompok (header) — tanpa ceklis & keterangan.
    if (hasChildren) {
      return (
        <div key={point.id} className={"px-3 py-1.5 " + pengisiRowBg(point.pengisi)}>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ paddingLeft: depth > 0 ? depth * 24 : undefined }}
          >
            <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
              {number}
            </span>
            <span className="font-semibold text-gray-900">{point.label}</span>
            <Badge variant="info">{PENGISI_LABEL[point.pengisi] ?? point.pengisi}</Badge>
          </div>
        </div>
      )
    }

    return (
      <div
        key={point.id}
        className={
          "flex flex-col gap-1 px-3 py-1.5 lg:flex-row lg:items-start lg:gap-4 " +
          pengisiRowBg(point.pengisi)
        }
      >
        {/* Label */}
        <div
          className="min-w-0 lg:w-72 lg:shrink-0"
          style={{ paddingLeft: depth > 0 ? depth * 24 : undefined }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
              {number}
            </span>
            <span className="font-medium text-gray-900">{point.label}</span>
            <Badge variant="info">{PENGISI_LABEL[point.pengisi] ?? point.pengisi}</Badge>
          </div>
        </div>

        {/* Ceklis per hari (hari wajib disorot). */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1 lg:hidden">Hari:</span>
            {days.map((d) => {
              const on = val.checked.includes(d)
              const isWajib = wajib.includes(d)
              // Sudah diceklis → hijau solid (beda dari yang belum).
              // Wajib belum diceklis → hijau muda. Opsional belum → netral.
              const cls = on
                ? "border-[#4ba69d] bg-[#4ba69d] text-white hover:bg-[#4ba69d]/90"
                : isWajib
                  ? "border-[#4ba69d] bg-[#4ba69d]/15 text-[#4ba69d] hover:bg-[#4ba69d]/25"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              return (
                <button
                  key={d}
                  type="button"
                  disabled={locked}
                  title={isWajib ? `Hari ${d} (wajib diisi)` : `Hari ${d}`}
                  onClick={() => toggleDay(point.id, d)}
                  className={
                    "flex h-8 min-w-[32px] items-center justify-center rounded-md border px-1.5 text-sm font-medium transition-colors " +
                    cls +
                    (locked ? " cursor-not-allowed opacity-60" : "")
                  }
                >
                  {on ? <Check className="h-4 w-4" /> : d}
                </button>
              )
            })}
          </div>
        </div>

        {/* Keterangan (auto-save). */}
        <div className="lg:w-56 lg:shrink-0">
          <Input
            placeholder="Keterangan..."
            value={val.keterangan}
            disabled={locked}
            onChange={(e) => changeKeterangan(point.id, e.target.value)}
          />
        </div>
        {/* Notifikasi tersimpan — di samping kolom keterangan. */}
        <div className="flex min-h-[20px] items-center lg:w-24 lg:shrink-0 lg:self-center">
          {statusText(point.id)}
        </div>
      </div>
    )
  }

  // Ratakan satu poin level-atas beserta sub-poinnya jadi daftar baris,
  // supaya satu section (poin + sub-poin) tampil dalam satu kotak.
  function rowsForTop(top: Point, baseNumber: string) {
    const out: React.ReactNode[] = []
    const walk = (point: Point, number: string, depth: number) => {
      out.push(renderRow(point, number, depth))
      childrenOf(point.id).forEach((sub, i) => walk(sub, `${number}.${i + 1}`, depth + 1))
    }
    walk(top, baseNumber, 0)
    return out
  }

  // Satu kartu verifikasi peran (dokter / perawat / pelaksana).
  function verifItem(
    role: VerifRole,
    title: string,
    by: string | null,
    at: string | null,
    opts?: { disabled?: boolean; disabledHint?: string },
  ) {
    const verified = !!at
    const busy = verifying === role
    return (
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {verified ? (
          <>
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#4ba69d]">
              <Check className="h-3.5 w-3.5" /> Terverifikasi
            </p>
            <p className="text-xs text-gray-500">
              oleh {by} · {fmtDateTime(at)}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => handleVerify(role, "batal")}
              className="mt-3"
            >
              {busy ? "Memproses..." : "Batal Verifikasi"}
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-400">Belum diverifikasi</p>
            <Button
              size="sm"
              disabled={busy || opts?.disabled}
              onClick={() => handleVerify(role, "verify")}
              className="mt-3 bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {busy ? "Memproses..." : "Verifikasi"}
            </Button>
            {opts?.disabled && opts.disabledHint && (
              <p className="mt-2 text-xs text-gray-400">{opts.disabledHint}</p>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="xs"
            className="mt-1"
            onClick={() => router.push("/clinical-pathway/asesmen")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader
            title="Isi Formulir Asesmen"
            subtitle={
              asesmen?.template?.icd10
                ? `${asesmen.template.icd10.code} — ${asesmen.template.icd10.display} · maksimal ${maxHari} hari`
                : "Ceklis poin per hari sesuai formulir"
            }
          />
        </div>
        {asesmen && (
          <Button
            onClick={openPdf}
            className="shrink-0 bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            <FileText className="h-4 w-4" /> Preview PDF
          </Button>
        )}
      </div>

      {loading ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">Memuat data...</p>
        </Card>
      ) : !asesmen ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">Asesmen tidak ditemukan.</p>
        </Card>
      ) : (
        <>
          {/* Ringkasan data pasien */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Data Pasien</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <Field label="No RM" value={asesmen.no_rm} />
              <Field label="Nama Pasien" value={asesmen.nama_pasien} />
              <Field label="Jenis Kelamin" value={jkLabel(asesmen.jenis_kelamin)} />
              <Field label="Tanggal Lahir" value={fmtDate(asesmen.tanggal_lahir)} />
              <Field label="Diagnosa Masuk" value={asesmen.diagnosa_masuk} />
              <Field label="Penyakit Utama" value={asesmen.penyakit_utama} />
              <Field label="Penyakit Penyerta" value={asesmen.penyakit_penyerta} />
              <Field label="Komplikasi" value={asesmen.komplikasi} />
              <Field label="Tindakan" value={asesmen.tindakan} />
              <Field label="BB / TB" value={`${asesmen.bb ?? "—"} kg / ${asesmen.tb ?? "—"} cm`} />
              <Field label="Masuk" value={fmtDateTime(asesmen.tanggal_jam_masuk)} />
              <Field label="Keluar" value={fmtDateTime(asesmen.tanggal_jam_keluar)} />
              <Field
                label="Lama Rawat"
                value={asesmen.lama_rawat != null ? `${asesmen.lama_rawat} hari` : null}
              />
              <Field label="Rencana Rawat" value={asesmen.rencana_rawat} />
              <Field label="Ruang Rawat" value={asesmen.ruang?.name ?? null} />
              <Field label="Rujukan" value={asesmen.rujukan ? "Ya" : "Tidak"} />
            </dl>
          </Card>

          {/* Formulir ceklis */}
          {categories.length === 0 ? (
            <Card>
              <p className="py-16 text-center text-sm text-gray-400">
                Formulir ini belum punya kategori/poin.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Keterangan warna/simbol ceklis. */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                <span className="font-medium text-gray-600">Legenda:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-[#4ba69d] bg-[#4ba69d]/15 text-[11px] font-medium text-[#4ba69d]">
                    1
                  </span>
                  Wajib diisi
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-[#4ba69d] bg-[#4ba69d] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  Sudah diceklis
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 text-[11px] font-medium text-gray-600">
                    1
                  </span>
                  Belum diceklis
                </span>
              </div>

              {/* Keterangan warna baris per pengisi (diisi oleh). */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                <span className="font-medium text-gray-600">Diisi oleh:</span>
                {Object.entries(PENGISI_ROW_BG).map(([key, row]) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <span className={"h-4 w-4 rounded border border-gray-200 " + row} />
                    {PENGISI_LABEL[key] ?? key}
                  </span>
                ))}
              </div>

              {categories.map((cat) => {
                const tops = topPointsOf(cat.id)
                if (tops.length === 0) return null
                return (
                  <Card key={cat.id}>
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                      <span className="flex h-7 min-w-[28px] items-center justify-center rounded-md bg-[#075489] px-2 text-sm font-semibold text-white">
                        {cat.urutan}
                      </span>
                      <span className="text-base font-semibold text-gray-900">{cat.label}</span>
                    </div>
                    <div className="space-y-3 pt-3">
                      {tops.map((p, i) => (
                        <div
                          key={p.id}
                          className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200"
                        >
                          {rowsForTop(p, `${cat.urutan}.${i + 1}`)}
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Catatan / disclaimer clinical pathway. */}
          <Card>
            <p className="mb-2 text-sm font-semibold text-gray-900">Keterangan :</p>
            <ul className="space-y-2 text-sm leading-relaxed text-gray-600">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-sm bg-gray-400" />
                <span>
                  Clinical pathway ini didesain untuk membantu proses perawatan dan pengobatan
                  dengan menyediakan kerangka kerja yang diharapkan. Bukan untuk menggantikan
                  penilaian tim perawat/dokter. Jika pasien tidak sesuai dengan kerangka umum
                  clinical pathway, maka dikeluarkan dari clinical pathway.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-sm bg-gray-400" />
                <span>
                  Petugas yang mengisi formulir ini adalah Manajer Pelayanan Pasien (MPP) atau
                  Perawat Penanggung jawab Asuhan (PPJA) yang ditunjuk, menandatangani formulir
                  sebagai pelaksana verifikasi.
                </span>
              </li>
            </ul>
          </Card>

          {/* Pencatatan varian (penyimpangan) clinical pathway. */}
          <Card className="p-0">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Pencatatan Varian</h3>
                <p className="text-xs text-gray-400">
                  Catat penyimpangan (varian) yang terjadi selama perawatan.
                </p>
              </div>
              <Button
                onClick={openTambahVarian}
                size="sm"
                className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0"
              >
                <Plus className="h-4 w-4" /> Tambah Varian
              </Button>
            </div>
            <div className="border-t border-gray-100">
              <DataTable
                columns={varianColumns}
                data={varians}
                onEdit={openEditVarian}
                onDelete={(row) => setVarianDeleteTarget(row)}
                isRowLoading={(row) => varianDeletingId === row.id}
                emptyMessage="Belum ada catatan varian."
              />
            </div>
          </Card>

          {/* Verifikasi clinical pathway (dokter PJ / perawat PJ / pelaksana). */}
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Verifikasi Clinical Pathway</h3>
              {pelaksanaVerified && (
                <Badge variant="success">Selesai</Badge>
              )}
            </div>
            {pelaksanaVerified && (
              <p className="mb-3 rounded-lg bg-[#4ba69d]/10 px-3 py-2 text-sm text-[#075489]">
                Clinical pathway telah selesai diverifikasi pelaksana. Seluruh pengisian dikunci.
              </p>
            )}
            {verifyError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{verifyError}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {verifItem(
                "dokter",
                "Dokter Penanggung Jawab",
                asesmen.verifikasi_dokter_by,
                asesmen.verifikasi_dokter_at,
              )}
              {verifItem(
                "perawat",
                "Perawat Penanggung Jawab",
                asesmen.verifikasi_perawat_by,
                asesmen.verifikasi_perawat_at,
              )}
              {verifItem(
                "pelaksana",
                "Pelaksana Verifikasi",
                asesmen.verifikasi_pelaksana_by,
                asesmen.verifikasi_pelaksana_at,
                {
                  disabled: !(dokterVerified && perawatVerified),
                  disabledHint: "Menunggu verifikasi dokter & perawat penanggung jawab.",
                },
              )}
            </div>
          </Card>

          {/* Modal tambah/edit varian. */}
          <Modal
            open={varianModal !== null}
            onClose={() => setVarianModal(null)}
            title={varianModal === "tambah" ? "Tambah Varian" : "Edit Varian"}
            size="md"
            footer={
              <>
                <Button variant="outline" onClick={() => setVarianModal(null)}>
                  Batal
                </Button>
                <Button
                  onClick={handleSaveVarian}
                  disabled={varianSaving}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  {varianSaving ? "Menyimpan..." : "Simpan"}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              {varianError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{varianError}</p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="varian-tgl">
                  Tanggal &amp; Waktu <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="varian-tgl"
                  type="datetime-local"
                  value={varianForm.tanggal_waktu}
                  onChange={(e) =>
                    setVarianForm((f) => ({ ...f, tanggal_waktu: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="varian-isi">
                  Varian yang Terjadi <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="varian-isi"
                  rows={3}
                  value={varianForm.varian}
                  onChange={(e) => setVarianForm((f) => ({ ...f, varian: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="varian-alasan">Alasan Varian Terjadi</Label>
                <Textarea
                  id="varian-alasan"
                  rows={3}
                  value={varianForm.alasan}
                  onChange={(e) => setVarianForm((f) => ({ ...f, alasan: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Paraf</Label>
                <Input value={currentUsername ?? ""} disabled />
                <p className="text-xs text-gray-400">
                  Otomatis terisi username Anda yang sedang login.
                </p>
              </div>
            </div>
          </Modal>

          <ConfirmDialog
            open={varianDeleteTarget !== null}
            onClose={() => setVarianDeleteTarget(null)}
            onConfirm={handleDeleteVarian}
            loading={varianDeletingId !== null}
            title="Hapus Varian"
            description="Catatan varian ini akan dihapus. Lanjutkan?"
          />

          {/* Preview PDF asesmen */}
          <Modal
            open={pdfOpen}
            onClose={closePdf}
            title="Preview PDF — Clinical Pathway"
            size="lg"
            footer={
              <>
                <Button variant="outline" onClick={closePdf}>
                  Tutup
                </Button>
                <Button
                  onClick={downloadPdf}
                  disabled={!pdfUrl}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              </>
            }
          >
            {pdfLoading ? (
              <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Memuat PDF...
              </div>
            ) : pdfError ? (
              <div className="flex h-[70vh] items-center justify-center text-sm text-red-600">
                {pdfError}
              </div>
            ) : pdfUrl ? (
              <iframe src={pdfUrl} title="Preview PDF" className="h-[70vh] w-full rounded-lg border" />
            ) : null}
          </Modal>
        </>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-900">
        {value ? value : <span className="text-gray-400 text-xs">—</span>}
      </dd>
    </div>
  )
}

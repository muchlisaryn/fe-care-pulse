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
import { useT } from "@/lib/i18n"

type Category = { id: number; sort_order: number; label: string }

type Point = {
  id: number
  category_id: number
  parent_id: number | null
  label: string
  filled_by: string
  required_days: number[] | null
  sort_order: number
}

type AsesmenPointValue = {
  point_id: number
  checked_days: number[] | null
  note: string | null
}

type Asesmen = {
  id: number
  template_id: number
  medical_record_no: string
  patient_name: string
  gender: "L" | "P"
  birth_date: string
  admission_diagnosis: string
  primary_disease: string | null
  comorbidity: string | null
  complication: string | null
  procedure: string | null
  weight: string | null
  height: string | null
  admitted_at: string
  discharged_at: string | null
  length_of_stay: number | null
  care_plan: string | null
  room_id: number | null
  is_referral: boolean
  template?: {
    id: number
    max_days: number
    icd10?: { code: string; display: string } | null
  } | null
  room?: { id: number; name: string } | null
  points?: AsesmenPointValue[]
  doctor_verified_by: string | null
  doctor_verified_at: string | null
  nurse_verified_by: string | null
  nurse_verified_at: string | null
  executor_verified_by: string | null
  executor_verified_at: string | null
}

type VerifRole = "dokter" | "perawat" | "pelaksana"

type Varian = {
  id: number
  assessment_id: number
  occurred_at: string
  variance: string
  reason: string | null
  initials: string
}

const PENGISI_LABEL_KEY: Record<string, string> = {
  dokter: "cpForm.roleDoctor",
  perawat: "cpForm.roleNurse",
  farmasi: "cpForm.rolePharmacy",
  ahli_gizi: "cpForm.roleNutritionist",
  penunjang: "cpForm.roleSupport",
}

/** Nama peran pengisi dalam bahasa aktif; nilai tak dikenal tampil apa adanya. */
function pengisiLabel(v: string, t: (key: string) => string): string {
  const key = PENGISI_LABEL_KEY[v]
  return key ? t(key) : v
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
const jkLabel = (v: string, t: (key: string) => string) =>
  v === "L" ? t("assessment.male") : v === "P" ? t("assessment.female") : v
const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : "—")
const fmtDateTime = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—")

type PointValue = { checked: number[]; note: string }
type SaveStatus = "saving" | "saved" | "error"

export default function IsiAsesmenPage() {
  const params = useParams()
  const router = useRouter()
  const asesmenId = Number(params.id)
  const t = useT()

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
  const [varianForm, setVarianForm] = useState({ occurred_at: "", variance: "", reason: "" })
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

  // Muat detail asesmen, kategori, poin, dan nilai ceklis awal.
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
            checked: v.checked_days ?? [],
            note: v.note ?? "",
          }
        }

        setAsesmen(a)
        setCategories(cats.sort((x, y) => x.sort_order - y.sort_order))
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

  const maxHari = asesmen?.template?.max_days ?? 0
  const days = Array.from({ length: maxHari }, (_, i) => i + 1)

  const dokterVerified = !!asesmen?.doctor_verified_at
  const perawatVerified = !!asesmen?.nurse_verified_at
  const pelaksanaVerified = !!asesmen?.executor_verified_at

  // Poin terkunci (tak bisa diedit) bila peran pengisinya sudah verifikasi,
  // atau bila pelaksana sudah verifikasi (clinical pathway selesai → kunci semua).
  function isPointLocked(pengisi: string) {
    if (pelaksanaVerified) return true
    if (pengisi === "dokter" && dokterVerified) return true
    if (pengisi === "perawat" && perawatVerified) return true
    return false
  }

  // Ambil nilai ceklis satu poin (default kosong bila belum diisi).
  const valueOf = (pointId: number): PointValue =>
    values[pointId] ?? { checked: [], note: "" }

  // Auto-save nilai ceklis satu poin ke backend.
  const save = useCallback(
    async (pointId: number, next: PointValue) => {
      setStatus((s) => ({ ...s, [pointId]: "saving" }))
      try {
        await api.put(`/clinical-pathway/asesmen/${asesmenId}/points/${pointId}`, {
          checked_days: next.checked,
          note: next.note || null,
        })
        setStatus((s) => ({ ...s, [pointId]: "saved" }))
      } catch {
        setStatus((s) => ({ ...s, [pointId]: "error" }))
      }
    },
    [asesmenId],
  )

  // Verifikasi / batal verifikasi clinical pathway untuk satu peran.
  async function handleVerify(role: VerifRole, action: "verify" | "batal") {
    setVerifying(role)
    setVerifyError(null)
    try {
      const res = await api.post(`/clinical-pathway/asesmen/${asesmenId}/verify`, { role, action })
      const updated = res.data.data as Asesmen
      setAsesmen((prev) => (prev ? { ...prev, ...updated } : updated))
    } catch (err) {
      const x = err as { response?: { data?: { message?: string } } }
      setVerifyError(x.response?.data?.message ?? t("assessmentFill.errVerify"))
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
      setPdfError(t("assessmentFill.errPdf"))
    } finally {
      setPdfLoading(false)
    }
  }

  // Tutup preview PDF & bebaskan object URL.
  function closePdf() {
    setPdfOpen(false)
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
  }

  // Unduh file PDF yang sedang dipratinjau.
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

  // Buka modal tambah varian (reset form).
  function openTambahVarian() {
    setVarianEditId(null)
    setVarianForm({ occurred_at: "", variance: "", reason: "" })
    setVarianError(null)
    setVarianModal("tambah")
  }

  // Buka modal edit varian — isi form dari baris terpilih.
  function openEditVarian(row: Varian) {
    setVarianEditId(row.id)
    setVarianForm({
      occurred_at: (row.occurred_at ?? "").slice(0, 16),
      variance: row.variance,
      reason: row.reason ?? "",
    })
    setVarianError(null)
    setVarianModal("edit")
  }

  // Validasi lalu simpan (create/update) catatan varian.
  async function handleSaveVarian() {
    if (!varianForm.occurred_at) {
      setVarianError(t("assessmentFill.errOccurredAt"))
      return
    }
    if (!varianForm.variance.trim()) {
      setVarianError(t("assessmentFill.errVariance"))
      return
    }
    setVarianSaving(true)
    setVarianError(null)
    const payload = {
      occurred_at: varianForm.occurred_at,
      variance: varianForm.variance.trim(),
      reason: varianForm.reason.trim() || null,
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
      setVarianError(x.response?.data?.message ?? t("assessmentFill.errSaveVariance"))
    } finally {
      setVarianSaving(false)
    }
  }

  // Hapus catatan varian terpilih.
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
      header: t("assessmentFill.colOccurredAt"),
      cell: (row) => <span className="text-gray-700">{fmtDateTime(row.occurred_at)}</span>,
      className: "w-44",
    },
    {
      header: t("assessmentFill.colVariance"),
      cell: (row) => <span className="whitespace-pre-wrap text-gray-900">{row.variance}</span>,
    },
    {
      header: t("assessmentFill.colReason"),
      cell: (row) =>
        row.reason ? (
          <span className="whitespace-pre-wrap text-gray-700">{row.reason}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      header: t("assessmentFill.colInitials"),
      cell: (row) => <span className="font-medium text-gray-700">{row.initials}</span>,
      className: "w-32",
    },
  ]

  // Cek kunci berdasarkan pointId (cari peran pengisinya).
  function isPointIdLocked(pointId: number) {
    const p = points.find((x) => x.id === pointId)
    return p ? isPointLocked(p.filled_by) : false
  }

  // Toggle ceklis satu hari pada satu poin (lalu auto-save).
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

  // Ubah keterangan poin (auto-save dengan debounce).
  function changeKeterangan(pointId: number, note: string) {
    if (isPointIdLocked(pointId)) return
    const next = { ...valueOf(pointId), note }
    setValues((v) => ({ ...v, [pointId]: next }))
    setStatus((s) => ({ ...s, [pointId]: "saving" }))
    // Debounce simpan keterangan.
    clearTimeout(ketTimers.current[pointId])
    ketTimers.current[pointId] = setTimeout(() => save(pointId, next), 600)
  }

  // Anak langsung dari sebuah poin, terurut.
  const childrenOf = (parentId: number) =>
    points.filter((p) => p.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  // Poin level atas dalam satu kategori.
  const topPointsOf = (catId: number) =>
    points
      .filter((p) => p.category_id === catId && p.parent_id === null)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

  // Teks status auto-save per poin.
  function statusText(pointId: number) {
    const s = status[pointId]
    if (s === "saving") return <span className="text-xs text-gray-400">{t("common.saving")}</span>
    if (s === "saved")
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#4ba69d]">
          <Check className="h-3 w-3" /> {t("assessmentFill.saved")}
        </span>
      )
    if (s === "error") return <span className="text-xs text-red-500">{t("assessmentFill.saveFailed")}</span>
    return null
  }

  // Satu baris poin — layout menyamping: label | ceklis hari | keterangan.
  function renderRow(point: Point, number: string, depth: number) {
    const val = valueOf(point.id)
    const wajib = point.required_days ?? []
    const hasChildren = childrenOf(point.id).length > 0
    const locked = isPointLocked(point.filled_by)

    // Poin yang punya sub-poin jadi kelompok (header) — tanpa ceklis & keterangan.
    if (hasChildren) {
      return (
        <div key={point.id} className={"px-3 py-1.5 " + pengisiRowBg(point.filled_by)}>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ paddingLeft: depth > 0 ? depth * 24 : undefined }}
          >
            <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-0.5 rounded">
              {number}
            </span>
            <span className="font-semibold text-gray-900">{point.label}</span>
            <Badge variant="info">{pengisiLabel(point.filled_by, t)}</Badge>
          </div>
        </div>
      )
    }

    return (
      <div
        key={point.id}
        className={
          "flex flex-col gap-1 px-3 py-1.5 lg:flex-row lg:items-start lg:gap-4 " +
          pengisiRowBg(point.filled_by)
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
            <Badge variant="info">{pengisiLabel(point.filled_by, t)}</Badge>
          </div>
        </div>

        {/* Ceklis per hari (hari wajib disorot). */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1 lg:hidden">{t("assessmentFill.dayLabel")}</span>
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
                  title={
                    isWajib
                      ? t("assessmentFill.dayRequiredTitle", { n: d })
                      : t("assessmentFill.dayTitle", { n: d })
                  }
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
            placeholder={t("assessmentFill.notePlaceholder")}
            value={val.note}
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
              <Check className="h-3.5 w-3.5" /> {t("assessmentFill.verified")}
            </p>
            <p className="text-xs text-gray-500">
              {t("assessmentFill.verifiedBy", { name: by ?? "—", at: fmtDateTime(at) })}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => handleVerify(role, "batal")}
              className="mt-3"
            >
              {busy ? t("assessmentFill.processing") : t("assessmentFill.cancelVerification")}
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-400">{t("assessmentFill.notVerified")}</p>
            <Button
              size="sm"
              disabled={busy || opts?.disabled}
              onClick={() => handleVerify(role, "verify")}
              className="mt-3 bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {busy ? t("assessmentFill.processing") : t("assessmentFill.verify")}
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
            title={t("assessmentFill.title")}
            subtitle={
              asesmen?.template?.icd10
                ? t("assessmentFill.subtitleWithIcd", {
                    code: asesmen.template.icd10.code,
                    display: asesmen.template.icd10.display,
                    days: maxHari,
                  })
                : t("assessmentFill.subtitleFallback")
            }
          />
        </div>
        {asesmen && (
          <Button
            onClick={openPdf}
            className="shrink-0 bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            <FileText className="h-4 w-4" /> {t("assessmentFill.previewPdf")}
          </Button>
        )}
      </div>

      {loading ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</p>
        </Card>
      ) : !asesmen ? (
        <Card>
          <p className="py-16 text-center text-sm text-gray-400">{t("assessmentFill.notFound")}</p>
        </Card>
      ) : (
        <>
          {/* Ringkasan data pasien */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">{t("assessmentFill.patientData")}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <Field label={t("assessment.colMrNo")} value={asesmen.medical_record_no} />
              <Field label={t("assessment.colPatient")} value={asesmen.patient_name} />
              <Field label={t("assessment.gender")} value={jkLabel(asesmen.gender, t)} />
              <Field label={t("assessment.birthDate")} value={fmtDate(asesmen.birth_date)} />
              <Field label={t("assessment.colAdmissionDx")} value={asesmen.admission_diagnosis} />
              <Field label={t("assessment.primaryDisease")} value={asesmen.primary_disease} />
              <Field label={t("assessment.comorbidity")} value={asesmen.comorbidity} />
              <Field label={t("assessment.complication")} value={asesmen.complication} />
              <Field label={t("assessment.procedure")} value={asesmen.procedure} />
              <Field
                label={t("assessmentFill.weightHeight")}
                value={`${asesmen.weight ?? "—"} kg / ${asesmen.height ?? "—"} cm`}
              />
              <Field label={t("assessmentFill.admitted")} value={fmtDateTime(asesmen.admitted_at)} />
              <Field label={t("assessmentFill.discharged")} value={fmtDateTime(asesmen.discharged_at)} />
              <Field
                label={t("assessmentFill.lengthOfStay")}
                value={
                  asesmen.length_of_stay != null
                    ? t("assessmentFill.daysSuffix", { n: asesmen.length_of_stay })
                    : null
                }
              />
              <Field label={t("assessment.carePlan")} value={asesmen.care_plan} />
              <Field label={t("assessment.ward")} value={asesmen.room?.name ?? null} />
              <Field
                label={t("assessment.referral")}
                value={asesmen.is_referral ? t("common.yes") : t("common.no")}
              />
            </dl>
          </Card>

          {/* Formulir ceklis */}
          {categories.length === 0 ? (
            <Card>
              <p className="py-16 text-center text-sm text-gray-400">
                {t("assessmentFill.noCategories")}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Keterangan warna/simbol ceklis. */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                <span className="font-medium text-gray-600">{t("assessmentFill.legend")}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-[#4ba69d] bg-[#4ba69d]/15 text-[11px] font-medium text-[#4ba69d]">
                    1
                  </span>
                  {t("assessmentFill.legendRequired")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-[#4ba69d] bg-[#4ba69d] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  {t("assessmentFill.legendChecked")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-gray-300 text-[11px] font-medium text-gray-600">
                    1
                  </span>
                  {t("assessmentFill.legendUnchecked")}
                </span>
              </div>

              {/* Keterangan warna baris per pengisi (diisi oleh). */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                <span className="font-medium text-gray-600">{t("assessmentFill.filledByLegend")}</span>
                {Object.entries(PENGISI_ROW_BG).map(([key, row]) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <span className={"h-4 w-4 rounded border border-gray-200 " + row} />
                    {pengisiLabel(key, t)}
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
                        {cat.sort_order}
                      </span>
                      <span className="text-base font-semibold text-gray-900">{cat.label}</span>
                    </div>
                    <div className="space-y-3 pt-3">
                      {tops.map((p, i) => (
                        <div
                          key={p.id}
                          className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200"
                        >
                          {rowsForTop(p, `${cat.sort_order}.${i + 1}`)}
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
            <p className="mb-2 text-sm font-semibold text-gray-900">{t("assessmentFill.notesTitle")}</p>
            <ul className="space-y-2 text-sm leading-relaxed text-gray-600">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-sm bg-gray-400" />
                <span>{t("assessmentFill.note1")}</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-sm bg-gray-400" />
                <span>{t("assessmentFill.note2")}</span>
              </li>
            </ul>
          </Card>

          {/* Pencatatan varian (penyimpangan) clinical pathway. */}
          <Card className="p-0">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t("assessmentFill.varianceTitle")}</h3>
                <p className="text-xs text-gray-400">
                  {t("assessmentFill.varianceSubtitle")}
                </p>
              </div>
              <Button
                onClick={openTambahVarian}
                size="sm"
                className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0"
              >
                <Plus className="h-4 w-4" /> {t("assessmentFill.addVariance")}
              </Button>
            </div>
            <div className="border-t border-gray-100">
              <DataTable
                columns={varianColumns}
                data={varians}
                onEdit={openEditVarian}
                onDelete={(row) => setVarianDeleteTarget(row)}
                isRowLoading={(row) => varianDeletingId === row.id}
                emptyMessage={t("assessmentFill.varianceEmpty")}
              />
            </div>
          </Card>

          {/* Verifikasi clinical pathway (dokter PJ / perawat PJ / pelaksana). */}
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{t("assessmentFill.verificationTitle")}</h3>
              {pelaksanaVerified && (
                <Badge variant="success">{t("assessment.statusDone")}</Badge>
              )}
            </div>
            {pelaksanaVerified && (
              <p className="mb-3 rounded-lg bg-[#4ba69d]/10 px-3 py-2 text-sm text-[#075489]">
                {t("assessmentFill.lockedNotice")}
              </p>
            )}
            {verifyError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{verifyError}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {verifItem(
                "dokter",
                t("assessmentFill.roleDoctorPj"),
                asesmen.doctor_verified_by,
                asesmen.doctor_verified_at,
              )}
              {verifItem(
                "perawat",
                t("assessmentFill.roleNursePj"),
                asesmen.nurse_verified_by,
                asesmen.nurse_verified_at,
              )}
              {verifItem(
                "pelaksana",
                t("assessmentFill.roleExecutor"),
                asesmen.executor_verified_by,
                asesmen.executor_verified_at,
                {
                  disabled: !(dokterVerified && perawatVerified),
                  disabledHint: t("assessmentFill.executorHint"),
                },
              )}
            </div>
          </Card>

          {/* Modal tambah/edit varian. */}
          <Modal
            open={varianModal !== null}
            onClose={() => setVarianModal(null)}
            title={
              varianModal === "tambah"
                ? t("assessmentFill.addVariance")
                : t("assessmentFill.editVariance")
            }
            size="md"
            footer={
              <>
                <Button variant="outline" onClick={() => setVarianModal(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleSaveVarian}
                  disabled={varianSaving}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  {varianSaving ? t("common.saving") : t("common.save")}
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
                  {t("assessmentFill.colOccurredAt")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="varian-tgl"
                  type="datetime-local"
                  value={varianForm.occurred_at}
                  onChange={(e) =>
                    setVarianForm((f) => ({ ...f, occurred_at: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="varian-isi">
                  {t("assessmentFill.colVariance")} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="varian-isi"
                  rows={3}
                  value={varianForm.variance}
                  onChange={(e) => setVarianForm((f) => ({ ...f, variance: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="varian-alasan">{t("assessmentFill.colReason")}</Label>
                <Textarea
                  id="varian-alasan"
                  rows={3}
                  value={varianForm.reason}
                  onChange={(e) => setVarianForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("assessmentFill.colInitials")}</Label>
                <Input value={currentUsername ?? ""} disabled />
                <p className="text-xs text-gray-400">
                  {t("assessmentFill.initialsHint")}
                </p>
              </div>
            </div>
          </Modal>

          <ConfirmDialog
            open={varianDeleteTarget !== null}
            onClose={() => setVarianDeleteTarget(null)}
            onConfirm={handleDeleteVarian}
            loading={varianDeletingId !== null}
            title={t("assessmentFill.deleteVarianceTitle")}
            description={t("assessmentFill.deleteVarianceDesc")}
          />

          {/* Preview PDF asesmen */}
          <Modal
            open={pdfOpen}
            onClose={closePdf}
            title={t("assessmentFill.pdfTitle")}
            size="lg"
            footer={
              <>
                <Button variant="outline" onClick={closePdf}>
                  {t("common.close")}
                </Button>
                <Button
                  onClick={downloadPdf}
                  disabled={!pdfUrl}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  <Download className="h-4 w-4" /> {t("assessmentFill.downloadPdf")}
                </Button>
              </>
            }
          >
            {pdfLoading ? (
              <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" /> {t("assessmentFill.loadingPdf")}
              </div>
            ) : pdfError ? (
              <div className="flex h-[70vh] items-center justify-center text-sm text-red-600">
                {pdfError}
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                title={t("assessmentFill.previewPdf")}
                className="h-[70vh] w-full rounded-lg border"
              />
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

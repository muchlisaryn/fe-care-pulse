"use client"

import { useEffect, useState } from "react"
import { Activity, ClipboardCheck, IdCard, ListTodo, MessageSquare } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { DecimalInput } from "@/components/atoms/DecimalInput"
import { Select } from "@/components/atoms/Select"
import { Textarea } from "@/components/atoms/Textarea"
import { Card } from "@/components/molecules/Card"
import { FormSectionHeader } from "@/components/molecules/FormSectionHeader"
import { FormSubheading } from "@/components/molecules/FormSubheading"
import { InlineField } from "@/components/molecules/InlineField"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { localeOf, useLanguage } from "@/lib/i18n"

// Tidak ada backend: catatan SOAP hanya disimpan di localStorage browser ini.
// Kunci berganti versi karena bentuk datanya berubah dari 4 isian bebas.
const STORAGE_KEY = "care_pulse_asesmen_rawat_jalan_v2"

type Soap = {
  patientIdentity: string
  // Subjective
  chiefComplaint: string
  presentIllness: string
  // Objective
  generalCondition: string
  systolic: string
  diastolic: string
  pulse: string
  respiration: string
  temperature: string
  painScale: string
  height: string
  weight: string
  headCircumference: string
  physicalExam: string
  // Assessment & Plan
  assessment: string
  plan: string
}

const emptySoap: Soap = {
  patientIdentity: "",
  chiefComplaint: "",
  presentIllness: "",
  generalCondition: "",
  systolic: "",
  diastolic: "",
  pulse: "",
  respiration: "",
  temperature: "",
  painScale: "",
  height: "",
  weight: "",
  headCircumference: "",
  physicalExam: "",
  assessment: "",
  plan: "",
}

const GENERAL_CONDITIONS = ["good", "fair", "poor"] as const

const PAIN_SCALE = Array.from({ length: 11 }, (_, score) => String(score))

// Lebar seragam untuk isian angka yang dijajarkan dalam satu baris.
const NUMBER_WIDTH = "w-full sm:w-40"

const REQUIRED: (keyof Soap)[] = [
  "generalCondition",
  "systolic",
  "diastolic",
  "pulse",
  "respiration",
  "painScale",
  "height",
  "weight",
  "physicalExam",
]

/** IMT = BB (kg) / TB (m)²; kosong bila TB/BB belum lengkap. */
function bodyMassIndex(height: string, weight: string): string {
  const meters = Number(height) / 100
  const kg = Number(weight)
  if (!meters || !kg) return ""
  return (kg / (meters * meters)).toFixed(1)
}

/** Kategori IMT menurut WHO (kunci kamus). */
function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "outpatientAssessment.bmi_underweight"
  if (bmi < 25) return "outpatientAssessment.bmi_normal"
  if (bmi < 30) return "outpatientAssessment.bmi_overweight"
  return "outpatientAssessment.bmi_obese"
}

/** Kategori skala nyeri numerik 0–10 (kunci kamus). */
function painCategory(score: string): string {
  const n = Number(score)
  if (n === 0) return "outpatientAssessment.pain_none"
  if (n <= 3) return "outpatientAssessment.pain_mild"
  if (n <= 6) return "outpatientAssessment.pain_moderate"
  return "outpatientAssessment.pain_severe"
}

export default function AsesmenRawatJalanPage() {
  const { t, lang } = useLanguage()

  const [soap, setSoap] = useState<Soap>(emptySoap)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [result, setResult] = useState<"success" | "error" | "invalid" | null>(null)

  const bmi = bodyMassIndex(soap.height, soap.weight)
  const isEmpty = Object.values(soap).every((value) => !value.trim())
  const isMissing = (field: keyof Soap) => showErrors && !soap[field].trim()

  // Dibaca setelah mount — localStorage tidak ada saat render di server.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as { soap: Partial<Soap>; savedAt: string }
      const restored = { ...emptySoap }
      // Hanya ambil kunci yang masih dipakai form — isian lama yang sudah dihapus diabaikan.
      for (const key of Object.keys(emptySoap) as (keyof Soap)[]) {
        if (typeof parsed.soap[key] === "string") restored[key] = parsed.soap[key]
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSoap(restored)
      setSavedAt(parsed.savedAt)
    } catch {
      // Data rusak atau storage diblokir: mulai dari form kosong.
    }
  }, [])

  function set(field: keyof Soap, value: string) {
    setSoap((current) => ({ ...current, [field]: value }))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (REQUIRED.some((field) => !soap[field].trim())) {
      setShowErrors(true)
      setResult("invalid")
      return
    }
    const now = new Date().toISOString()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ soap: { ...soap, bmi }, savedAt: now }))
      setSavedAt(now)
      setShowErrors(false)
      setResult("success")
    } catch {
      setResult("error")
    }
  }

  function handleClear() {
    setSoap(emptySoap)
    setSavedAt(null)
    setShowErrors(false)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Abaikan: form tetap dikosongkan.
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("outpatientAssessment.title")} subtitle={t("outpatientAssessment.subtitle")} />

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="space-y-5">
          <FormSectionHeader
            icon={IdCard}
            title={t("outpatientAssessment.patientIdentity")}
            description={t("outpatientAssessment.patientIdentityHint")}
          />
          <Textarea
            rows={4}
            value={soap.patientIdentity}
            onChange={(e) => set("patientIdentity", e.target.value)}
          />
        </Card>

        <Card className="space-y-5">
          <FormSectionHeader
            icon={MessageSquare}
            title={t("outpatientAssessment.subjective")}
            description={t("outpatientAssessment.subjectiveHint")}
          />
          <div className="space-y-4">
            <FormSubheading>{t("outpatientAssessment.chiefComplaint")}</FormSubheading>
            <InlineField label={t("outpatientAssessment.complaint")}>
              <Textarea
                rows={3}
                value={soap.chiefComplaint}
                onChange={(e) => set("chiefComplaint", e.target.value)}
                placeholder={t("outpatientAssessment.complaint")}
              />
            </InlineField>
          </div>
          <div className="space-y-4 border-t border-gray-100 pt-5">
            <FormSubheading>{t("outpatientAssessment.currentHealthComplaint")}</FormSubheading>
            <InlineField label={t("outpatientAssessment.presentIllness")}>
              <Textarea
                rows={4}
                value={soap.presentIllness}
                onChange={(e) => set("presentIllness", e.target.value)}
              />
            </InlineField>
          </div>
        </Card>

        <Card className="space-y-5">
          <FormSectionHeader
            icon={Activity}
            title={t("outpatientAssessment.objective")}
            description={t("outpatientAssessment.objectiveHint")}
            accent="#4ba69d"
          />
          <div className="space-y-4">
            <InlineField label={t("outpatientAssessment.generalCondition")} wajib>
              <Select
                value={soap.generalCondition}
                onChange={(e) => set("generalCondition", e.target.value)}
                error={isMissing("generalCondition")}
                className="sm:w-64"
              >
                <option value="">{t("common.selectPlaceholder")}</option>
                {GENERAL_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {t(`outpatientAssessment.condition_${condition}`)}
                  </option>
                ))}
              </Select>
            </InlineField>
            <InlineField label={t("outpatientAssessment.bloodPressure")} wajib>
              {(["systolic", "diastolic"] as const).map((field) => (
                <DecimalInput
                  key={field}
                  value={soap[field]}
                  onValueChange={(v) => set(field, v)}
                  placeholder={t(`outpatientAssessment.${field}`)}
                  suffix="mmHg"
                  error={isMissing(field)}
                  wrapperClassName={NUMBER_WIDTH}
                />
              ))}
            </InlineField>
            <InlineField label={t("outpatientAssessment.pulseRespiration")} wajib>
              {(["pulse", "respiration"] as const).map((field) => (
                <DecimalInput
                  key={field}
                  value={soap[field]}
                  onValueChange={(v) => set(field, v)}
                  placeholder={t(`outpatientAssessment.${field}`)}
                  suffix={t("outpatientAssessment.perMinute")}
                  error={isMissing(field)}
                  wrapperClassName={NUMBER_WIDTH}
                />
              ))}
            </InlineField>
            <InlineField label={t("outpatientAssessment.temperature")}>
              <DecimalInput
                value={soap.temperature}
                onValueChange={(v) => set("temperature", v)}
                suffix="°C"
                wrapperClassName={NUMBER_WIDTH}
              />
            </InlineField>
            <InlineField label={t("outpatientAssessment.painScreening")} wajib>
              <Select
                value={soap.painScale}
                onChange={(e) => set("painScale", e.target.value)}
                error={isMissing("painScale")}
                className="sm:w-64"
              >
                <option value="">{t("common.selectPlaceholder")}</option>
                {PAIN_SCALE.map((score) => (
                  <option key={score} value={score}>
                    {score} ({t(painCategory(score))})
                  </option>
                ))}
              </Select>
            </InlineField>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-5">
            <FormSubheading>{t("outpatientAssessment.otherExam")}</FormSubheading>
            {(
              [
                ["height", "cm"],
                ["weight", "kg"],
              ] as const
            ).map(([field, unit]) => (
              <InlineField key={field} label={t(`outpatientAssessment.${field}`)} wajib>
                <DecimalInput
                  value={soap[field]}
                  onValueChange={(v) => set(field, v)}
                  suffix={unit}
                  error={isMissing(field)}
                  wrapperClassName={NUMBER_WIDTH}
                />
              </InlineField>
            ))}
            <InlineField label={t("outpatientAssessment.bmi")} wajib>
              <DecimalInput
                value={bmi}
                onValueChange={() => {}}
                readOnly
                tabIndex={-1}
                placeholder={t("outpatientAssessment.bmiAuto")}
                suffix="kg/m²"
                error={showErrors && !bmi}
                wrapperClassName={NUMBER_WIDTH}
              />
              {bmi && (
                <span className="text-sm font-medium text-gray-700">
                  ({t(bmiCategory(Number(bmi)))})
                </span>
              )}
            </InlineField>
            <InlineField label={t("outpatientAssessment.headCircumference")}>
              <DecimalInput
                value={soap.headCircumference}
                onValueChange={(v) => set("headCircumference", v)}
                suffix="cm"
                wrapperClassName={NUMBER_WIDTH}
              />
            </InlineField>
            <InlineField label={t("outpatientAssessment.physicalExam")} wajib>
              <Textarea
                rows={5}
                value={soap.physicalExam}
                onChange={(e) => set("physicalExam", e.target.value)}
                error={isMissing("physicalExam")}
              />
            </InlineField>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-5">
            <FormSectionHeader
              icon={ClipboardCheck}
              title={t("outpatientAssessment.assessment")}
              description={t("outpatientAssessment.assessmentHint")}
            />
            <Textarea rows={6} value={soap.assessment} onChange={(e) => set("assessment", e.target.value)} />
          </Card>
          <Card className="space-y-5">
            <FormSectionHeader
              icon={ListTodo}
              title={t("outpatientAssessment.plan")}
              description={t("outpatientAssessment.planHint")}
              accent="#4ba69d"
            />
            <Textarea rows={6} value={soap.plan} onChange={(e) => set("plan", e.target.value)} />
          </Card>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {savedAt && (
            <p className="text-sm text-gray-500 sm:mr-auto">
              {t("outpatientAssessment.lastSaved")}{" "}
              {new Date(savedAt).toLocaleString(localeOf(lang))}
            </p>
          )}
          <Button type="button" variant="outline" onClick={handleClear} disabled={isEmpty && !savedAt}>
            {t("outpatientAssessment.clear")}
          </Button>
          <Button
            type="submit"
            disabled={isEmpty}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {t("common.save")}
          </Button>
        </div>
      </form>

      <ResultDialog
        open={result !== null}
        onClose={() => setResult(null)}
        variant={result === "success" ? "success" : "error"}
        title={result === "success" ? t("outpatientAssessment.savedTitle") : undefined}
        description={
          result === "success"
            ? t("outpatientAssessment.savedDescription")
            : result === "invalid"
              ? t("outpatientAssessment.requiredMissing")
              : t("outpatientAssessment.saveFailed")
        }
      />
    </div>
  )
}

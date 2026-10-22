"use client"

import { useState } from "react"
import { User } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Modal } from "@/components/molecules/Modal"
import { OrderRequestEditor, type OrderRequestEditorProps } from "@/components/molecules/OrderRequestEditor"
import { useT } from "@/lib/i18n"
import { digitsOnly, MAX_RM_LENGTH, type PatientGroup } from "@/lib/orderRequest"

type PatientOrderModalProps = Omit<OrderRequestEditorProps, "requests" | "onChange" | "onError"> & {
  onClose: () => void
  /** `add` = pasien baru (tombol Tambah Pasien), `edit` = ubah pasien yang ada. */
  mode: "add" | "edit"
  /** Pasien yang diisi — untuk `add` berupa grup kosong baru. */
  initial: PatientGroup
  /** No. RM pasien LAIN di form ini — satu pasien = satu order, jadi tidak boleh dobel. */
  takenMrNos: string[]
  onSave: (group: PatientGroup) => void
}

/**
 * Modal besar pengisian satu pasien pada form tambah order (layanan rawat inap):
 * identitas pasien (No. RM + nama) sekaligus instrumen / BMHP yang dimintanya.
 * Isian disimpan ke draf dan baru masuk form setelah tombol simpan ditekan.
 * Render bersyarat di pemanggil supaya drafnya selalu mulai dari `initial`.
 */
export function PatientOrderModal({
  onClose,
  mode,
  initial,
  takenMrNos,
  onSave,
  ...editorProps
}: PatientOrderModalProps) {
  const t = useT()
  const [draft, setDraft] = useState<PatientGroup>(initial)
  const [error, setError] = useState<string | null>(null)

  function update(next: Partial<PatientGroup>) {
    setDraft((d) => ({ ...d, ...next }))
    setError(null)
  }

  function handleSave() {
    const medicalRecordNo = draft.medicalRecordNo.trim()
    const patientName = draft.patientName.trim()
    if (!medicalRecordNo || !patientName) {
      setError(t("patientModal.errRequired"))
      return
    }
    if (takenMrNos.includes(medicalRecordNo)) {
      setError(t("orderCreate.errDuplicateMr"))
      return
    }
    if (draft.requests.length === 0) {
      setError(t("patientModal.errNoRequest"))
      return
    }
    if (draft.requests.some((r) => !/^\d+$/.test(r.quantity) || Number(r.quantity) < 1)) {
      setError(t("orderCreate.errQty"))
      return
    }
    onSave({ ...draft, medicalRecordNo, patientName })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "add" ? t("patientModal.titleAdd") : t("patientModal.titleEdit")}
      size="xl"
      footer={
        <>
          {error && (
            <p className="mr-auto rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</p>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} className="bg-[#075489] text-white hover:bg-[#075489]/90">
            {mode === "add" ? t("patientModal.submitAdd") : t("common.save")}
          </Button>
        </>
      }
      bodyClassName="p-0"
    >
      {/* Identitas pasien */}
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <User className="h-3.5 w-3.5" />
          {t("patientModal.identity")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="patient-modal-rm">
              {t("patientCard.mrLabel")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="patient-modal-rm"
              autoFocus
              value={draft.medicalRecordNo}
              onChange={(e) => update({ medicalRecordNo: digitsOnly(e.target.value) })}
              // `inputMode` memunculkan papan angka di ponsel; tetap <input type="text">
              // agar nol di depan tidak hilang dan tombol spinner tidak muncul.
              inputMode="numeric"
              maxLength={MAX_RM_LENGTH}
              placeholder={t("patientCard.mrPlaceholder")}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="patient-modal-name">
              {t("patientCard.patientName")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="patient-modal-name"
              value={draft.patientName}
              // Nama pasien dikapitalkan saat mengetik, jadi yang TERSIMPAN memang
              // kapital — seragam dengan laporan yang menampilkannya kapital.
              onChange={(e) => update({ patientName: e.target.value.toUpperCase() })}
              placeholder={t("patientCard.patientNamePlaceholder")}
            />
          </div>
        </div>
      </div>

      {/* Instrumen / BMHP yang diminta pasien ini */}
      <OrderRequestEditor
        {...editorProps}
        requests={draft.requests}
        onChange={(requests) => update({ requests })}
        onError={setError}
      />
    </Modal>
  )
}

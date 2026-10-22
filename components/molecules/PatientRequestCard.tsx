"use client"

import { Boxes, Pencil, Trash2, Wrench } from "lucide-react"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { Card } from "@/components/molecules/Card"
import { OrderRequestEditor, type OrderRequestEditorProps } from "@/components/molecules/OrderRequestEditor"
import { useT } from "@/lib/i18n"
import { patientAccent, totalQtyOf, type PatientGroup } from "@/lib/orderRequest"

type PatientRequestCardProps = Omit<OrderRequestEditorProps, "requests" | "onChange"> & {
  /** Nomor urut pasien pada form (1, 2, 3, ...). */
  index: number
  group: PatientGroup
  onChange: (group: PatientGroup) => void
  onRemove: () => void
  /** Grup terakhir tidak boleh dihapus — minimal satu pasien harus ada. */
  canRemove: boolean
  /**
   * Layanan RAWAT INAP: identitas pasien + permintaannya diisi lewat modal
   * (PatientOrderModal), kartu hanya menampilkan ringkasannya. Layanan lain tidak
   * punya identitas pasien, jadi isian permintaannya langsung di kartu.
   */
  showPatientFields: boolean
  /** Buka modal pasien untuk mengisi/mengubah identitas & permintaannya. */
  onEditPatient: () => void
}

/**
 * Satu pasien pada form order: identitas pasien + daftar permintaannya. Satu kartu =
 * satu record order saat disimpan, sehingga beberapa pasien bisa diorder sekaligus
 * dalam satu pengisian form (data peminjam, ruangan & jadwalnya dipakai bersama).
 */
export function PatientRequestCard({
  index,
  group,
  onChange,
  onRemove,
  canRemove,
  showPatientFields,
  onEditPatient,
  ...editorProps
}: PatientRequestCardProps) {
  const t = useT()
  const requests = group.requests
  const totalQty = totalQtyOf(requests)

  // Warna aksen per urutan pasien: nomor + latar kepala kartu memakai warna
  // yang sama, sehingga order satu pasien mudah dibedakan dari pasien lain
  // saat beberapa order diisi sekaligus.
  const accent = patientAccent(index)

  return (
    <Card className="overflow-hidden p-0">
      {/* Kepala kartu: nomor pasien + total unit + tombol ubah / hapus pasien */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4"
        style={{ backgroundColor: `${accent}0f` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
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
            {showPatientFields &&
              (group.medicalRecordNo ? (
                <p className="font-mono text-xs text-gray-400">
                  {t("patientCard.mrPrefix")} {group.medicalRecordNo}
                </p>
              ) : (
                <p className="text-xs text-red-500">{t("patientCard.identityMissing")}</p>
              ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {requests.length > 0 && <Badge variant="info">{t("patientCard.unitsBadge", { n: totalQty })}</Badge>}
          {showPatientFields && (
            <Button type="button" variant="outline" size="sm" onClick={onEditPatient}>
              <Pencil className="h-3.5 w-3.5" />
              {t("patientCard.editPatient")}
            </Button>
          )}
          {canRemove && (
            <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
              {t("patientCard.removePatient")}
            </Button>
          )}
        </div>
      </div>

      {showPatientFields ? (
        // Ringkasan permintaan — mengubahnya lewat tombol Ubah (modal pasien).
        requests.length > 0 ? (
          <ul className="divide-y divide-gray-50 px-5 py-2">
            {requests.map((r) => {
              const isPaket = r.type === "paket"
              return (
                <li key={`${r.type}-${r.refId}`} className="flex items-center gap-3 py-2">
                  <span
                    className={
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg " +
                      (isPaket ? "bg-[#075489]/10 text-[#075489]" : "bg-[#4ba69d]/10 text-[#4ba69d]")
                    }
                  >
                    {isPaket ? <Boxes className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{r.name}</span>
                  <Badge variant={isPaket ? "info" : "default"}>
                    {isPaket ? t("common.package") : t("common.single")}
                  </Badge>
                  <span className="w-16 text-right text-sm font-semibold text-gray-900">
                    {r.quantity} <span className="text-xs font-normal text-gray-400">{isPaket ? t("common.set") : t("common.unit")}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-gray-400">{t("patientCard.noRequestsYet")}</p>
        )
      ) : (
        <OrderRequestEditor
          {...editorProps}
          requests={requests}
          onChange={(next) => onChange({ ...group, requests: next })}
        />
      )}
    </Card>
  )
}

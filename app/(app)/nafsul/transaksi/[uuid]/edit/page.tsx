"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, Trash2 } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { NumberInput } from "@/components/atoms/NumberInput"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { useAppDispatch } from "@/lib/store/hooks"
import {
  invalidateTransaksi,
  type TransaksiHeader,
} from "@/lib/store/slices/nafsulTransaksiSlice"
import { api, ApiError } from "@/lib/nafsul/api"
import { useT } from "@/lib/i18n"

/** Angka desimal dari API ("50000.00") → "Rp 50.000". */
function rupiah(nilai: string | number): string {
  const angka = Number(nilai)
  if (!Number.isFinite(angka)) return "—"
  return `Rp ${angka.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`
}

function angka(nilai: string): number {
  const n = Number(nilai)
  return Number.isFinite(n) ? n : 0
}

/**
 * Satu baris rincian di form. `uuid` dibawa apa adanya dari server: itulah yang
 * memberi tahu backend baris ini SUDAH ADA, sehingga diperbarui di tempat
 * alih-alih dihapus lalu dibuat ulang — dan pemeriksaan duplikat periode tidak
 * menuduh baris itu bentrok dengan dirinya sendiri.
 */
type BarisForm = {
  uuid: string
  /**
   * Ikut dibawa walau tidak bisa diubah di layar ini: validasi server
   * mewajibkan `member_id` & `rate_id` ada di SETIAP baris kiriman.
   */
  member_id: number
  rate_id: number
  member_name: string
  member_number: string | null
  rate_name: string
  /** `null` = tarif SEKALI BAYAR; barisnya memang tidak berperiode. */
  payment_period: string | null
  amount: string
  discount: string
}

type HeaderForm = {
  /** "YYYY-MM-DD" — tanggal uang diterima. */
  date: string
  member_deduction_type: "amount" | "percent"
  member_deduction_input: string
  group_leader_fee_percent: string
  payment: string
  payment_method: "cash" | "transfer" | "other"
}

/**
 * Ubah kuitansi iuran yang sudah tersimpan.
 *
 * Menggantikan peran tombol "Reset" yang dulu ada di daftar: kuitansi yang
 * salah diperbaiki di tempat, bukan dihapus lalu dibuat ulang dari nol.
 *
 * Yang BISA diubah: potongan, pembayaran, cara bayar, serta nominal, diskon &
 * periode tiap rincian — termasuk membuang rincian yang tidak seharusnya ikut.
 *
 * Yang TIDAK bisa diubah di sini: anggota & tarif sebuah rincian, jenis
 * kuitansi, dan MENAMBAH anggota baru. Ketiganya menentukan kuitansi ini
 * kuitansi apa; menggantinya sama saja dengan kuitansi yang berbeda, dan lebih
 * jujur dibuat sebagai kuitansi baru. Anggota & tarif ditampilkan sebagai teks
 * supaya petugas tetap tahu baris mana yang sedang ia perbaiki.
 *
 * Kuitansi yang sudah DIVALIDASI tidak bisa dibuka di sini — kuncinya dilepas
 * dulu lewat tombol gembok di daftar. Server menolaknya juga.
 */
export default function TransaksiEditPage() {
  const t = useT()
  const router = useRouter()
  const dispatch = useAppDispatch()
  const params = useParams<{ uuid: string }>()
  const uuid = params?.uuid ?? ""

  const [memuat, setMemuat] = useState(true)
  const [asli, setAsli] = useState<TransaksiHeader | null>(null)
  const [header, setHeader] = useState<HeaderForm | null>(null)
  const [baris, setBaris] = useState<BarisForm[]>([])
  const [hapusIndex, setHapusIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const [sukses, setSukses] = useState<string | null>(null)

  const muat = useCallback(async () => {
    setMemuat(true)
    try {
      const data = await api<TransaksiHeader>(`/transaksi/header/${uuid}`)
      setAsli(data)
      setHeader({
        // Baris lama bisa belum punya tanggal; jatuhkan ke tanggal barisnya
        // dibuat supaya isiannya tidak kosong dan wajib diisi ulang manual.
        date: data.date ?? (data.created_at ?? "").slice(0, 10),
        member_deduction_type: data.member_deduction_type,
        member_deduction_input: String(Number(data.member_deduction_input)),
        group_leader_fee_percent: String(Number(data.group_leader_fee_percent)),
        payment: String(Number(data.payment)),
        payment_method: data.payment_method,
      })
      setBaris(
        (data.transactions ?? []).map((r) => ({
          uuid: r.uuid,
          member_id: r.member_id,
          rate_id: r.rate_id,
          member_name: r.member_name ?? "—",
          member_number: r.member_number,
          rate_name: r.rate_name ?? "—",
          payment_period: r.payment_period,
          amount: String(Number(r.amount)),
          discount: String(Number(r.discount)),
        })),
      )
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.loadFailed"))
    } finally {
      setMemuat(false)
    }
  }, [uuid, t])

  useEffect(() => {
    if (!uuid) return
    void muat()
  }, [uuid, muat])

  // Angka ringkasan dihitung ULANG di sini persis seperti di server, supaya yang
  // terbaca di layar sebelum menyimpan sama dengan yang nanti tersimpan.
  const totalRincian = baris.reduce(
    (n, b) => n + Math.max(0, angka(b.amount) - angka(b.discount)),
    0,
  )
  const potonganAnggota =
    header?.member_deduction_type === "percent"
      ? Math.round(((totalRincian * angka(header.member_deduction_input)) / 100) * 100) / 100
      : Math.round(angka(header?.member_deduction_input ?? "0") * 100) / 100
  const jasaKetua =
    Math.round(((totalRincian * angka(header?.group_leader_fee_percent ?? "0")) / 100) * 100) / 100
  const kelompok = asli?.transaction_type === "kelompok"
  const seharusnya = totalRincian - potonganAnggota - (kelompok ? jasaKetua : 0)

  function ubahBaris(i: number, patch: Partial<BarisForm>) {
    setBaris((prev) => prev.map((b, k) => (k === i ? { ...b, ...patch } : b)))
  }

  /**
   * Rincian dikelompokkan PER ANGGOTA. Satu kuitansi kelompok bisa memuat
   * belasan baris milik beberapa anggota sekaligus — tanpa dikelompokkan,
   * nama yang sama terulang di tiap baris dan sulit dilihat mana milik siapa.
   *
   * Indeks aslinya ikut dibawa: `ubahBaris`/`setHapusIndex` bekerja pada posisi
   * di `baris`, bukan pada posisi di dalam kelompok.
   */
  const kelompokAnggota = baris.reduce<
    { member_id: number; nama: string; nomor: string | null; isi: { b: BarisForm; i: number }[] }[]
  >((acc, b, i) => {
    const ada = acc.find((g) => g.member_id === b.member_id)
    if (ada) {
      ada.isi.push({ b, i })

      return acc
    }

    acc.push({
      member_id: b.member_id,
      nama: b.member_name,
      nomor: b.member_number,
      isi: [{ b, i }],
    })

    return acc
  }, [])

  function hapusBaris() {
    if (hapusIndex === null) return
    setBaris((prev) => prev.filter((_, k) => k !== hapusIndex))
    setHapusIndex(null)
  }

  async function simpan() {
    if (!header || !asli || saving) return

    if (baris.length === 0) {
      setGalat(t("nafsulTransaksi.editNoLines"))
      return
    }

    setSaving(true)
    try {
      await api(`/transaksi/header/${uuid}`, {
        method: "PUT",
        body: {
          // `transaction_number` sengaja TIDAK dikirim: nomor kuitansi sudah
          // terbit dan tercetak, jadi tidak boleh bergeser lewat layar edit.
          // Validasi server menerimanya sebagai `nullable`, dan `update()`
          // membiarkan nomor lama apa adanya bila field-nya tidak ada.
          date: header.date,
          // Jenis kuitansi tidak bisa diubah di sini, tapi tetap wajib dikirim:
          // validasi server memerlukannya. Nilainya dikirim apa adanya.
          transaction_type: asli.transaction_type,
          // Total dikirim untuk memenuhi validasi; angka yang DIPAKAI dihitung
          // ulang server dari rinciannya, jadi keduanya tidak bisa berselisih.
          total: totalRincian,
          member_deduction_type: header.member_deduction_type,
          member_deduction_input: angka(header.member_deduction_input),
          group_leader_fee_percent: kelompok ? angka(header.group_leader_fee_percent) : 0,
          payment: angka(header.payment),
          payment_method: header.payment_method,
          transactions: baris.map((b) => ({
            // `uuid` menandai baris ini SUDAH ADA, jadi server memperbaruinya di
            // tempat — bukan menghapus lalu membuat ulang, yang akan ditolak
            // sendiri oleh pemeriksaan duplikat periode.
            uuid: b.uuid,
            member_id: b.member_id,
            rate_id: b.rate_id,
            payment_period: b.payment_period,
            amount: angka(b.amount),
            discount: angka(b.discount),
          })),
        },
      })
      dispatch(invalidateTransaksi())
      setSukses(t("nafsulTransaksi.editSaved", { number: asli.transaction_number }))
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  if (memuat) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
    )
  }

  if (!header || !asli) {
    return (
      <div className="space-y-4">
        <div className="py-16 text-center text-sm text-gray-400">
          {t("nafsulTransaksi.editNotFound")}
        </div>
        <ResultDialog
          open={galat !== null}
          onClose={() => {
            setGalat(null)
            router.push("/nafsul/transaksi")
          }}
          variant="error"
          description={galat ?? ""}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tautan kembali di ATAS judul — pola yang sama dengan halaman transaksi baru. */}
      <div>
        <Link
          href="/nafsul/transaksi"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-[#075489]"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("nafsulTransaksi.title")}
        </Link>
        <PageHeader
          title={t("nafsulTransaksi.editTitle", { number: asli.transaction_number })}
          subtitle={t("nafsulTransaksi.editSubtitle")}
        />
      </div>

      {/* ── Rincian ── */}
      <Card className="p-0">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            {t("nafsulTransaksi.editLinesTitle")}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {t("nafsulTransaksi.editLinesHint")}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">{t("nafsulTransaksi.rate")}</th>
                <th className="w-32 px-3 py-2">{t("nafsulTransaksi.colPeriod")}</th>
                <th className="w-40 px-3 py-2 text-right">{t("nafsulTransaksi.editAmount")}</th>
                <th className="w-40 px-3 py-2 text-right">{t("nafsulTransaksi.discount")}</th>
                <th className="w-32 px-3 py-2 text-right">{t("nafsulTransaksi.colTotal")}</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>

            {/* Satu <tbody> per anggota: baris judulnya membawa nama & nomor
                sekali saja, lalu isinya menyusul. Nama tidak lagi terulang di
                setiap baris. */}
            {kelompokAnggota.map((g) => {
              const subtotal = g.isi.reduce(
                (n, { b }) => n + Math.max(0, angka(b.amount) - angka(b.discount)),
                0,
              )

              return (
                <tbody key={g.member_id} className="divide-y divide-gray-100">
                  <tr className="bg-slate-50/70">
                    <th colSpan={4} className="px-3 py-2 text-left">
                      <span className="font-semibold text-gray-900">{g.nama}</span>
                      {g.nomor ? (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {g.nomor}
                        </span>
                      ) : (
                        <span className="ml-2 text-xs font-normal text-gray-400">—</span>
                      )}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {t("nafsulTransaksi.linesCount", { count: g.isi.length })}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">
                      {rupiah(subtotal)}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>

                  {g.isi.map(({ b, i }) => (
                    <tr key={b.uuid}>
                      <td className="px-3 py-2 text-gray-700">{b.rate_name}</td>
                      <td className="px-3 py-2">
                        {/* Tarif sekali bayar memang tidak berperiode — kolomnya
                            dikunci supaya tidak diisi lalu ditolak server. */}
                        {b.payment_period === null ? (
                          <span className="text-xs text-gray-400">
                            {t("nafsulTransaksi.oneTimeCharge")}
                          </span>
                        ) : (
                          <Input
                            value={b.payment_period}
                            onChange={(e) => ubahBaris(i, { payment_period: e.target.value })}
                            placeholder="MM/YYYY"
                            className="tabular-nums"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          prefix="Rp"
                          value={b.amount}
                          onValueChange={(v) => ubahBaris(i, { amount: v })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <NumberInput
                          prefix="Rp"
                          value={b.discount}
                          onValueChange={(v) => ubahBaris(i, { discount: v })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">
                        {rupiah(Math.max(0, angka(b.amount) - angka(b.discount)))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="xs"
                          variant="destructive"
                          aria-label={t("common.delete")}
                          onClick={() => setHapusIndex(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              )
            })}

            {baris.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">
                    {t("nafsulTransaksi.editNoLines")}
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </Card>

      {/* ── Pembayaran ── */}
      <Card>
        {/*
          Tanggal ditaruh PALING ATAS di kartu ini dan SELEBAR kartunya: ia
          menerangkan kapan uangnya diterima, jadi berlaku untuk seluruh isi
          kartu — bukan satu petak grid saja.
        */}
        <div className="mb-4 space-y-1.5 border-b border-gray-200 pb-4">
          <Label htmlFor="ed-tanggal">
            {t("nafsulTransaksi.colDate")} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="ed-tanggal"
            type="date"
            value={header.date}
            onChange={(e) => setHeader((h) => (h ? { ...h, date: e.target.value } : h))}
          />
          <p className="text-xs text-slate-500">{t("nafsulTransaksi.dateHint")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ed-nomor">{t("nafsulTransaksi.colNumber")}</Label>
            {/* Hanya tampilan: nomornya sudah terbit dan tercetak di kuitansi
                fisik, jadi tidak boleh bergeser lewat layar edit. */}
            <div
              id="ed-nomor"
              className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium tabular-nums text-slate-700"
            >
              {asli.transaction_number}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ed-jenis">{t("nafsulTransaksi.colType")}</Label>
            {/* Hanya tampilan: mengganti jenis kuitansi mengubah arti seluruh
                potongannya, jadi itu kuitansi yang berbeda — bukan hasil edit. */}
            <div
              id="ed-jenis"
              className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
            >
              {t(`nafsulTransaksi.tab_${asli.transaction_type}`)}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ed-potongan">{t("nafsulTransaksi.memberDeduction")}</Label>
            <div className="flex gap-2">
              <NumberInput
                id="ed-potongan"
                prefix={header.member_deduction_type === "percent" ? "%" : "Rp"}
                grouped={header.member_deduction_type !== "percent"}
                value={header.member_deduction_input}
                onValueChange={(v) =>
                  setHeader((h) => (h ? { ...h, member_deduction_input: v } : h))
                }
              />
              <div className="flex shrink-0 rounded-lg border border-slate-200 p-0.5">
                {(["amount", "percent"] as const).map((satuan) => (
                  <button
                    key={satuan}
                    type="button"
                    onClick={() =>
                      setHeader((h) => (h ? { ...h, member_deduction_type: satuan } : h))
                    }
                    aria-pressed={header.member_deduction_type === satuan}
                    className={`rounded-md px-3 text-sm font-medium transition-colors ${
                      header.member_deduction_type === satuan
                        ? "bg-[#075489] text-white"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {satuan === "amount" ? "Rp" : "%"}
                  </button>
                ))}
              </div>
            </div>
            {header.member_deduction_type === "percent" &&
              angka(header.member_deduction_input) > 0 && (
                <p className="text-xs text-slate-500">
                  {t("nafsulTransaksi.percentOf", {
                    percent: header.member_deduction_input,
                    base: rupiah(totalRincian),
                    result: rupiah(potonganAnggota),
                  })}
                </p>
              )}
          </div>

          {kelompok && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ed-potongan-ketua">
                  {t("nafsulTransaksi.leaderDeduction")}
                </Label>
                <NumberInput
                  id="ed-potongan-ketua"
                  prefix="%"
                  grouped={false}
                  value={header.group_leader_fee_percent}
                  onValueChange={(v) =>
                    setHeader((h) =>
                      h
                        ? {
                            ...h,
                            group_leader_fee_percent:
                              v === "" || Number(v) <= 100 ? v : "100",
                          }
                        : h,
                    )
                  }
                />
                <p className="text-xs text-slate-500">
                  {t("nafsulTransaksi.leaderDeductionHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-jasa-ketua">{t("nafsulTransaksi.leaderFee")}</Label>
                {/* Turunan dari persentase × total rincian, sama seperti di
                    server — bukan isian, supaya keduanya tidak bisa berselisih. */}
                <div
                  id="ed-jasa-ketua"
                  className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium tabular-nums text-slate-700"
                >
                  {rupiah(jasaKetua)}
                </div>
                <p className="text-xs text-slate-500">{t("nafsulTransaksi.leaderFeeHint")}</p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ed-bayar">
              {t("nafsulTransaksi.paid")} <span className="text-red-500">*</span>
            </Label>
            <NumberInput
              id="ed-bayar"
              prefix="Rp"
              value={header.payment}
              onValueChange={(v) => setHeader((h) => (h ? { ...h, payment: v } : h))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ed-metode">
              {t("nafsulTransaksi.colMethod")} <span className="text-red-500">*</span>
            </Label>
            <Select
              id="ed-metode"
              value={header.payment_method}
              onChange={(e) =>
                setHeader((h) =>
                  h
                    ? {
                        ...h,
                        payment_method: e.target.value as "cash" | "transfer" | "other",
                      }
                    : h,
                )
              }
            >
              <option value="cash">{t("nafsulTransaksi.method_cash")}</option>
              <option value="transfer">{t("nafsulTransaksi.method_transfer")}</option>
              <option value="other">{t("nafsulTransaksi.method_other")}</option>
            </Select>
          </div>
        </div>

        <dl className="mt-5 space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">{t("nafsulTransaksi.colTotal")}</dt>
            <dd className="tabular-nums text-gray-900">{rupiah(totalRincian)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">{t("nafsulTransaksi.memberDeduction")}</dt>
            <dd className="tabular-nums text-gray-900">− {rupiah(potonganAnggota)}</dd>
          </div>
          {kelompok && (
            <div className="flex justify-between">
              <dt className="text-gray-600">{t("nafsulTransaksi.leaderDeduction")}</dt>
              <dd className="tabular-nums text-gray-900">− {rupiah(jasaKetua)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
            <dt className="text-gray-700">{t("nafsulTransaksi.due")}</dt>
            <dd className="tabular-nums text-gray-900">{rupiah(seharusnya)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link href="/nafsul/transaksi">
            <Button variant="outline" disabled={saving}>
              {t("common.cancel")}
            </Button>
          </Link>
          <Button
            onClick={simpan}
            disabled={saving || baris.length === 0}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={hapusIndex !== null}
        onClose={() => setHapusIndex(null)}
        onConfirm={hapusBaris}
        // Tetap bernada bahaya — barisnya memang dibuang — tapi labelnya
        // diperjelas: yang dibuang rinciannya, bukan kuitansinya.
        confirmLabel={t("nafsulTransaksi.editRemoveLine")}
        title={t("nafsulTransaksi.editRemoveLineTitle")}
        description={t("nafsulTransaksi.editRemoveLineConfirm", {
          member: hapusIndex !== null ? (baris[hapusIndex]?.member_name ?? "—") : "—",
        })}
      />

      <ResultDialog
        open={sukses !== null}
        onClose={() => {
          setSukses(null)
          router.push("/nafsul/transaksi")
        }}
        variant="success"
        description={sukses ?? ""}
      />

      <ResultDialog
        open={galat !== null}
        onClose={() => setGalat(null)}
        variant="error"
        description={galat ?? ""}
      />
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Check, CopyCheck, Save, Tags, Users, X } from "lucide-react"
import { Modal } from "@/components/molecules/Modal"
import { Button } from "@/components/atoms/Button"
import { Label } from "@/components/atoms/Label"
import { NumberInput } from "@/components/atoms/NumberInput"
import MasterSelect from "@/components/nafsul/MasterSelect"
import { api, ApiError } from "@/lib/nafsul/api"
import type { Anggota, Paginated, Tarif } from "@/lib/nafsul/types"
import { isSekaliBayar, type FeeType } from "@/lib/nafsul/feeType"
import type { Rencana } from "@/components/nafsul/TransaksiForm"
import { useT } from "@/lib/i18n"

/** Satu rincian siap masuk daftar — bentuknya sama dengan isian baris entri. */
export type RincianMassal = {
  member_id: string
  member_number: string
  member_name: string
  rate_id: string
  rate_label: string
  rate_fee_type: FeeType | null
  rencana: Rencana
}

type Tarifku = { id: string; nama: string; fee_type: FeeType | null }

/** Isian per anggota di dalam modal. */
type Baris = {
  anggota: Anggota
  /** Jumlah bulan (tarif berulang). */
  months: string
  /** Ikut ditagih (tarif sekali bayar — tidak ada bulan untuk diisi). */
  dipilih: boolean
  galat: string | null
}

/** Permintaan rencana yang berjalan bersamaan — cukup untuk kelompok besar tanpa membanjiri server. */
const PARALEL = 5

/**
 * Tagih seluruh anggota satu kelompok sekaligus dengan SATU tarif.
 *
 * Alurnya: pilih tarif → seluruh anggota ketua terpilih muncul → isi jumlah
 * bulan per anggota (atau sekali isi untuk semua) → Simpan. Rencana tiap
 * anggota tetap dihitung server lewat `/transaksi/rencana`, sama persis dengan
 * baris entri biasa, jadi bulan gratis & tunggakannya tidak dihitung ulang di
 * sini.
 *
 * Anggota yang gagal dihitung tetap tinggal di modal beserta pesannya; yang
 * berhasil langsung masuk daftar rincian.
 *
 * Dipasang pemanggil HANYA selama terbuka, jadi tiap pembukaan mulai bersih.
 */
export default function TransaksiSemuaAnggotaModal({
  onClose,
  ketua,
  terpakai,
  onSimpan,
}: {
  onClose: () => void
  ketua: { kode: string; nama: string }
  /** Pasangan "member_id:rate_id" yang sudah ada di daftar rincian. */
  terpakai: Set<string>
  onSimpan: (rincian: RincianMassal[]) => void
}) {
  const t = useT()
  const [tarif, setTarif] = useState<Tarifku | null>(null)
  const [baris, setBaris] = useState<Baris[]>([])
  // Anggota dimuat sekali saat modal dipasang, sementara petugas memilih tarif.
  const [loading, setLoading] = useState(true)
  const [galat, setGalat] = useState<string | null>(null)
  const [semuaBulan, setSemuaBulan] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let aktif = true

    // `per_page` besar, bukan `all=1` — yang kedua tidak menyertakan periode
    // terakhir bayar, padahal itu yang dilihat petugas sebelum mengisi bulan.
    api<Paginated<Anggota>>("/anggota", {
      params: { noketua: ketua.kode, sort: "no_anggota", page: 1, per_page: 5000 },
    })
      .then((res) => {
        if (!aktif) return
        setBaris(
          res.data.map((a) => ({ anggota: a, months: "", dipilih: false, galat: null }))
        )
      })
      .catch((err) => {
        if (!aktif) return
        setGalat(err instanceof ApiError ? err.message : "nafsulTransaksi.bulkLoadFailed")
      })
      .finally(() => aktif && setLoading(false))

    return () => {
      aktif = false
    }
  }, [ketua.kode])

  const sekaliBayar = isSekaliBayar(tarif?.fee_type)
  const sudahAda = (a: Anggota) => !!tarif && terpakai.has(`${a.id}:${tarif.id}`)

  /** Baris yang akan dihitung saat Simpan. */
  const terisi = baris.filter(
    (b) => !sudahAda(b.anggota) && (sekaliBayar ? b.dipilih : Number(b.months) > 0)
  )

  const ubah = (id: number, isi: Partial<Baris>) =>
    setBaris((rows) =>
      rows.map((b) => (b.anggota.id === id ? { ...b, ...isi, galat: null } : b))
    )

  function terapkanSemua() {
    if (sekaliBayar) {
      const semuaDipilih = baris.every((b) => sudahAda(b.anggota) || b.dipilih)
      setBaris((rows) => rows.map((b) => ({ ...b, dipilih: !semuaDipilih, galat: null })))
      return
    }
    setBaris((rows) => rows.map((b) => ({ ...b, months: semuaBulan, galat: null })))
  }

  async function hitung(b: Baris): Promise<RincianMassal> {
    const rencana = await api<Rencana>("/transaksi/rencana", {
      params: sekaliBayar
        ? { member_id: b.anggota.id, rate_id: tarif!.id }
        : { member_id: b.anggota.id, rate_id: tarif!.id, months: b.months },
    })
    return {
      member_id: String(b.anggota.id),
      member_number: b.anggota.no_anggota ?? "",
      member_name: b.anggota.nama ?? "",
      rate_id: tarif!.id,
      rate_label: tarif!.nama,
      rate_fee_type: tarif!.fee_type,
      rencana,
    }
  }

  async function simpan() {
    if (!tarif || terisi.length === 0) return
    setSaving(true)

    const berhasil: RincianMassal[] = []
    const gagal = new Map<number, string>()

    for (let i = 0; i < terisi.length; i += PARALEL) {
      const potong = terisi.slice(i, i + PARALEL)
      const hasil = await Promise.allSettled(potong.map(hitung))
      hasil.forEach((h, k) => {
        if (h.status === "fulfilled") {
          berhasil.push(h.value)
          return
        }
        const err = h.reason as ApiError
        const perField = err?.errors ? Object.values(err.errors)[0]?.[0] : undefined
        gagal.set(potong[k].anggota.id, perField ?? err?.message ?? t("nafsulTransaksi.planFailed"))
      })
    }

    setSaving(false)
    if (berhasil.length > 0) onSimpan(berhasil)

    if (gagal.size === 0) {
      onClose()
      return
    }

    // Yang berhasil sudah masuk daftar (dan kini tertanda "sudah di rincian");
    // yang gagal tetap di sini beserta alasannya.
    setBaris((rows) =>
      rows.map((b) => ({ ...b, galat: gagal.get(b.anggota.id) ?? null }))
    )
  }

  const tutup = saving ? () => {} : onClose
  const bisaDiisi = baris.filter((b) => !sudahAda(b.anggota)).length
  const totalBulan = sekaliBayar ? 0 : terisi.reduce((j, b) => j + Number(b.months), 0)

  const statistik: [string, number][] = [
    [t("nafsulTransaksi.bulkStatMembers"), baris.length],
    [t("nafsulTransaksi.bulkStatFilled"), terisi.length],
    ...(sekaliBayar ? [] : [[t("nafsulTransaksi.bulkStatMonths"), totalBulan] as [string, number]]),
  ]

  return (
    <Modal
      open
      onClose={tutup}
      title={t("nafsulTransaksi.bulkButton")}
      // Judul bawaan diganti pita berwarna di dalam isi — memuat nama ketua
      // dan hitungan yang ikut bergerak saat bulan diisi.
      hideHeader
      size="xl"
      panelClassName="max-h-[94vh] overflow-hidden"
      bodyClassName="p-0 sm:px-0 sm:py-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={simpan}
            disabled={saving || terisi.length === 0}
            className="gap-1.5 bg-[#075489] px-5 hover:bg-[#075489]/90 text-white"
          >
            <Save className="h-4 w-4" />
            {saving
              ? t("nafsulTransaksi.bulkSaving")
              : t("nafsulTransaksi.bulkSave", { count: terisi.length })}
          </Button>
        </>
      }
    >
      {/* Modal ini dipasang DI DALAM <form> kuitansi: Enter di kotak bulan
          akan menyimpan seluruh kuitansi di belakangnya. */}
      <div
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault()
        }}
      >
        {/* ── Pita judul ── */}
        <div className="relative bg-gradient-to-r from-[#075489] to-[#4ba69d] px-5 py-5 text-white sm:px-7 sm:py-6">
          <button
            type="button"
            onClick={tutup}
            aria-label={t("common.close")}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col gap-4 pr-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <Users className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold sm:text-xl">
                  {t("nafsulTransaksi.bulkButton")}
                </h2>
                <p className="truncate text-sm text-white/80">
                  {t("nafsulTransaksi.bulkLeader", { leader: ketua.nama })}
                </p>
              </div>
            </div>

            {tarif && !loading && baris.length > 0 && (
              <div className="flex gap-2">
                {statistik.map(([label, nilai]) => (
                  <div
                    key={label}
                    className="min-w-[5.5rem] rounded-xl bg-white/15 px-3 py-2 text-center ring-1 ring-white/20"
                  >
                    <div className="text-xl font-bold tabular-nums">{nilai}</div>
                    <div className="text-[11px] uppercase tracking-wide text-white/75">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Tarif & isi semua ── */}
        {/* Satu baris di layar lebar: tarif, jumlah bulan, lalu tombolnya. */}
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-7 md:flex-row md:items-end">
          <div className="min-w-0 space-y-1.5 md:flex-1">
            <Label>
              {t("nafsulTransaksi.rate")} <span className="text-red-500">*</span>
            </Label>
            <MasterSelect<Tarif & { id: number }>
              endpoint="/tarif"
              // Hanya tarif iuran — sama dengan dropdown tarif di baris entri.
              params={{ kategori: "iuran" }}
              value={tarif?.id ?? ""}
              onChange={(v, row) => {
                setTarif(
                  v && row ? { id: v, nama: row.nama, fee_type: row.fee_type ?? null } : null
                )
                // Isian lama tidak dibawa ke tarif lain: jumlah bulannya belum
                // tentu sama, dan tarif sekali bayar malah tidak punya bulan.
                setBaris((rows) =>
                  rows.map((b) => ({ ...b, months: "", dipilih: false, galat: null }))
                )
              }}
              toOption={(x) => ({ value: String(x.id), label: x.nama })}
              placeholder={t("nafsulTransaksi.selectRate")}
              labelTerpilih={tarif?.nama}
              disabled={saving}
            />
          </div>

          {/* Sekali isi untuk semua — kebanyakan kelompok menyetor jumlah
              bulan yang sama; yang berbeda tinggal dikoreksi per kartu. */}
          {tarif && !loading && bisaDiisi > 0 && (
            <>
              {!sekaliBayar && (
                <div className="space-y-1.5 md:w-48">
                  <Label htmlFor="bulk-bulan">{t("nafsulTransaksi.bulkFillAll")}</Label>
                  <NumberInput
                    id="bulk-bulan"
                    grouped={false}
                    placeholder="12"
                    value={semuaBulan}
                    onValueChange={setSemuaBulan}
                  />
                </div>
              )}
              <Button
                type="button"
                onClick={terapkanSemua}
                disabled={saving || (!sekaliBayar && semuaBulan === "")}
                className="shrink-0 gap-1.5 bg-[#4ba69d] hover:bg-[#4ba69d]/90 text-white"
              >
                <CopyCheck className="h-4 w-4" />
                {sekaliBayar ? t("nafsulTransaksi.bulkToggleAll") : t("nafsulTransaksi.bulkApply")}
              </Button>
            </>
          )}
        </div>

        {/* ── Daftar anggota ── */}
        <div className="px-5 py-4 sm:px-7">
          {!tarif ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#075489]/10 text-[#075489]">
                <Tags className="h-7 w-7" />
              </div>
              <p className="max-w-sm text-sm text-slate-500">{t("nafsulTransaksi.bulkPickRate")}</p>
            </div>
          ) : loading ? (
            <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
          ) : galat ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{t(galat)}</p>
          ) : baris.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-400">
              {t("nafsulTransaksi.bulkEmpty")}
            </p>
          ) : (
            <ul className="grid max-h-[48vh] gap-3 overflow-y-auto p-0.5 md:grid-cols-2">
              {baris.map((b) => {
                const ada = sudahAda(b.anggota)
                const aktif = !ada && (sekaliBayar ? b.dipilih : Number(b.months) > 0)

                return (
                  <li
                    key={b.anggota.id}
                    className={`rounded-xl border p-3 transition-all ${
                      b.galat
                        ? "border-red-300 bg-red-50/50"
                        : aktif
                          ? "border-[#075489] bg-[#075489]/[0.04] shadow-sm ring-1 ring-[#075489]/20"
                          : ada
                            ? "border-slate-200 bg-slate-50 opacity-70"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          aktif ? "bg-[#075489] text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {ada ? <Check className="h-4 w-4" /> : inisial(b.anggota.nama)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {b.anggota.nama}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="tabular-nums">{b.anggota.no_anggota ?? "—"}</span>
                          <span className="text-slate-300">•</span>
                          <span className={ada ? "font-medium text-emerald-700" : ""}>
                            {ada
                              ? t("nafsulTransaksi.bulkAlreadyAdded")
                              : b.anggota.periode_terakhir_bayar
                                ? t("nafsulTransaksi.bulkLastPeriod", {
                                    period: b.anggota.periode_terakhir_bayar,
                                  })
                                : t("nafsulAnggota.neverPaid")}
                          </span>
                        </div>
                      </div>

                      {sekaliBayar ? (
                        <input
                          type="checkbox"
                          aria-label={b.anggota.nama ?? ""}
                          checked={ada || b.dipilih}
                          disabled={ada || saving}
                          onChange={(e) => ubah(b.anggota.id, { dipilih: e.target.checked })}
                          className="h-5 w-5 shrink-0 accent-[#075489]"
                        />
                      ) : (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <NumberInput
                            grouped={false}
                            placeholder="0"
                            aria-label={t("nafsulTransaksi.months")}
                            value={b.months}
                            onValueChange={(v) => ubah(b.anggota.id, { months: v })}
                            disabled={ada || saving}
                            className="w-16 text-center font-semibold"
                          />
                          <span className="text-xs text-slate-500">
                            {t("nafsulTransaksi.bulkMonthUnit")}
                          </span>
                        </div>
                      )}
                    </div>
                    {b.galat && <p className="mt-2 text-xs text-red-600">{b.galat}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** Dua huruf awal nama untuk lingkaran di kartu anggota, mis. "Achmad Zani" → "AZ". */
function inisial(nama: string | null | undefined): string {
  const huruf = (nama ?? "")
    .replace(/[^A-Za-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((k) => k[0]?.toUpperCase() ?? "")
    .join("")
  return huruf || "?"
}

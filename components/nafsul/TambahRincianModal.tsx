"use client"

import { useState } from "react"
import { Button } from "@/components/atoms/Button"
import { Label } from "@/components/atoms/Label"
import { NumberInput } from "@/components/atoms/NumberInput"
import { Modal } from "@/components/molecules/Modal"
import MasterSelect from "@/components/nafsul/MasterSelect"
import { api, ApiError } from "@/lib/nafsul/api"
import type { Anggota, Tarif } from "@/lib/nafsul/types"
import { isSekaliBayar, type FeeType } from "@/lib/nafsul/feeType"
import { useT } from "@/lib/i18n"

/**
 * Satu periode hasil hitungan server (`/transaksi/rencana`).
 *
 * Periode, nominal & diskonnya DIHITUNG SERVER dari pembayaran terakhir
 * anggota pada tarif itu, bukan diketik petugas. Aturan bulan gratis dan
 * hangusnya bonus bagi penunggak hanya hidup di satu tempat, jadi baris yang
 * ditambahkan lewat layar edit tidak bisa berbeda hitungannya dari yang dibuat
 * lewat layar kuitansi baru.
 */
type RencanaBaris = {
  payment_period: string | null
  amount: string
  discount: string
}

type Rencana = { transactions: RencanaBaris[] }

/** Anggota yang sudah ditentukan oleh tombol yang membuka modal ini. */
export type AnggotaTetap = {
  member_id: number
  nama: string
  nomor: string | null
}

/**
 * Rincian yang siap ditambahkan ke formulir.
 *
 * Modal ini sengaja TIDAK menyusun baris formulir sendiri: `key` & `uuid`
 * urusan halaman yang memegang daftarnya, dan modal yang ikut mengarangnya
 * berarti dua tempat yang harus sepakat soal bentuk baris.
 */
export type RincianBaru = {
  member_id: number
  rate_id: number
  member_name: string
  member_number: string | null
  rate_name: string
  periode: RencanaBaris[]
}

/** Isian modal — seluruhnya milik komponen ini. */
type Isian = {
  member_id: string
  member_number: string
  member_name: string
  rate_id: string
  rate_label: string
  rate_fee_type: FeeType | null
  months: string
}

const isianKosong: Isian = {
  member_id: "",
  member_number: "",
  member_name: "",
  rate_id: "",
  rate_label: "",
  rate_fee_type: null,
  months: "",
}

/**
 * Tambah rincian iuran ke kuitansi yang sedang diedit.
 *
 * Dibuka dari baris judul tiap anggota (`tetap` berisi anggotanya) atau dari
 * kepala kartu Rincian untuk anggota yang belum ada di kuitansi itu (`tetap`
 * null, anggotanya dipilih di sini).
 *
 * Isiannya dipegang komponen ini, bukan halamannya: mengetik jumlah bulan tidak
 * perlu ikut menggambar ulang tabel rincian yang bisa berisi puluhan baris
 * beserta isian di tiap barisnya. Pemanggil memasang `key` yang berganti tiap
 * kali modal dibuka, sehingga isiannya selalu mulai dari nol tanpa perlu effect
 * penyetel ulang.
 */
export default function TambahRincianModal({
  open,
  onClose,
  tetap,
  kelompok,
  kodeKetua,
  lanjutanPeriode,
  onTambah,
  onGalat,
}: {
  open: boolean
  onClose: () => void
  tetap: AnggotaTetap | null
  /** Kuitansi kelompok — dropdown anggotanya disaring per ketua. */
  kelompok: boolean
  /** Kode ketua kelompok pemilik kuitansi; kosong bila tidak terbaca. */
  kodeKetua: string | null | undefined
  /**
   * Periode pertama yang masih kosong untuk anggota+tarif itu MENURUT
   * FORMULIR, "MM/YYYY". Halaman yang menghitungnya: hanya ia yang tahu baris
   * mana saja yang sedang ada di layar, termasuk yang belum tersimpan.
   */
  lanjutanPeriode: (memberId: string, rateId: string) => string | undefined
  onTambah: (rincian: RincianBaru) => void
  onGalat: (pesan: string) => void
}) {
  const t = useT()
  const [isian, setIsian] = useState<Isian>(() =>
    tetap
      ? {
          ...isianKosong,
          member_id: String(tetap.member_id),
          member_number: tetap.nomor ?? "",
          member_name: tetap.nama,
        }
      : isianKosong,
  )
  const [memuat, setMemuat] = useState(false)

  const sekaliBayar = isSekaliBayar(isian.rate_fee_type)

  const siap =
    isian.member_id !== "" &&
    isian.rate_id !== "" &&
    // `!== ""` saja tidak cukup: "0" lolos ke server lalu ditolak `min:1`
    // sebagai galat validasi, padahal tombolnya yang seharusnya belum aktif.
    (sekaliBayar || Number(isian.months) >= 1) &&
    !memuat

  function tutup() {
    if (memuat) return
    onClose()
  }

  /** Minta jadwal periodenya ke server lalu serahkan ke halaman. */
  async function tambah() {
    if (!siap) return

    setMemuat(true)
    try {
      const lanjutan = lanjutanPeriode(isian.member_id, isian.rate_id)
      const rencana = await api<Rencana>("/transaksi/rencana", {
        params: sekaliBayar
          ? { member_id: isian.member_id, rate_id: isian.rate_id }
          : {
              member_id: isian.member_id,
              rate_id: isian.rate_id,
              months: isian.months,
              // Menyambung periode terakhir yang ada DI LAYAR; dihilangkan bila
              // belum ada, dan server yang menghitungnya dari pembayaran
              // terakhir yang tersimpan.
              ...(lanjutan ? { start_period: lanjutan } : {}),
            },
      })

      onTambah({
        member_id: Number(isian.member_id),
        rate_id: Number(isian.rate_id),
        member_name: isian.member_name || "—",
        member_number: isian.member_number || null,
        rate_name: isian.rate_label || "—",
        periode: rencana.transactions,
      })
      // Ditutup begitu barisnya masuk: hasilnya ada di tabel di belakang modal,
      // dan membiarkannya terbuka menyembunyikan justru yang barusan ditambah.
      onClose()
    } catch (e) {
      setMemuat(false)
      onGalat((e as ApiError).message ?? t("nafsulTransaksi.planFailed"))
    }
  }

  return (
    <Modal
      open={open}
      onClose={tutup}
      title={
        tetap
          ? t("nafsulTransaksi.editAddFor", { member: tetap.nama })
          : t("nafsulTransaksi.editAddMember")
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={tutup} disabled={memuat}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={tambah}
            disabled={!siap}
            className="bg-[#075489] hover:bg-[#075489]/90 text-white"
          >
            {memuat ? t("common.loading") : t("common.add")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("nafsulTransaksi.member")}</Label>
          {tetap ? (
            // Anggotanya ditentukan oleh tombol yang dipakai membuka modal ini
            // — ditampilkan sebagai teks, bukan dropdown yang bisa menggeser
            // rinciannya ke orang lain tanpa disadari.
            <div className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">
              {tetap.nomor ? `${tetap.nomor} — ${tetap.nama}` : tetap.nama}
            </div>
          ) : kelompok && !kodeKetua ? (
            // Kuitansi kelompok yang ketuanya tidak terbaca (mis. seluruh
            // anggotanya sudah dinonaktifkan) tidak bisa disaring, dan dropdown
            // tanpa saringan akan menawarkan seluruh anggota di database —
            // termasuk milik ketua lain, yang tidak boleh ikut.
            <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400">
              {t("nafsulTransaksi.editAddNoLeader")}
            </p>
          ) : (
            <MasterSelect<Anggota>
              endpoint="/anggota"
              params={kelompok ? { noketua: kodeKetua ?? "" } : { tipe: "pribadi" }}
              value={isian.member_id}
              onChange={(v, row) =>
                setIsian((e) => ({
                  ...e,
                  member_id: v,
                  member_number: row?.no_anggota ?? "",
                  member_name: row?.nama ?? "",
                  // Tarif dikosongkan: jadwal periodenya dihitung per anggota,
                  // jadi tarif yang masih terpilih dari anggota sebelumnya akan
                  // menghasilkan bulan yang keliru.
                  rate_id: "",
                  rate_label: "",
                  rate_fee_type: null,
                }))
              }
              toOption={(a) => ({
                value: String(a.id),
                label: a.no_anggota ? `${a.no_anggota} — ${a.nama}` : a.nama,
              })}
              placeholder={t("nafsulTransaksi.selectMember")}
              labelTerpilih={isian.member_name}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>{t("nafsulTransaksi.rate")}</Label>
          <MasterSelect<Tarif & { id: number }>
            /* `key` ikut berubah bersama anggota terpilih: MasterSelect menahan
               opsi yang sudah dimuat, jadi tanpa pemasangan ulang daftarnya
               masih memuat tarif anggota sebelumnya. */
            key={isian.member_id}
            endpoint="/tarif"
            /* Hanya tarif berkategori `iuran`. Tanpa saringan ini tarif kas
               keluar (santunan, jasa ketua) ikut muncul dan bisa tertagihkan ke
               anggota — sama seperti di halaman kuitansi baru.

               Tarif yang SUDAH dipakai anggota ini sengaja tetap ditawarkan:
               menambah bulan untuk tarif yang sama adalah alasan paling lazim
               membuka modal ini, dan periodenya disambung dari yang terakhir
               ada di formulir lewat `start_period`. */
            params={{ kategori: "iuran" }}
            value={isian.rate_id}
            onChange={(v, row) => {
              const sekali = isSekaliBayar(row?.fee_type)
              setIsian((e) => ({
                ...e,
                rate_id: v,
                rate_label: row ? row.nama : "",
                rate_fee_type: row?.fee_type ?? null,
                // Jumlah bulan yang terlanjur diketik ikut dibuang saat
                // berpindah ke tarif sekali bayar: kolomnya menghilang, jadi
                // angkanya tidak bisa lagi dilihat atau dikoreksi.
                months: sekali ? "" : e.months,
              }))
            }}
            toOption={(x) => ({ value: String(x.id), label: x.nama })}
            placeholder={t("nafsulTransaksi.selectRate")}
            labelTerpilih={isian.rate_label}
            disabled={isian.member_id === ""}
          />
        </div>

        {/* Tarif sekali bayar tidak berperiode — tidak ada yang bisa dikalikan,
            jadi kolomnya tidak ditampilkan sama sekali. */}
        {!sekaliBayar && (
          <div className="space-y-1.5">
            <Label htmlFor="ed-bulan">{t("nafsulTransaksi.months")}</Label>
            <NumberInput
              id="ed-bulan"
              grouped={false}
              value={isian.months}
              onValueChange={(v) => setIsian((e) => ({ ...e, months: v }))}
            />
          </div>
        )}

        <p className="text-xs text-gray-500">{t("nafsulTransaksi.editAddHint")}</p>
      </div>
    </Modal>
  )
}

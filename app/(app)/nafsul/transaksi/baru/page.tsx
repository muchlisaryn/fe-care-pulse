"use client"

import { Suspense, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Trash2,
  Gift,
  Pencil,
  X,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { NumberInput } from "@/components/atoms/NumberInput"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import MasterSelect from "@/components/nafsul/MasterSelect"
import { useAppDispatch } from "@/lib/store/hooks"
import { invalidateTransaksi } from "@/lib/store/slices/nafsulTransaksiSlice"
import { api, ApiError } from "@/lib/nafsul/api"
import type { Anggota, KetuaKelompok, Tarif } from "@/lib/nafsul/types"
import { isSekaliBayar, type FeeType } from "@/lib/nafsul/feeType"
import { useT } from "@/lib/i18n"

/** Satu periode hasil hitungan server. */
type RencanaBaris = {
  /** `null` untuk tarif sekali bayar — barisnya memang tidak berperiode. */
  payment_period: string | null
  amount: string
  discount: string
  total: string
  /** Bulan bonus — diskonnya penuh, jadi tidak menambah tagihan. */
  free: boolean
}

type Rencana = {
  months: number
  free_months: number
  start_period: string | null
  end_period: string | null
  total: string
  transactions: RencanaBaris[]
}

/**
 * Tab penentu anggota mana yang muncul di dropdown.
 *
 * - `kelompok` — ketua kelompok dipilih dulu, anggotanya menyusul disaring
 *   `noketua`. Tanpa urutan itu dropdown anggota memuat seluruh anggota,
 *   padahal petugas menagih per kelompok.
 * - `pribadi`  — hanya anggota perorangan, yaitu yang ketuanya bernama
 *   "Pribadi" (disaring server lewat `tipe=pribadi`).
 */
type Tipe = "kelompok" | "pribadi"

/** Isian yang sedang diketik di baris atas. */
type Entri = {
  member_id: string
  /**
   * Nomor & nama disimpan terpisah, bukan sebagai satu label gabungan.
   *
   * Kartu rincian menampilkan keduanya di baris berbeda — nama sebagai judul,
   * nomor sebagai keterangan — jadi label gabungan harus dipecah lagi kalau
   * disimpan menyatu.
   */
  member_number: string
  member_name: string
  rate_id: string
  rate_label: string
  /**
   * Sifat tarif yang sedang dipilih.
   *
   * Ikut disimpan, bukan dicari ulang dari daftar tarif: isian jumlah bulan
   * muncul/hilang berdasarkan nilai ini, dan dropdown-nya hanya menyerahkan
   * baris terpilih sekali saat diklik.
   */
  rate_fee_type: FeeType | null
  months: string
  rencana: Rencana | null
  memuat: boolean
  galat: string | null
}

/**
 * Satu rincian yang sudah masuk daftar.
 *
 * `id` cuma penomoran lokal untuk key React — rincian ini belum ada di database
 * sampai tombol Simpan ditekan.
 */
type Rincian = {
  id: number
  member_id: string
  member_number: string
  member_name: string
  rate_id: string
  rate_label: string
  rate_fee_type: FeeType | null
  rencana: Rencana
  /**
   * Tab & ketua saat rincian ini dibuat.
   *
   * Ikut disimpan supaya tombol Ubah bisa mengembalikan saringan dropdown
   * seperti semula. Tanpa itu, anggota yang sedang diubah tidak ada di daftar
   * pilihan yang sedang aktif dan tidak bisa diganti ke anggota lain.
   */
  tipe: Tipe
  ketua: { kode: string; nama: string }
}

const entriKosong: Entri = {
  member_id: "",
  member_number: "",
  member_name: "",
  rate_id: "",
  rate_label: "",
  rate_fee_type: null,
  months: "",
  rencana: null,
  memuat: false,
  galat: null,
}

const headerKosong = {
  member_deduction: "",
  /**
   * Potongan ketua kelompok, dalam PERSEN (mis. "10" = 10%).
   *
   * Nominal rupiahnya tidak disimpan di state: potongan dan jasa ketua
   * sama-sama turunan dari persentase ini dikali total rincian, jadi menyimpan
   * salinannya hanya membuka peluang keduanya berselisih.
   */
  group_leader_fee_percent: "",
  payment: "",
  payment_method: "cash" as "cash" | "transfer",
}

/** Jeda ketik sebelum jumlah bulan dikirim ke server. */
const DEBOUNCE_MS = 400

/** Label gabungan untuk tombol dropdown; kartu memakai nomor & nama terpisah. */
function labelAnggota(nomor: string | null, nama: string | null): string {
  return [nomor, nama].filter(Boolean).join(" — ")
}

function rupiah(nilai: string | number): string {
  const n = Number(nilai)
  if (!Number.isFinite(n)) return "—"
  return `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`
}

function angka(nilai: string): number {
  const n = Number(nilai)
  return Number.isFinite(n) ? n : 0
}

/** Ambil tab dari URL; nilai asing jatuh ke "kelompok". */
function tipeDariUrl(nilai: string | null): Tipe {
  return nilai === "pribadi" || nilai === "kelompok" ? nilai : "kelompok"
}

/**
 * `useSearchParams` membuat komponen ini bergantung pada URL saat render.
 * Next butuh batas Suspense di sekitarnya, kalau tidak halaman ini gagal
 * di-prerender saat build.
 */
export default function TransaksiBaruPage() {
  return (
    <Suspense fallback={null}>
      <TransaksiBaruForm />
    </Suspense>
  )
}

function TransaksiBaruForm() {
  const t = useT()
  const router = useRouter()
  const dispatch = useAppDispatch()

  const searchParams = useSearchParams()
  // Dibaca sekali saat halaman dibuka; setelahnya URL yang mengikuti state,
  // bukan sebaliknya — kalau dua-duanya saling mengejar, mengganti tab bisa
  // memicu render berulang.
  const [tipe, setTipe] = useState<Tipe>(() => tipeDariUrl(searchParams.get("tab")))
  const [ketua, setKetua] = useState({ kode: "", nama: "" })
  const [entri, setEntri] = useState<Entri>(entriKosong)
  const [daftar, setDaftar] = useState<Rincian[]>([])
  // Rincian yang sedang dibuka. Beberapa boleh terbuka sekaligus — menutup
  // yang lain secara otomatis justru menyulitkan saat membandingkan dua entri.
  const [terbuka, setTerbuka] = useState<number[]>([])
  // Rincian yang sedang diubah; null = tombolnya berarti "Tambah".
  const [editId, setEditId] = useState<number | null>(null)
  const [header, setHeader] = useState(headerKosong)
  const [saving, setSaving] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  const idBerikutnya = useRef(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Menandai permintaan terakhir; balasan yang datang telat diabaikan supaya
  // hasil ketikan lama tidak menimpa hasil ketikan terbaru.
  const permintaan = useRef(0)

  /**
   * Minta server menyusun periode, nominal, dan diskonnya.
   *
   * Perhitungannya tidak diulang di sini: kalau aturan bulan gratis ditulis di
   * dua tempat, cepat atau lambat angka di layar berbeda dari yang tersimpan.
   */
  async function muatRencana(
    memberId: string,
    rateId: string,
    months: string,
    sekaliBayar: boolean
  ) {
    // Tarif sekali bayar tidak punya periode, jadi jumlah bulan tidak ikut
    // menentukan lengkap-tidaknya isian — kalau tetap disyaratkan, rencananya
    // tidak akan pernah dimuat karena kolomnya memang disembunyikan.
    if (!memberId || !rateId || (!sekaliBayar && !months)) {
      setEntri((e) => ({ ...e, rencana: null, galat: null, memuat: false }))
      return
    }

    const nomor = ++permintaan.current
    setEntri((e) => ({ ...e, memuat: true, galat: null }))

    try {
      const hasil = await api<Rencana>("/transaksi/rencana", {
        params: sekaliBayar
          ? { member_id: memberId, rate_id: rateId }
          : { member_id: memberId, rate_id: rateId, months },
      })
      if (permintaan.current !== nomor) return
      setEntri((e) => ({ ...e, rencana: hasil, memuat: false }))
    } catch (e) {
      if (permintaan.current !== nomor) return
      const err = e as ApiError
      const perField = err.errors ? Object.values(err.errors)[0]?.[0] : undefined
      setEntri((x) => ({
        ...x,
        rencana: null,
        memuat: false,
        galat: perField ?? err.message ?? t("nafsulTransaksi.planFailed"),
      }))
    }
  }

  /** Anggota & tarif berubah → langsung; jumlah bulan → tunggu selesai mengetik. */
  function jadwalkan(
    nilai: {
      memberId: string
      rateId: string
      months: string
      sekaliBayar: boolean
    },
    segera: boolean
  ) {
    if (timer.current) clearTimeout(timer.current)

    if (segera) {
      muatRencana(nilai.memberId, nilai.rateId, nilai.months, nilai.sekaliBayar)
      return
    }

    timer.current = setTimeout(
      () =>
        muatRencana(nilai.memberId, nilai.rateId, nilai.months, nilai.sekaliBayar),
      DEBOUNCE_MS
    )
  }

  /**
   * Kosongkan anggota yang sedang dipilih.
   *
   * Dipakai saat tab atau ketua kelompok berganti: anggota milik ketua lama
   * tidak lagi ada di daftar pilihan yang baru, jadi membiarkannya terpilih
   * hanya menyisakan nama yang tidak bisa ditelusuri lagi di dropdown.
   *
   * Rincian yang sudah masuk daftar sengaja TIDAK ikut dihapus — satu kuitansi
   * memang boleh memuat anggota dari beberapa kelompok.
   */
  function lupakanAnggota() {
    if (timer.current) clearTimeout(timer.current)
    permintaan.current++
    setEntri((e) => ({
      ...e,
      member_id: "",
      member_number: "",
      member_name: "",
      rencana: null,
      memuat: false,
      galat: null,
    }))
  }

  /**
   * Pindahkan isian ke daftar, lalu kosongkan barisnya untuk anggota berikutnya.
   *
   * Anggota + tarif yang sama ditolak di sini: rencana dihitung dari pembayaran
   * terakhir di database, bukan dari rincian yang belum tersimpan, jadi entri
   * kedua akan menghasilkan periode yang sama persis dan baru ditolak server
   * saat Simpan. Lebih baik ketahuan sekarang.
   */
  function simpanEntri() {
    if (!entri.rencana || entri.memuat) return

    // Baris yang sedang diubah tidak dihitung sebagai bentrokan dengan
    // dirinya sendiri.
    const sudahAda = daftar.some(
      (d) =>
        d.id !== editId &&
        d.member_id === entri.member_id &&
        d.rate_id === entri.rate_id
    )

    if (sudahAda) {
      setEntri((e) => ({ ...e, galat: t("nafsulTransaksi.duplicateEntry") }))
      return
    }

    const rencana = entri.rencana
    const isi = {
      member_id: entri.member_id,
      member_number: entri.member_number,
      member_name: entri.member_name,
      rate_id: entri.rate_id,
      rate_label: entri.rate_label,
      rate_fee_type: entri.rate_fee_type,
      rencana,
      tipe,
      ketua,
    }

    setDaftar((rows) =>
      editId === null
        ? [...rows, { id: idBerikutnya.current++, ...isi }]
        : rows.map((r) => (r.id === editId ? { ...r, ...isi } : r))
    )

    batalkanEntri()
  }

  /** Kosongkan baris isian dan keluar dari mode ubah. */
  function batalkanEntri() {
    if (timer.current) clearTimeout(timer.current)
    // Permintaan yang masih di jalan tidak boleh mengisi baris yang sudah
    // dikosongkan — nomornya dinaikkan supaya balasannya diabaikan.
    permintaan.current++
    setEntri(entriKosong)
    setEditId(null)
  }

  /**
   * Naikkan rincian ke baris isian untuk diubah.
   *
   * Tab dan ketua ikut dikembalikan seperti saat rincian itu dibuat, supaya
   * dropdown anggotanya berisi daftar yang sama.
   */
  function ubahRincian(d: Rincian) {
    if (timer.current) clearTimeout(timer.current)
    permintaan.current++

    setTipe(d.tipe)
    setKetua(d.ketua)
    setEditId(d.id)
    setEntri({
      member_id: d.member_id,
      member_number: d.member_number,
      member_name: d.member_name,
      rate_id: d.rate_id,
      rate_label: d.rate_label,
      rate_fee_type: d.rate_fee_type,
      // Rencana tarif sekali bayar memakai months = 0; dikosongkan supaya
      // isiannya tidak menampilkan "0" saat tarifnya diganti jadi berulang.
      months: d.rencana.months > 0 ? String(d.rencana.months) : "",
      rencana: d.rencana,
      memuat: false,
      galat: null,
    })
  }

  // Semua angka ringkasan diambil dari rencana yang dikirim server, bukan
  // dihitung ulang di sini.
  const semuaPeriode = daftar.flatMap((d) => d.rencana.transactions)
  const totalRincian = semuaPeriode.reduce((j, p) => j + angka(p.total), 0)
  const totalGratis = daftar.reduce((j, d) => j + d.rencana.free_months, 0)

  /**
   * Komisi ketua kelompok — muncul dua kali dengan nominal yang sama.
   *
   * Ketua menahan komisinya dari uang yang ia kumpulkan, jadi angka ini
   * mengurangi setoran (sebagai potongan) lalu ditambahkan kembali (sebagai
   * jasa). Keduanya saling menghapus di "Harus Dibayar"; yang disetorkan tetap
   * total dikurangi potongan anggota. Tetap ditampilkan dua baris karena
   * kuitansi harus memperlihatkan hak ketua secara terpisah.
   */
  const jasaKetua =
    tipe === "kelompok"
      ? Math.round(totalRincian * angka(header.group_leader_fee_percent)) / 100
      : 0

  const potongan = angka(header.member_deduction) + jasaKetua
  const harusDibayar = totalRincian - potongan + jasaKetua
  const sisa = harusDibayar - angka(header.payment)

  /**
   * Anggota yang sudah masuk daftar — disembunyikan dari dropdown.
   *
   * Baris yang sedang diubah dikecualikan, kalau tidak anggotanya sendiri ikut
   * hilang dari pilihan dan tidak bisa dipilih ulang.
   */
  const idTerpakai = daftar
    .filter((d) => d.id !== editId)
    .map((d) => d.member_id)

  /**
   * Jenis kuitansi tidak bisa diganti begitu ada rincian.
   *
   * `transaction_type` disimpan di header, jadi satu kuitansi hanya berjenis
   * satu — dan potongan/jasa ketua kelompok memang cuma berlaku untuk setoran
   * kelompok. Membiarkan tab berpindah akan menghasilkan kuitansi yang isinya
   * bertentangan dengan jenisnya sendiri.
   */
  const jenisTerkunci = daftar.length > 0

  /**
   * Tarif terpilih tidak berperiode → isian jumlah bulan disembunyikan dan
   * `payment_period` yang dikirim ke server bernilai null.
   */
  const entriSekaliBayar = isSekaliBayar(entri.rate_fee_type)

  const siapTambah = entri.rencana !== null && !entri.memuat
  const siapSimpan =
    daftar.length > 0 &&
    header.payment !== "" &&
    potongan <= totalRincian &&
    !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!siapSimpan) return

    setSaving(true)
    try {
      await api("/transaksi/header", {
        method: "POST",
        body: {
          member_deduction: angka(header.member_deduction),
          // Hanya persentasenya yang dikirim; nominal potongan & jasa ketua
          // dihitung server dari total rincian yang juga dihitungnya sendiri.
          group_leader_fee_percent: angka(header.group_leader_fee_percent),
          payment: angka(header.payment),
          payment_method: header.payment_method,
          transaction_type: tipe,
          // Total tetap dikirim agar payload lengkap, tapi server menghitung
          // ulang dari rincian — itu yang menentukan.
          total: totalRincian,
          // Tiap rincian di daftar mekar jadi sebanyak bulan yang direncanakan.
          transactions: daftar.flatMap((d) =>
            d.rencana.transactions.map((p) => ({
              member_id: Number(d.member_id),
              rate_id: Number(d.rate_id),
              payment_period: p.payment_period,
              amount: angka(p.amount),
              discount: angka(p.discount),
            }))
          ),
        },
      })

      // Daftar di-cache Redux; tanpa ini halaman transaksi tidak akan memuat
      // ulang saat dibuka lagi dan kuitansi baru tidak muncul.
      dispatch(invalidateTransaksi())
      router.push("/nafsul/transaksi")
    } catch (e2) {
      const err = e2 as ApiError
      const perField = err.errors ? Object.values(err.errors)[0]?.[0] : undefined
      setGalat(perField ?? err.message ?? t("nafsulTransaksi.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Link
          href="/nafsul/transaksi"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-[#075489]"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("nafsulTransaksi.title")}
        </Link>
        <PageHeader
          className="mb-5"
          title={t("nafsulTransaksi.newTitle")}
          subtitle={t("nafsulTransaksi.newSubtitle")}
        />
      </div>

      {/* ── Tab penentu anggota mana yang muncul di dropdown ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-slate-200 p-1">
          {(["kelompok", "pribadi"] as const).map((nilai) => (
            <button
              key={nilai}
              type="button"
              disabled={jenisTerkunci}
              onClick={() => {
                if (nilai === tipe) return
                setTipe(nilai)
                setKetua({ kode: "", nama: "" })
                // Potongan & jasa ketua kelompok tidak berlaku di tab Pribadi;
                // dikosongkan supaya ringkasan di bawah tidak ikut terhitung
                // dari angka yang field-nya sudah tidak terlihat.
                setHeader((h) => ({ ...h, group_leader_fee_percent: "" }))
                lupakanAnggota()
                // Tab ikut tercatat di URL supaya bisa ditautkan langsung dan
                // bertahan saat halaman dimuat ulang.
                router.replace(`/nafsul/transaksi/baru?tab=${nilai}`, {
                  scroll: false,
                })
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tipe === nilai
                  ? "bg-[#075489] text-white"
                  : jenisTerkunci
                    ? "cursor-not-allowed text-slate-300"
                    : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t(`nafsulTransaksi.tab_${nilai}`)}
            </button>
          ))}
        </div>

        {jenisTerkunci && (
          <p className="mt-2 text-xs text-slate-500">
            {t("nafsulTransaksi.typeLocked")}
          </p>
        )}
      </div>

      {/* ── Rincian iuran ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold">{t("nafsulTransaksi.lines")}</h2>

        {/* Baris isian: dikosongkan lagi setiap kali rinciannya masuk daftar. */}
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_9rem_auto] lg:items-end">
          {tipe === "kelompok" && (
            <div className="space-y-1.5 lg:col-span-4">
              <Label>
                {t("nafsulTransaksi.groupLeader")} <span className="text-red-500">*</span>
              </Label>
              <MasterSelect<KetuaKelompok & { id: number }>
                endpoint="/ketua-kelompok"
                // Ketua penampung anggota perorangan tidak ditawarkan di sini
                // — itu urusan tab Pribadi.
                params={{ tanpa_pribadi: 1 }}
                value={ketua.kode}
                onChange={(v, row) => {
                  setKetua({ kode: v, nama: row ? row.nama : "" })
                  lupakanAnggota()
                }}
                toOption={(k) => ({ value: k.noketua, label: k.nama })}
                placeholder={t("nafsulTransaksi.selectGroupLeader")}
                labelTerpilih={ketua.nama}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              {t("nafsulTransaksi.member")} <span className="text-red-500">*</span>
            </Label>
            {tipe === "kelompok" && !ketua.kode ? (
              // Dropdown anggota sengaja belum dipasang: tanpa ketua, tidak ada
              // yang bisa disaring dan daftarnya akan memuat seluruh anggota.
              <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400">
                {t("nafsulTransaksi.pickLeaderFirst")}
              </p>
            ) : (
              <MasterSelect<Anggota>
                /*
                  `key` ikut berubah bersama seluruh saringannya — termasuk
                  daftar anggota yang sudah terpakai. MasterSelect menahan opsi
                  yang sudah dimuat, jadi tanpa pemasangan ulang daftarnya masih
                  menampilkan anggota milik ketua sebelumnya, atau anggota yang
                  baru saja masuk daftar rincian.
                */
                key={`${tipe}-${ketua.kode}-${idTerpakai.join(".")}`}
                endpoint="/anggota"
                params={{
                  ...(tipe === "kelompok"
                    ? { noketua: ketua.kode }
                    : { tipe: "pribadi" }),
                  exclude_ids: idTerpakai.join(",") || undefined,
                }}
                value={entri.member_id}
                onChange={(v, row) => {
                  setEntri((e) => ({
                    ...e,
                    member_id: v,
                    member_number: row?.no_anggota ?? "",
                    member_name: row?.nama ?? "",
                    galat: null,
                  }))
                  jadwalkan(
                    {
                      memberId: v,
                      rateId: entri.rate_id,
                      months: entri.months,
                      sekaliBayar: entriSekaliBayar,
                    },
                    true
                  )
                }}
                toOption={(a) => ({
                  value: String(a.id),
                  label: labelAnggota(a.no_anggota, a.nama),
                })}
                placeholder={t("nafsulTransaksi.selectMember")}
                labelTerpilih={labelAnggota(entri.member_number, entri.member_name)}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("nafsulTransaksi.rate")} <span className="text-red-500">*</span>
            </Label>
            <MasterSelect<Tarif & { id: number }>
              endpoint="/tarif"
              /*
                Hanya tarif berkategori `iuran` — isi halaman Master Tarif Iuran.
                Tanpa saringan ini, tarif kas keluar (santunan, operasional, jasa
                ketua kelompok) ikut muncul dan bisa tertagihkan ke anggota,
                padahal itu pengeluaran kas, bukan iuran.
              */
              params={{ kategori: "iuran" }}
              value={entri.rate_id}
              onChange={(v, row) => {
                const sekaliBayar = isSekaliBayar(row?.fee_type)

                setEntri((e) => ({
                  ...e,
                  rate_id: v,
                  rate_label: row ? row.nama : "",
                  rate_fee_type: row?.fee_type ?? null,
                  // Jumlah bulan yang sudah diketik ikut dibuang saat berpindah
                  // ke tarif sekali bayar: kolomnya menghilang, jadi angkanya
                  // tidak bisa lagi dilihat atau dikoreksi petugas.
                  months: sekaliBayar ? "" : e.months,
                  galat: null,
                }))

                jadwalkan(
                  {
                    memberId: entri.member_id,
                    rateId: v,
                    months: sekaliBayar ? "" : entri.months,
                    sekaliBayar,
                  },
                  true
                )
              }}
              toOption={(x) => ({ value: String(x.id), label: x.nama })}
              placeholder={t("nafsulTransaksi.selectRate")}
              labelTerpilih={entri.rate_label}
            />
          </div>

          {/*
            Tarif sekali bayar tidak punya periode, jadi tidak ada yang bisa
            dikalikan — kolomnya diganti keterangan agar petak grid-nya tidak
            melompat saat tarif berganti.
          */}
          <div className="space-y-1.5">
            {entriSekaliBayar ? (
              <>
                <Label>{t("nafsulTransaksi.months")}</Label>
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-center text-sm text-slate-400">
                  {t("nafsulTransaksi.noPeriod")}
                </p>
              </>
            ) : (
              <>
                <Label htmlFor="entri-bulan">
                  {t("nafsulTransaksi.months")} <span className="text-red-500">*</span>
                </Label>
                <NumberInput
                  id="entri-bulan"
                  grouped={false}
                  placeholder="12"
                  value={entri.months}
                  onValueChange={(v) => {
                    setEntri((x) => ({ ...x, months: v, galat: null }))
                    jadwalkan(
                      {
                        memberId: entri.member_id,
                        rateId: entri.rate_id,
                        months: v,
                        sekaliBayar: false,
                      },
                      false
                    )
                  }}
                />
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={simpanEntri}
              disabled={!siapTambah}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {t("common.save")}
            </Button>
            {editId !== null && (
              <Button
                type="button"
                variant="outline"
                onClick={batalkanEntri}
                title={t("common.cancel")}
                aria-label={t("common.cancel")}
                className="px-3"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Pratinjau isian yang sedang diketik, sebelum masuk daftar. */}
        {entri.memuat && (
          <p className="mt-3 text-sm text-slate-400">{t("common.loading")}</p>
        )}

        {entri.galat && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {entri.galat}
          </p>
        )}

        {!entri.memuat && !entri.galat && entri.rencana && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {entri.rencana.start_period ? (
              <span className="tabular-nums text-slate-600">
                {t("nafsulTransaksi.planRange", {
                  start: entri.rencana.start_period,
                  end: entri.rencana.end_period ?? entri.rencana.start_period,
                })}
              </span>
            ) : (
              <span className="text-slate-600">{t("nafsulTransaksi.oneTimeCharge")}</span>
            )}
            {entri.rencana.free_months > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Gift className="h-3.5 w-3.5" />
                {t("nafsulTransaksi.freeMonths", { count: entri.rencana.free_months })}
              </span>
            )}
            <span className="font-semibold tabular-nums text-slate-900">
              {rupiah(entri.rencana.total)}
            </span>
          </div>
        )}

        {/* ── Daftar rincian yang sudah ditambahkan ── */}
        <div className="mt-5 border-t border-slate-200 pt-4">
          {daftar.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              {t("nafsulTransaksi.listEmpty")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {daftar.map((d) => {
                /**
                 * Rincian tarif sekali bayar tidak menyembunyikan apa pun:
                 * tidak ada rentang periode, tidak ada daftar bulan. Kartunya
                 * karena itu tidak dibuat bisa dibuka-tutup — tombol Ubah &
                 * Hapus langsung terlihat, bukan tersimpan di balik panah yang
                 * isinya cuma satu kalimat keterangan.
                 */
                const berperiode = d.rencana.start_period !== null
                const dibuka = berperiode && terbuka.includes(d.id)
                const sedangDiubah = editId === d.id

                return (
                  <li
                    key={d.id}
                    className={`overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md ${
                      sedangDiubah
                        ? "border-[#075489] ring-1 ring-[#075489]/30"
                        : dibuka
                          ? "border-slate-300"
                          : "border-slate-200"
                    }`}
                  >
                    {/*
                      Ringkasan yang selalu terlihat: identitas anggota, tarif,
                      lama iuran, dan totalnya. Sisanya (rentang periode &
                      daftar bulan) baru muncul saat dibuka — dengan belasan
                      bulan per anggota, menampilkan semuanya sekaligus membuat
                      daftar tidak terbaca.
                    */}
                    <button
                      type="button"
                      // Tombol yang tidak melakukan apa-apa lebih menyesatkan
                      // daripada tombol yang jelas mati: kartu sekali bayar
                      // dinonaktifkan, bukan sekadar dibiarkan tanpa efek.
                      disabled={!berperiode}
                      onClick={() =>
                        setTerbuka((ids) =>
                          dibuka ? ids.filter((x) => x !== d.id) : [...ids, d.id]
                        )
                      }
                      aria-expanded={berperiode ? dibuka : undefined}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        !berperiode
                          ? "cursor-default"
                          : dibuka
                            ? "bg-slate-50/70"
                            : "hover:bg-slate-50"
                      }`}
                    >
                      {!berperiode ? (
                        // Ruang kosong seukuran panah supaya isi kartu tetap
                        // sejajar dengan kartu yang punya panah di sebelahnya.
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : dibuka ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-[#075489]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      )}

                      <span className="min-w-0 flex-1">
                        {/*
                          Nomor anggota jadi penanda di depan nama — itu yang
                          dicocokkan petugas dengan buku setoran, sedangkan nama
                          bisa mirip antar anggota.
                        */}
                        <span className="block truncate">
                          <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                            {d.member_number}
                          </span>
                          <span className="text-[15px] font-semibold text-slate-900">
                            {d.member_name}
                          </span>
                        </span>
                        {/*
                          Ditulis sebagai satu kalimat, bukan deretan elemen
                          flex: pemisah "·" yang berdiri sendiri sebagai item
                          flex bisa terlempar ke baris sendiri saat sempit.
                        */}
                        <span className="mt-1 block text-xs text-slate-500">
                          {d.rate_label}
                          {" · "}
                          <span className="tabular-nums">
                            {d.rencana.months > 0
                              ? t("nafsulTransaksi.monthsCount", {
                                  count: d.rencana.months,
                                })
                              : t("nafsulTransaksi.oneTimeCharge")}
                          </span>
                          {d.rencana.free_months > 0 && (
                            <>
                              {" "}
                              {/*
                                Pil, bukan teks biasa: bonus bulan gratis adalah
                                hal pertama yang dicari petugas saat memeriksa
                                ulang kuitansi.

                                `whitespace-nowrap` menjaga ikon dan angkanya
                                tidak terpisah ke dua baris.
                              */}
                              <span className="ml-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                                <Gift className="h-3 w-3" />
                                {t("nafsulTransaksi.freeMonths", {
                                  count: d.rencana.free_months,
                                })}
                              </span>
                            </>
                          )}
                        </span>
                      </span>

                      {/* Angka yang paling sering dibandingkan antar baris —
                          dibuat paling menonjol. */}
                      <span className="shrink-0 text-right text-base font-bold tabular-nums text-[#075489]">
                        {rupiah(d.rencana.total)}
                      </span>
                    </button>

                    {(dibuka || !berperiode) && (
                      <div className="border-t border-slate-200 bg-white px-4 py-3">
                        {d.rencana.start_period && (
                          <>
                            <div className="mb-2 text-xs font-medium tabular-nums text-slate-500">
                              {t("nafsulTransaksi.planRange", {
                                start: d.rencana.start_period,
                                end: d.rencana.end_period ?? d.rencana.start_period,
                              })}
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {d.rencana.transactions.map((periode) => (
                                <span
                                  key={periode.payment_period ?? "tanpa-periode"}
                                  className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                                    periode.free
                                      ? "bg-emerald-100 font-medium text-emerald-800"
                                      : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"
                                  }`}
                                >
                                  {periode.payment_period}
                                </span>
                              ))}
                            </div>
                          </>
                        )}

                        <div
                          className={
                            berperiode
                              ? "mt-3 flex gap-2 border-t border-slate-100 pt-3"
                              : "flex gap-2"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => ubahRincian(d)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#075489] transition-colors hover:bg-[#075489]/10"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Kalau baris ini sedang diubah, baris isian di
                              // atas harus ikut dikosongkan — kalau tidak,
                              // menekan Simpan akan mencari baris yang sudah
                              // tidak ada dan diam-diam tidak melakukan apa pun.
                              if (sedangDiubah) batalkanEntri()
                              setTerbuka((ids) => ids.filter((x) => x !== d.id))
                              setDaftar((rows) => rows.filter((x) => x.id !== d.id))
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("common.delete")}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Pembayaran ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 bg-slate-50/60 px-5 py-3.5 font-semibold text-slate-800">
          {t("nafsulTransaksi.paymentSection")}
        </h2>

        {/*
          Dua lajur di layar lebar: potongan & metode di kiri, ringkasan angka
          di kanan. Sebelumnya semuanya satu grid memanjang, sehingga jumlah
          yang dibayar berada jauh dari total yang harus dibayar — padahal
          justru dua angka itu yang dibandingkan petugas sebelum menyimpan.
        */}
        <div className="grid gap-5 p-5 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hd-potongan-anggota">
                  {t("nafsulTransaksi.memberDeduction")}
                </Label>
                <NumberInput
                  id="hd-potongan-anggota"
                  prefix="Rp"
                  placeholder="0"
                  value={header.member_deduction}
                  onValueChange={(v) =>
                    setHeader((h) => ({ ...h, member_deduction: v }))
                  }
                />
              </div>

              {/* Hanya berlaku pada setoran kelompok. */}
              {tipe === "kelompok" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="hd-potongan-ketua">
                      {t("nafsulTransaksi.leaderDeduction")}
                    </Label>
                    <NumberInput
                      id="hd-potongan-ketua"
                      prefix="%"
                      placeholder="0"
                      grouped={false}
                      value={header.group_leader_fee_percent}
                      onValueChange={(v) =>
                        // Dibatasi 100 saat diketik, bukan ditolak setelah
                        // disimpan: potongan di atas 100% tidak punya arti, dan
                        // ringkasan di sebelahnya langsung ikut salah.
                        setHeader((h) => ({
                          ...h,
                          group_leader_fee_percent:
                            v === "" || Number(v) <= 100 ? v : "100",
                        }))
                      }
                    />
                    <p className="text-xs text-slate-500">
                      {t("nafsulTransaksi.leaderDeductionHint")}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hd-jasa-ketua">
                      {t("nafsulTransaksi.leaderFee")}
                    </Label>
                    {/*
                      Hanya tampilan, bukan isian: nominalnya selalu turunan
                      dari persentase × total rincian. Kalau boleh diketik
                      sendiri, angkanya bisa berselisih dengan persentase yang
                      tercatat di kuitansi yang sama tanpa ada yang tahu mana
                      yang benar.
                    */}
                    <div
                      id="hd-jasa-ketua"
                      className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium tabular-nums text-slate-700"
                    >
                      {rupiah(jasaKetua)}
                    </div>
                    <p className="text-xs text-slate-500">
                      {t("nafsulTransaksi.leaderFeeHint")}
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="hd-metode">
                  {t("nafsulTransaksi.colMethod")}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="hd-metode"
                  value={header.payment_method}
                  onChange={(e) =>
                    setHeader((h) => ({
                      ...h,
                      payment_method: e.target.value as "cash" | "transfer",
                    }))
                  }
                >
                  <option value="cash">{t("nafsulTransaksi.method_cash")}</option>
                  <option value="transfer">
                    {t("nafsulTransaksi.method_transfer")}
                  </option>
                </Select>
              </div>
            </div>

            {/*
              Jumlah dibayar dipisah dari potongan & metode dengan kotak isian
              yang lebih besar: ini satu-satunya angka yang benar-benar diketik
              petugas di bagian ini, dan yang menentukan kurang/lebih bayar.
            */}
            <div className="space-y-2 rounded-xl border border-[#075489]/20 bg-[#075489]/[0.04] p-4">
              <Label htmlFor="hd-payment">
                {t("nafsulTransaksi.paid")} <span className="text-red-500">*</span>
              </Label>
              <NumberInput
                id="hd-payment"
                prefix="Rp"
                placeholder="0"
                value={header.payment}
                onValueChange={(v) => setHeader((h) => ({ ...h, payment: v }))}
                className="h-12 text-lg font-semibold"
              />
              {harusDibayar > 0 && header.payment === "" && (
                <button
                  type="button"
                  onClick={() =>
                    setHeader((h) => ({
                      ...h,
                      payment: String(Math.round(harusDibayar)),
                    }))
                  }
                  className="text-xs font-medium text-[#075489] underline-offset-2 hover:underline"
                >
                  {t("nafsulTransaksi.fillExact", { amount: rupiah(harusDibayar) })}
                </button>
              )}
            </div>
          </div>

          <dl className="h-fit space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm lg:col-span-2">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">
                {t("nafsulTransaksi.periodsCount", { count: semuaPeriode.length })}
              </dt>
              <dd className="tabular-nums text-slate-900">{rupiah(totalRincian)}</dd>
            </div>
            {totalGratis > 0 && (
              <div className="flex justify-between gap-3 text-emerald-700">
                <dt>{t("nafsulTransaksi.freeMonths", { count: totalGratis })}</dt>
                <dd className="tabular-nums">—</dd>
              </div>
            )}
            {jasaKetua > 0 && (
              <>
                <div className="flex justify-between gap-3 text-slate-600">
                  <dt>
                    {t("nafsulTransaksi.leaderDeduction")}{" "}
                    <span className="tabular-nums">
                      ({header.group_leader_fee_percent}%)
                    </span>
                  </dt>
                  <dd className="tabular-nums">− {rupiah(jasaKetua)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-slate-600">
                  <dt>{t("nafsulTransaksi.leaderFee")}</dt>
                  <dd className="tabular-nums">+ {rupiah(jasaKetua)}</dd>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2.5">
              <dt className="font-medium text-slate-700">{t("nafsulTransaksi.due")}</dt>
              <dd className="text-xl font-bold tabular-nums text-[#075489]">
                {rupiah(harusDibayar)}
              </dd>
            </div>
            {header.payment !== "" && sisa !== 0 && (
              <div
                className={`flex justify-between gap-3 rounded-lg px-3 py-2 ${
                  sisa > 0
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                <dt className="font-medium">
                  {sisa > 0 ? t("nafsulTransaksi.under") : t("nafsulTransaksi.over")}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {rupiah(Math.abs(sisa))}
                </dd>
              </div>
            )}
            {header.payment !== "" && sisa === 0 && harusDibayar > 0 && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-700">
                {t("nafsulTransaksi.exact")}
              </p>
            )}
            {potongan > totalRincian && (
              <p className="border-t border-slate-200 pt-2 text-xs text-red-600">
                {t("nafsulTransaksi.deductionTooBig")}
              </p>
            )}
          </dl>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={!siapSimpan}
          className="bg-[#075489] hover:bg-[#075489]/90 text-white"
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/nafsul/transaksi")}
          disabled={saving}
        >
          {t("common.cancel")}
        </Button>
      </div>

      <ResultDialog
        open={galat !== null}
        onClose={() => setGalat(null)}
        variant="error"
        description={galat ?? ""}
      />
    </form>
  )
}

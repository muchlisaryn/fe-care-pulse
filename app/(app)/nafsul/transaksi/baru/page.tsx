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
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import MasterSelect from "@/components/nafsul/MasterSelect"
import { useAppDispatch } from "@/lib/store/hooks"
import { invalidateTransaksi } from "@/lib/store/slices/nafsulTransaksiSlice"
import { api, ApiError } from "@/lib/nafsul/api"
import type { Anggota, KetuaKelompok, Tarif } from "@/lib/nafsul/types"
import { useT } from "@/lib/i18n"

/** Satu periode hasil hitungan server. */
type RencanaBaris = {
  payment_period: string
  amount: string
  discount: string
  total: string
  /** Bulan bonus — diskonnya penuh, jadi tidak menambah tagihan. */
  free: boolean
}

type Rencana = {
  months: number
  free_months: number
  start_period: string
  end_period: string
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
  months: "",
  rencana: null,
  memuat: false,
  galat: null,
}

const headerKosong = {
  member_deduction: "",
  group_leader_deduction: "",
  group_leader_fee: "",
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
  async function muatRencana(memberId: string, rateId: string, months: string) {
    if (!memberId || !rateId || !months) {
      setEntri((e) => ({ ...e, rencana: null, galat: null, memuat: false }))
      return
    }

    const nomor = ++permintaan.current
    setEntri((e) => ({ ...e, memuat: true, galat: null }))

    try {
      const hasil = await api<Rencana>("/transaksi/rencana", {
        params: { member_id: memberId, rate_id: rateId, months },
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
    nilai: { memberId: string; rateId: string; months: string },
    segera: boolean
  ) {
    if (timer.current) clearTimeout(timer.current)

    if (segera) {
      muatRencana(nilai.memberId, nilai.rateId, nilai.months)
      return
    }

    timer.current = setTimeout(
      () => muatRencana(nilai.memberId, nilai.rateId, nilai.months),
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
      months: String(d.rencana.months),
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

  const potongan = angka(header.member_deduction) + angka(header.group_leader_deduction)
  const harusDibayar = totalRincian - potongan + angka(header.group_leader_fee)
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
          group_leader_deduction: angka(header.group_leader_deduction),
          group_leader_fee: angka(header.group_leader_fee),
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
                setHeader((h) => ({
                  ...h,
                  group_leader_deduction: "",
                  group_leader_fee: "",
                }))
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
                  jadwalkan({ memberId: v, rateId: entri.rate_id, months: entri.months }, true)
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
              value={entri.rate_id}
              onChange={(v, row) => {
                setEntri((e) => ({
                  ...e,
                  rate_id: v,
                  rate_label: row ? row.nama : "",
                  galat: null,
                }))
                jadwalkan({ memberId: entri.member_id, rateId: v, months: entri.months }, true)
              }}
              toOption={(x) => ({ value: String(x.id), label: x.nama })}
              placeholder={t("nafsulTransaksi.selectRate")}
              labelTerpilih={entri.rate_label}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entri-bulan">
              {t("nafsulTransaksi.months")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="entri-bulan"
              type="number"
              min={1}
              max={120}
              step={1}
              placeholder="12"
              value={entri.months}
              onChange={(e) => {
                const v = e.target.value
                setEntri((x) => ({ ...x, months: v, galat: null }))
                jadwalkan(
                  { memberId: entri.member_id, rateId: entri.rate_id, months: v },
                  false
                )
              }}
            />
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
            <span className="tabular-nums text-slate-600">
              {t("nafsulTransaksi.planRange", {
                start: entri.rencana.start_period,
                end: entri.rencana.end_period,
              })}
            </span>
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
                const dibuka = terbuka.includes(d.id)
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
                      onClick={() =>
                        setTerbuka((ids) =>
                          dibuka ? ids.filter((x) => x !== d.id) : [...ids, d.id]
                        )
                      }
                      aria-expanded={dibuka}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        dibuka ? "bg-slate-50/70" : "hover:bg-slate-50"
                      }`}
                    >
                      {dibuka ? (
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
                            {t("nafsulTransaksi.monthsCount", {
                              count: d.rencana.months,
                            })}
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

                    {dibuka && (
                      <div className="border-t border-slate-200 bg-white px-4 py-3">
                        <div className="mb-2 text-xs font-medium tabular-nums text-slate-500">
                          {t("nafsulTransaksi.planRange", {
                            start: d.rencana.start_period,
                            end: d.rencana.end_period,
                          })}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {d.rencana.transactions.map((periode) => (
                            <span
                              key={periode.payment_period}
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

                        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
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
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold">{t("nafsulTransaksi.paymentSection")}</h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="hd-potongan-anggota">
              {t("nafsulTransaksi.memberDeduction")}
            </Label>
            <Input
              id="hd-potongan-anggota"
              type="number"
              min={0}
              step="0.01"
              value={header.member_deduction}
              onChange={(e) =>
                setHeader((h) => ({ ...h, member_deduction: e.target.value }))
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
                <Input
                  id="hd-potongan-ketua"
                  type="number"
                  min={0}
                  step="0.01"
                  value={header.group_leader_deduction}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, group_leader_deduction: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hd-jasa-ketua">{t("nafsulTransaksi.leaderFee")}</Label>
                <Input
                  id="hd-jasa-ketua"
                  type="number"
                  min={0}
                  step="0.01"
                  value={header.group_leader_fee}
                  onChange={(e) =>
                    setHeader((h) => ({ ...h, group_leader_fee: e.target.value }))
                  }
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="hd-metode">
              {t("nafsulTransaksi.colMethod")} <span className="text-red-500">*</span>
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
              <option value="transfer">{t("nafsulTransaksi.method_transfer")}</option>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
            <Label htmlFor="hd-payment">
              {t("nafsulTransaksi.paid")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="hd-payment"
              type="number"
              min={0}
              step="0.01"
              value={header.payment}
              onChange={(e) => setHeader((h) => ({ ...h, payment: e.target.value }))}
            />
          </div>
        </div>

        <dl className="mt-4 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">
              {t("nafsulTransaksi.periodsCount", { count: semuaPeriode.length })}
            </dt>
            <dd className="tabular-nums text-slate-900">{rupiah(totalRincian)}</dd>
          </div>
          {totalGratis > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>{t("nafsulTransaksi.freeMonths", { count: totalGratis })}</dt>
              <dd className="tabular-nums">—</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
            <dt className="text-slate-700">{t("nafsulTransaksi.due")}</dt>
            <dd className="tabular-nums text-slate-900">{rupiah(harusDibayar)}</dd>
          </div>
          {header.payment !== "" && sisa !== 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">
                {sisa > 0 ? t("nafsulTransaksi.under") : t("nafsulTransaksi.over")}
              </dt>
              <dd
                className={`tabular-nums font-medium ${
                  sisa > 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {rupiah(Math.abs(sisa))}
              </dd>
            </div>
          )}
          {potongan > totalRincian && (
            <p className="border-t border-slate-200 pt-1.5 text-xs text-red-600">
              {t("nafsulTransaksi.deductionTooBig")}
            </p>
          )}
        </dl>
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

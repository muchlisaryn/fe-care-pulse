"use client"

import { Suspense, useCallback, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ChevronLeft,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Trash2,
  Gift,
  Pencil,
  X,
} from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { NumberInput } from "@/components/atoms/NumberInput"
import { Label } from "@/components/atoms/Label"
import { Select } from "@/components/atoms/Select"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
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
  /**
   * Tunggakan anggota pada tarif ini sampai bulan berjalan; `null` untuk tarif
   * sekali bayar, yang memang tidak punya jadwal periode.
   */
  arrear_months: number | null
  /**
   * Bonus bulan gratis hangus karena tunggakannya melewati 2 bulan.
   *
   * Dikirim server agar hilangnya bonus bisa DITERANGKAN, bukan cuma tampil
   * sebagai "0 bulan gratis" — petugas yang tidak tahu sebabnya akan mengira
   * aplikasinya salah hitung.
   */
  discount_blocked: boolean
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
  /**
   * Potongan ketua kelompok, dalam PERSEN (mis. "10" = 10%).
   *
   * Nominal rupiahnya tidak disimpan di state: potongan dan jasa ketua
   * sama-sama turunan dari persentase ini dikali total rincian, jadi menyimpan
   * salinannya hanya membuka peluang keduanya berselisih.
   */
  group_leader_fee_percent: "",
  payment: "",
  payment_method: "cash" as "cash" | "transfer" | "other",
  /**
   * Tanggal uang diterima — bawaannya HARI INI, karena itu yang benar untuk
   * hampir semua setoran; yang mencatat kuitansi lama tinggal memundurkannya.
   *
   * Dihitung dari waktu LOKAL, bukan `toISOString()` yang memakai UTC: di WIB
   * (UTC+7) setoran sebelum pukul 07.00 akan tercatat mundur satu hari.
   */
  date: hariIni(),
}

/** Tanggal hari ini dalam bentuk "YYYY-MM-DD" menurut zona waktu perangkat. */
function hariIni(): string {
  const d = new Date()
  const bulan = String(d.getMonth() + 1).padStart(2, "0")
  const tanggal = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${bulan}-${tanggal}`
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

/**
 * Batas tunggakan yang memicu peringatan, dalam bulan.
 *
 * Tiga: anggota yang periode terakhirnya tiga bulan di belakang bulan berjalan
 * berarti sudah melewatkan tiga kali iuran, dan itulah titik yang ingin dilihat
 * petugas SEBELUM kuitansinya dibuat — bukan setelahnya lewat laporan.
 */
const BATAS_TUNGGAKAN = 3

/** Balasan `/anggota/{id}/pembayaran-terakhir`. */
interface PembayaranTerakhir {
  periode_terakhir: string | null
  /** Jarak bulan dari periode terakhir ke bulan berjalan; negatif = bayar di muka. */
  bulan_tertinggal: number | null
  pernah_bayar: boolean
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

  // Pembayaran terakhir anggota yang sedang dipilih di baris entri.
  const [bayarTerakhir, setBayarTerakhir] = useState<PembayaranTerakhir | null>(null)
  const [bayarMemuat, setBayarMemuat] = useState(false)
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
  const [resetOpen, setResetOpen] = useState(false)

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
   * Tarik pembayaran terakhir seorang anggota.
   *
   * Dipanggil tiap kali anggota di baris entri berganti. Balasan permintaan
   * LAMA dibuang lewat penanda `aktif`: petugas kerap mengganti pilihan lebih
   * cepat daripada jaringannya menjawab, dan tanpa penjagaan itu keterangan
   * yang tampil bisa milik anggota yang sudah tidak dipilih lagi.
   */
  const ambilBayarTerakhir = useCallback((memberId: string) => {
    if (!memberId) {
      setBayarTerakhir(null)
      setBayarMemuat(false)

      return undefined
    }

    let aktif = true
    setBayarMemuat(true)

    api<PembayaranTerakhir>(`/anggota/${memberId}/pembayaran-terakhir`)
      .then((r) => aktif && setBayarTerakhir(r))
      // Gagal memuat keterangan ini tidak boleh menghalangi pembuatan kuitansi:
      // ia keterangan pendamping, bukan syarat.
      .catch(() => aktif && setBayarTerakhir(null))
      .finally(() => {
        if (aktif) setBayarMemuat(false)
      })

    return () => {
      aktif = false
    }
  }, [])

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
    setBayarTerakhir(null)
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

  /**
   * Kosongkan SELURUH isian form ke keadaan awal.
   *
   * Hanya menyentuh state di browser — tidak ada satu pun permintaan ke server,
   * karena sampai tombol Simpan ditekan memang belum ada apa pun yang tersimpan.
   *
   * Tab dikembalikan ke pilihan yang tercatat di URL, bukan dipaksa ke
   * "kelompok": pengguna yang membuka `?tab=pribadi` mengharapkan reset
   * mengembalikannya ke halaman pribadi yang kosong, bukan berpindah tab.
   */
  function resetForm() {
    if (timer.current) clearTimeout(timer.current)
    permintaan.current++

    setTipe(tipeDariUrl(searchParams.get("tab")))
    setKetua({ kode: "", nama: "" })
    setEntri(entriKosong)
    setBayarTerakhir(null)
    setEditId(null)
    setDaftar([])
    setTerbuka([])
    setHeader(headerKosong)
    setGalat(null)
    setResetOpen(false)
  }

  /** Kosongkan baris isian dan keluar dari mode ubah. */
  function batalkanEntri() {
    if (timer.current) clearTimeout(timer.current)
    // Permintaan yang masih di jalan tidak boleh mengisi baris yang sudah
    // dikosongkan — nomornya dinaikkan supaya balasannya diabaikan.
    permintaan.current++
    setEntri(entriKosong)
    setBayarTerakhir(null)
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
    ambilBayarTerakhir(d.member_id)
  }

  // Semua angka ringkasan diambil dari rencana yang dikirim server, bukan
  // dihitung ulang di sini.
  const semuaPeriode = daftar.flatMap((d) => d.rencana.transactions)
  const totalRincian = semuaPeriode.reduce((j, p) => j + angka(p.total), 0)

  /**
   * Komisi ketua kelompok — CATATAN HAK ketua, bukan pengurang setoran.
   *
   * Sengaja tidak ikut mengurangi "Harus Dibayar": yang disetorkan anggota
   * tidak berkurang hanya karena ketua berhak atas komisi, dan komisinya
   * dibayarkan lewat kas. Karena itu pula bagiannya berdiri sebagai kartu
   * sendiri di bawah ringkasan, bukan menumpang sebagai baris potongan.
   *
   * Sama dengan terapkanJasaKetua() di server, yang mengisi `group_leader_fee`
   * dan menolkan `group_leader_deduction`.
   */
  const jasaKetua =
    tipe === "kelompok"
      ? Math.round(totalRincian * angka(header.group_leader_fee_percent)) / 100
      : 0

  // Nilai kotor sebelum bulan gratis dipotong. `totalRincian` sudah bersih
  // (tiap periode gratis nilainya 0), jadi tanpa angka ini rincian di bawah
  // tidak punya titik awal untuk dikurangi.
  const bruto = semuaPeriode.reduce((j, p) => j + angka(p.amount), 0)

  // Transaksi & diskon sama-sama dirinci per anggota: kuitansi satu kelompok
  // bisa memuat belasan anggota, dan angka gabungan tidak bisa dicocokkan
  // dengan siapa pun saat petugas memeriksa ulang.
  const transaksiPerAnggota = daftar.map((d) => ({
    id: d.id,
    member_number: d.member_number,
    member_name: d.member_name,
    bulan: d.rencana.months,
    nilai: d.rencana.transactions.reduce((j, p) => j + angka(p.amount), 0),
  }))

  const diskonPerAnggota = daftar
    .map((d) => ({
      id: d.id,
      member_number: d.member_number,
      member_name: d.member_name,
      bulan: d.rencana.free_months,
      nilai: d.rencana.transactions.reduce((j, p) => j + angka(p.discount), 0),
    }))
    .filter((d) => d.nilai > 0)

  const totalDiskon = diskonPerAnggota.reduce((j, d) => j + d.nilai, 0)

  /**
   * Yang harus disetorkan = total rincian, titik.
   *
   * `totalRincian` sudah bersih dari potongan bulan gratis (tiap periode gratis
   * nilainya 0), jadi potongan itu TIDAK boleh dikurangkan sekali lagi lewat
   * baris "Potongan Anggota" — angkanya di sana cuma cerminan. Jasa ketua juga
   * tidak mengurangi; lihat catatan di atas.
   *
   * Sama dengan TransactionHeader::getBalanceAttribute() setelah
   * `member_deduction` dan `group_leader_deduction` sama-sama nol.
   */
  const harusDibayar = totalRincian
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

  // Form dianggap terisi bila ada rincian, ada isian yang sedang diketik, atau
  // ada angka pembayaran — ketiganya yang hilang saat direset.
  const adaIsian =
    daftar.length > 0 ||
    entri.member_id !== "" ||
    entri.rate_id !== "" ||
    entri.months !== "" ||
    header.payment !== "" ||
    header.group_leader_fee_percent !== ""

  const siapTambah = entri.rencana !== null && !entri.memuat
  const siapSimpan = daftar.length > 0 && header.payment !== "" && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!siapSimpan) return

    setSaving(true)
    try {
      await api("/transaksi/header", {
        method: "POST",
        body: {
          date: header.date,
          /*
            Potongan anggota selalu NOL dari halaman ini. Angka yang tampil di
            layar hanyalah cerminan potongan bulan gratis, dan potongan itu
            sudah terpotong di tiap baris rincian — mengirimkannya lagi di sini
            membuat server menguranginya untuk kedua kalinya.
          */
          member_deduction_type: "amount",
          member_deduction_input: 0,
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
          <p className="mt-2 text-xs text-slate-500">{t("nafsulTransaksi.typeLocked")}</p>
        )}
      </div>

      {/* ── Rincian iuran ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold">{t("nafsulTransaksi.lines")}</h2>

        {/* Baris isian: dikosongkan lagi setiap kali rinciannya masuk daftar. */}
        {/*
          Kolom "Jumlah Bulan" DIHILANGKAN pada tarif sekali bayar, bukan sekadar
          dikosongkan: tarif itu tidak punya periode, jadi tidak ada yang bisa
          dikalikan. Karena kolomnya benar-benar hilang, template grid-nya ikut
          menyusut — kalau tidak, tombol Tambah jatuh ke petak selebar 9rem.
        */}
        <div
          className={`grid gap-3 lg:items-end ${
            entriSekaliBayar
              ? "lg:grid-cols-[1fr_1fr_auto]"
              : "lg:grid-cols-[1fr_1fr_9rem_auto]"
          }`}
        >
          {tipe === "kelompok" && (
            <div
              className={`space-y-1.5 ${
                entriSekaliBayar ? "lg:col-span-3" : "lg:col-span-4"
              }`}
            >
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
                  ambilBayarTerakhir(v)
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

          {!entriSekaliBayar && (
            <div className="space-y-1.5">
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
            </div>
          )}

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

        {/*
          Keterangan pembayaran terakhir: baris penuh SETELAH grid isian, bukan
          di dalam sel Anggota.

          Grid-nya `lg:items-end` — seluruh isian dirapatkan ke garis bawah yang
          sama. Apa pun yang ditambahkan di bawah salah satu select karenanya
          mendorong select ITU naik sendirian, dan barisnya jadi bertingkat.
          Sebagai baris tersendiri, keterangannya tetap berada tepat di bawah
          pemilih anggota tanpa menggeser apa pun.
        */}
        {entri.member_id !== "" && (bayarMemuat || bayarTerakhir) && (
          <div className="mt-3">
            <PanelBayarTerakhir memuat={bayarMemuat} data={bayarTerakhir} t={t} />
          </div>
        )}

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
            {/*
              Hilangnya bonus DITERANGKAN, bukan dibiarkan tampil sebagai
              ketiadaan: tanpa kalimat ini petugas yang menagih 12 bulan dan
              tidak melihat bulan gratis akan mengira aplikasinya salah hitung.
            */}
            {entri.rencana.discount_blocked && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("nafsulTransaksi.discountBlocked", {
                  months: entri.rencana.arrear_months ?? 0,
                })}
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
        {/*
          Tanggal ditaruh PALING ATAS di kartu ini dan SELEBAR kartunya: ia
          menerangkan kapan uangnya diterima, jadi berlaku untuk seluruh isi
          kartu — bukan milik lajur kiri saja.
        */}
        <div className="space-y-1.5 border-b border-slate-200 px-5 py-4">
          <Label htmlFor="hd-tanggal">
            {t("nafsulTransaksi.colDate")} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="hd-tanggal"
            type="date"
            value={header.date}
            onChange={(e) => setHeader((h) => ({ ...h, date: e.target.value }))}
          />
          <p className="text-xs text-slate-500">{t("nafsulTransaksi.dateHint")}</p>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                Tampilan saja, bukan isian. Potongan anggota bukan lagi angka
                yang dikarang petugas: nilainya selalu total potongan bulan
                gratis dari rincian di atas. Dibiarkan bisa diketik, angkanya
                akan berselisih dengan diskon yang tercatat di baris-baris
                kuitansi yang sama.
              */}
              <div className="space-y-1.5">
                <Label htmlFor="hd-potongan-anggota">
                  {t("nafsulTransaksi.memberDeduction")}
                </Label>
                <div
                  id="hd-potongan-anggota"
                  className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium tabular-nums text-slate-700"
                >
                  {rupiah(totalDiskon)}
                </div>
                <p className="text-xs text-slate-500">
                  {t("nafsulTransaksi.memberDeductionAuto")}
                </p>
              </div>

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
                      payment_method: e.target.value as "cash" | "transfer" | "other",
                    }))
                  }
                >
                  <option value="cash">{t("nafsulTransaksi.method_cash")}</option>
                  <option value="transfer">
                    {t("nafsulTransaksi.method_transfer")}
                  </option>
                  <option value="other">{t("nafsulTransaksi.method_other")}</option>
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

              {/*
                Penanda kecukupan, menempel di bawah kotak isiannya sendiri —
                bukan hanya di ringkasan sebelah. Petugas mengetik angkanya di
                sini, jadi di sini pula kabar "cukup / belum" paling berguna.

                Merah selama masih di bawah total, hijau begitu menutupi atau
                melebihi. Ambangnya `sisa <= 0`, bukan `< 0`, supaya pembayaran
                yang PAS ikut terhitung hijau.
              */}
              {header.payment !== "" && (
                <p
                  className={`text-xs font-medium ${
                    sisa > 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {sisa > 0
                    ? t("nafsulTransaksi.payShort", { amount: rupiah(sisa) })
                    : sisa === 0
                      ? t("nafsulTransaksi.payEnough")
                      : t("nafsulTransaksi.payExtra", { amount: rupiah(-sisa) })}
                </p>
              )}
            </div>
          </div>

          <dl className="h-fit space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm lg:col-span-2">
            {/*
              Tiap kelompok berbentuk blok bertajuk: judul, baris per anggota,
              lalu totalnya di kaki. Angka gabungan tanpa rinciannya tidak bisa
              dicocokkan dengan siapa pun saat petugas memeriksa ulang kuitansi.

              Warna mengikuti arah angkanya — hijau menambah, merah mengurangi —
              supaya sekali lihat sudah ketahuan mana yang memotong.

              Blok hanya dipakai bila anggotanya lebih dari satu; untuk satu
              anggota, rinciannya cuma mengulang angka di judulnya sendiri.
            */}
            {transaksiPerAnggota.length > 1 ? (
              <div className="overflow-hidden rounded-lg border border-emerald-200">
                <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {t("nafsulTransaksi.memberTransactions")}
                </div>
                <ul className="divide-y divide-slate-100">
                  {transaksiPerAnggota.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-[13px] text-slate-600"
                    >
                      <span className="min-w-0 truncate">
                        <span className="tabular-nums text-slate-500">
                          {d.member_number}
                        </span>{" "}
                        {d.member_name}
                        <span className="text-slate-400">
                          {" · "}
                          {t("nafsulTransaksi.monthsCount", { count: d.bulan })}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{rupiah(d.nilai)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between gap-3 border-t border-emerald-200 bg-emerald-50/60 px-3 py-1.5 font-semibold text-emerald-700">
                  <span>{t("nafsulTransaksi.colTotal")}</span>
                  <span className="tabular-nums">+ {rupiah(bruto)}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between gap-3">
                <dt className="text-emerald-700">
                  <span className="mr-1 text-emerald-600/60">(+)</span>
                  {t("nafsulTransaksi.memberTransactions")}
                </dt>
                <dd className="tabular-nums text-emerald-700">+ {rupiah(bruto)}</dd>
              </div>
            )}

            {diskonPerAnggota.length > 1 ? (
              <div className="overflow-hidden rounded-lg border border-red-200">
                <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-red-700">
                  {t("nafsulTransaksi.discount")}
                </div>
                <ul className="divide-y divide-slate-100">
                  {diskonPerAnggota.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-[13px] text-slate-600"
                    >
                      <span className="min-w-0 truncate">
                        <span className="tabular-nums text-slate-500">
                          {d.member_number}
                        </span>{" "}
                        {d.member_name}
                        <span className="text-slate-400">
                          {" · "}
                          {t("nafsulTransaksi.freeInline", { count: d.bulan })}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{rupiah(d.nilai)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between gap-3 border-t border-red-200 bg-red-50/60 px-3 py-1.5 font-semibold text-red-700">
                  <span>{t("nafsulTransaksi.totalDiscount")}</span>
                  <span className="tabular-nums">− {rupiah(totalDiskon)}</span>
                </div>
              </div>
            ) : (
              diskonPerAnggota.length === 1 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-red-700">
                    <span className="mr-1 text-red-600/60">(−)</span>
                    {t("nafsulTransaksi.discount")}
                  </dt>
                  <dd className="tabular-nums text-red-700">− {rupiah(totalDiskon)}</dd>
                </div>
              )
            )}

            {/*
              Potongan anggota TIDAK muncul sebagai baris tersendiri di sini:
              nilainya sama persis dengan blok Diskon di atas, dan menampilkan
              angka yang sama dua kali dengan tanda minus membuatnya terbaca
              seolah dipotong dua kali. Jasa ketua kelompok juga tidak ada di
              sini — ia tidak mengurangi setoran, dan tempatnya di kartu sendiri
              setelah kartu ini.
            */}
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
          </dl>
        </div>
      </div>

      {/*
        ── Potongan ketua kelompok ──

        Kartu tersendiri SETELAH kartu pembayaran, bukan satu baris di dalam
        ringkasan. Angkanya tidak mengurangi setoran — ia mencatat hak ketua —
        jadi menaruhnya berderet dengan potongan yang benar-benar mengurangi
        membuat keduanya terbaca sebagai hal yang sama.
      */}
      {tipe === "kelompok" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 bg-slate-50/60 px-5 py-3.5 font-semibold text-slate-800">
            {t("nafsulTransaksi.leaderDeduction")}
          </h2>

          <div className="grid gap-4 p-5 sm:grid-cols-2">
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
                  // Dibatasi 100 saat diketik, bukan ditolak setelah disimpan:
                  // potongan di atas 100% tidak punya arti, dan nominal di
                  // sebelahnya langsung ikut salah.
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
              <Label htmlFor="hd-jasa-ketua">{t("nafsulTransaksi.leaderFee")}</Label>
              {/*
                Hanya tampilan, bukan isian: nominalnya selalu turunan dari
                persentase × total rincian. Kalau boleh diketik sendiri, angkanya
                bisa berselisih dengan persentase yang tercatat di kuitansi yang
                sama tanpa ada yang tahu mana yang benar.
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

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:col-span-2">
              {t("nafsulTransaksi.leaderFeeNote")}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={!siapSimpan}
          className="bg-[#075489] hover:bg-[#075489]/90 text-white"
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        {/*
          Menggantikan tombol Batal. Jalan kembali ke daftar tetap ada lewat
          tautan "← Transaksi Nafsul" di kepala halaman, jadi tidak ada aksi
          yang hilang.

          Selalu terlihat (dinonaktifkan saat tidak ada isian), bukan
          muncul-hilang: tombol yang berpindah tempat begitu form mulai diisi
          membuat posisinya tidak bisa dihafal.

          Dikonfirmasi dulu — rincian yang sudah dikumpulkan tidak ada di
          database, jadi sekali hilang tidak bisa dipanggil kembali.
        */}
        <Button
          type="button"
          variant="outline"
          onClick={() => setResetOpen(true)}
          disabled={saving || !adaIsian}
          className="text-red-600 hover:bg-red-50 hover:text-red-700 disabled:text-slate-400"
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          {t("nafsulTransaksi.resetForm")}
        </Button>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={resetForm}
        title={t("nafsulTransaksi.resetFormTitle")}
        description={t("nafsulTransaksi.resetFormConfirm", { count: daftar.length })}
        confirmLabel={t("nafsulTransaksi.resetForm")}
      />

      <ResultDialog
        open={galat !== null}
        onClose={() => setGalat(null)}
        variant="error"
        description={galat ?? ""}
      />
    </form>
  )
}

/**
 * Keterangan pembayaran terakhir seorang anggota, dengan peringatan bila
 * tunggakannya sudah mencapai {@link BATAS_TUNGGAKAN} bulan.
 *
 * Tiga rupa, bukan satu kalimat yang warnanya berganti-ganti:
 *
 *  - **belum pernah bayar** — keadaan yang paling perlu dilihat, dan bukan
 *    "tertinggal 0 bulan"; anggota ini tidak punya titik awal sama sekali;
 *  - **tertinggal >= 3 bulan** — peringatan kuning beserta angkanya;
 *  - **lancar / bayar di muka** — keterangan biasa, tanpa warna yang menuntut
 *    perhatian. Anggota yang sudah membayar sampai bulan depan tidak boleh
 *    dibuat terlihat bermasalah.
 *
 * Peringatannya sengaja TIDAK memblokir tombol simpan: petugas memang sering
 * menerima pembayaran justru dari anggota yang menunggak, dan menghalanginya
 * berarti melarang hal yang jadi tujuan halaman ini.
 */
function PanelBayarTerakhir({
  memuat,
  data,
  t,
}: {
  memuat: boolean
  data: PembayaranTerakhir | null
  t: (kunci: string, vars?: Record<string, string | number>) => string
}) {
  if (memuat) {
    return (
      <p className="text-sm text-slate-400">{t("nafsulTransaksi.lastPaymentLoading")}</p>
    )
  }

  if (!data) return null

  if (!data.pernah_bayar) {
    return (
      <div className="inline-flex max-w-full items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("nafsulTransaksi.lastPaymentNever")}</span>
      </div>
    )
  }

  const tertinggal = data.bulan_tertinggal ?? 0
  const menunggak = tertinggal >= BATAS_TUNGGAKAN

  if (menunggak) {
    return (
      <div className="inline-flex max-w-full items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {t("nafsulTransaksi.lastPaymentOverdue", {
            period: data.periode_terakhir ?? "—",
            months: tertinggal,
          })}
        </span>
      </div>
    )
  }

  return (
    <p className="text-sm text-slate-600">
      {t("nafsulTransaksi.lastPaymentOk", { period: data.periode_terakhir ?? "—" })}
    </p>
  )
}

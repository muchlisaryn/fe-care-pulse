"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { NumberInput } from "@/components/atoms/NumberInput"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import TambahRincianModal, {
  type AnggotaTetap,
  type RincianBaru,
} from "@/components/nafsul/TambahRincianModal"
import { useAppDispatch } from "@/lib/store/hooks"
import {
  invalidateTransaksi,
  type TransaksiHeader,
} from "@/lib/store/slices/nafsulTransaksiSlice"
import { api, ApiError } from "@/lib/nafsul/api"
import { useT } from "@/lib/i18n"

/**
 * Pemformat dibuat SEKALI di tingkat modul.
 *
 * `Number.toLocaleString()` menyusun ulang `Intl.NumberFormat` tiap kali
 * dipanggil, dan tabel rincian memanggilnya sekali per sel per render — pada
 * kuitansi kelompok berisi puluhan baris, itu puluhan pemformat baru setiap
 * satu huruf diketik di kartu Pembayaran.
 */
const FORMAT_RUPIAH = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
})

/** Angka desimal dari API ("50000.00") → "Rp 50.000". */
function rupiah(nilai: string | number): string {
  const angka = Number(nilai)
  if (!Number.isFinite(angka)) return "—"
  return `Rp ${FORMAT_RUPIAH.format(angka)}`
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
  /**
   * Key React lokal — `uuid` tidak bisa dipakai karena baris yang baru
   * ditambahkan belum punya satu pun.
   */
  key: string
  /** `null` = baris BARU, belum pernah tersimpan; server akan membuatnya. */
  uuid: string | null
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

/** "MM/YYYY" → indeks bulan berurut, atau `null` untuk baris tak berperiode. */
function indeksPeriode(periode: string | null): number | null {
  if (periode === null) return null
  const [bulan, tahun] = periode.split("/").map(Number)

  return Number.isFinite(bulan) && Number.isFinite(tahun)
    ? tahun * 12 + (bulan - 1)
    : null
}

/**
 * Kunci peta periode. Jadwal iuran berjalan per ANGGOTA PER TARIF — dua tarif
 * milik orang yang sama punya deretan bulannya masing-masing.
 */
const kunciTarif = (memberId: number, rateId: number) => `${memberId}-${rateId}`

/** Rincian satu anggota di dalam formulir, beserta subtotalnya. */
type Kelompok = {
  member_id: number
  nama: string
  nomor: string | null
  /** `i` = posisi baris di `baris`, yang dipakai `ubahBaris`/`setHapusIndex`. */
  isi: { b: BarisForm; i: number }[]
  subtotal: number
}

type HeaderForm = {
  /** "YYYY-MM-DD" — tanggal uang diterima. */
  date: string
  /** Potongan anggota, RUPIAH — satu-satunya bentuknya. */
  member_deduction: string
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
 * Yang BISA diubah: potongan, pembayaran, cara bayar, diskon & periode tiap
 * rincian, membuang rincian, serta MENAMBAH rincian — baik untuk anggota yang
 * sudah ada di kuitansi ini maupun anggota lain yang memenuhi syarat.
 *
 * Yang TIDAK bisa diubah di sini:
 *
 * - NOMINAL sebuah rincian. Angkanya harga tarif yang berlaku, datang dari
 *   master Tarif — bukan angka yang boleh berbeda per kuitansi. Kolomnya
 *   dimatikan, bukan disembunyikan, supaya totalnya tetap bisa diperiksa.
 * - ANGGOTA & TARIF sebuah rincian yang sudah ada. Menggantinya sama saja
 *   dengan rincian yang berbeda; yang keliru dibuang lalu ditambahkan lagi.
 * - JENIS kuitansi dan NOMOR kuitansi. Keduanya menentukan kuitansi ini
 *   kuitansi apa, dan nomornya sudah terbit & tercetak.
 *
 * Rincian hanya boleh dibuang dari PERIODE TERAKHIR tiap tarif — lihat
 * `bolehHapus()`.
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
  /**
   * Menahan Simpan selagi selisih pembayarannya dikonfirmasi.
   *
   * Kuitansi yang kurang/lebih bayar tetap SAH — itu sebabnya ia dikonfirmasi,
   * bukan ditolak. Yang ingin dihindari adalah selisih yang tidak disadari,
   * mis. setelah rincian dibuang dan pembayarannya lupa ikut dibetulkan.
   */
  const [konfirmasiSelisih, setKonfirmasiSelisih] = useState(false)
  /**
   * Modal tambah rincian yang sedang terbuka, beserta anggotanya.
   *
   * `tetap` berisi anggota bila modalnya dibuka dari baris judul kelompok —
   * anggotanya sudah ditentukan oleh tombol yang ditekan. `null` berarti
   * dibuka dari kepala kartu untuk anggota yang belum ada di kuitansi ini,
   * jadi anggotanya masih dipilih di dalam modal.
   *
   * `seri` naik tiap kali modal dibuka dan dipakai sebagai `key`-nya, sehingga
   * isian di dalamnya dipasang ulang dari nol — sisa pilihan dari pembukaan
   * sebelumnya akan menempel pada anggota yang salah.
   */
  const [targetTambah, setTargetTambah] = useState<{
    tetap: AnggotaTetap | null
    seri: number
  } | null>(null)

  /**
   * Anggota yang barusan ditunjuk dari daftar transaksi (`?anggota=`).
   *
   * Dibaca dari `window.location`, bukan `useSearchParams()`: hook itu memaksa
   * seluruh halaman dibungkus <Suspense> saat build, dan yang dibutuhkan di
   * sini cuma satu angka yang dibaca sekali saat halaman dibuka.
   *
   * Dibaca lewat penginisialisasi malas, bukan di dalam useEffect: nilainya
   * tidak pernah berubah setelah halaman terpasang, jadi tidak ada yang perlu
   * disinkronkan. Penjagaan `typeof window` untuk render di server, yang pada
   * saat itu cuma menampilkan keadaan memuat — jadi tidak ada yang berselisih
   * saat dihidrasi.
   */
  const [fokusAnggota] = useState<number | null>(() => {
    if (typeof window === "undefined") return null
    const nilai = new URLSearchParams(window.location.search).get("anggota")
    const id = Number(nilai)

    return nilai && Number.isInteger(id) ? id : null
  })
  const grupRef = useRef<Map<number, HTMLTableSectionElement | null>>(new Map())
  const sudahMenggulir = useRef(false)

  const muat = useCallback(async () => {
    setMemuat(true)
    try {
      const data = await api<TransaksiHeader>(`/transaksi/header/${uuid}`)
      setAsli(data)
      setHeader({
        // Baris lama bisa belum punya tanggal; jatuhkan ke tanggal barisnya
        // dibuat supaya isiannya tidak kosong dan wajib diisi ulang manual.
        date: data.date ?? (data.created_at ?? "").slice(0, 10),
        member_deduction: String(Number(data.member_deduction)),
        group_leader_fee_percent: String(Number(data.group_leader_fee_percent)),
        payment: String(Number(data.payment)),
        payment_method: data.payment_method,
      })
      setBaris(
        (data.transactions ?? []).map((r) => ({
          key: r.uuid,
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
  //
  // `useMemo`: penjumlahan seluruh rincian tidak perlu diulang saat yang
  // berubah cuma isian di kartu Pembayaran.
  const totalRincian = useMemo(
    () =>
      baris.reduce((n, b) => n + Math.max(0, angka(b.amount) - angka(b.discount)), 0),
    [baris],
  )
  const potonganAnggota = Math.round(angka(header?.member_deduction ?? "0") * 100) / 100
  const jasaKetua =
    Math.round(((totalRincian * angka(header?.group_leader_fee_percent ?? "0")) / 100) * 100) / 100
  const kelompok = asli?.transaction_type === "kelompok"
  // Jasa ketua TIDAK ikut mengurangi: ia catatan hak ketua, bukan pengurang
  // setoran. Sama dengan terapkanJasaKetua() di server, yang mengisi
  // `group_leader_fee` dan menolkan `group_leader_deduction`.
  const seharusnya = totalRincian - potonganAnggota
  /**
   * Seharusnya dibayar − yang diterima. Positif = kurang bayar, negatif =
   * lebih bayar, nol = pas.
   *
   * Dibulatkan ke sen sebelum dibandingkan: `totalRincian` hasil penjumlahan
   * pecahan, dan sisa 0,0000001 dari situ akan membuat kuitansi yang sebenarnya
   * pas selalu memicu peringatan selisih.
   */
  const selisih =
    Math.round((seharusnya - angka(header?.payment ?? "0")) * 100) / 100

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
   *
   * Lewat Map, bukan `acc.find()` di dalam reduce: yang kedua menyapu ulang
   * seluruh kelompok untuk setiap baris — kuadratik terhadap jumlah rincian,
   * dan itu terjadi lagi di tiap render.
   *
   * Subtotalnya dijumlahkan di jalan yang sama, bukan lewat penyapuan kedua
   * saat menggambar: keduanya membaca baris yang sama persis.
   */
  const kelompokAnggota = useMemo(() => {
    const peta = new Map<number, Kelompok>()

    baris.forEach((b, i) => {
      let grup = peta.get(b.member_id)

      if (!grup) {
        grup = {
          member_id: b.member_id,
          nama: b.member_name,
          nomor: b.member_number,
          isi: [],
          subtotal: 0,
        }
        peta.set(b.member_id, grup)
      }

      grup.isi.push({ b, i })
      grup.subtotal += Math.max(0, angka(b.amount) - angka(b.discount))
    })

    return Array.from(peta.values())
  }, [baris])

  /**
   * Gulirkan ke rincian anggota yang ditunjuk dari daftar transaksi.
   *
   * Sekali saja (`sudahMenggulir`): tanpa penjaga itu, tiap perubahan isian
   * akan menyeret layar kembali ke kelompok itu selagi petugas mengetik di
   * kartu Pembayaran jauh di bawahnya.
   */
  useEffect(() => {
    if (fokusAnggota === null || sudahMenggulir.current || baris.length === 0) return
    const el = grupRef.current.get(fokusAnggota)
    if (!el) return
    sudahMenggulir.current = true
    el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [fokusAnggota, baris.length])

  /** Buka modal tambah rincian; `seri` memaksa isiannya dipasang ulang. */
  function bukaTambah(tetap: AnggotaTetap | null) {
    setTargetTambah((lama) => ({ tetap, seri: (lama?.seri ?? 0) + 1 }))
  }

  /**
   * Periode TERBESAR per anggota+tarif, dipetakan dari isi formulir.
   *
   * Satu peta untuk dua keperluan sekaligus: membatasi tombol Hapus ke baris
   * terakhir (`bolehHapus`) dan menyambung periode saat menambah rincian
   * (`lanjutanPeriode`). Dulu keduanya menyapu `baris` sendiri-sendiri dengan
   * penguraian "MM/YYYY" masing-masing — dua tempat yang bisa berselisih.
   */
  const periodeTerakhir = useMemo(() => {
    const peta = new Map<string, number>()

    for (const b of baris) {
      const indeks = indeksPeriode(b.payment_period)
      if (indeks === null) continue

      const kunci = kunciTarif(b.member_id, b.rate_id)
      peta.set(kunci, Math.max(peta.get(kunci) ?? indeks, indeks))
    }

    return peta
  }, [baris])

  /**
   * Hanya periode TERAKHIR sebuah tarif yang boleh dibuang.
   *
   * Iuran itu deretan bulan yang bersambung. Membuang bulan di tengahnya
   * meninggalkan lubang — 01, 02, 04 — dan lubang itu tidak pernah terisi
   * sendiri: jadwal berikutnya selalu dihitung dari bulan TERAKHIR yang
   * terbayar, jadi bulan yang bolong terlewat begitu saja dan baru ketahuan
   * bertahun-tahun kemudian saat riwayatnya dibaca.
   *
   * Membuang beberapa bulan sekaligus tetap bisa: buang yang terakhir, lalu
   * yang sebelumnya ikut jadi yang terakhir.
   *
   * Baris tarif SEKALI BAYAR tidak punya periode, jadi tidak ada deretan yang
   * bisa bolong — ia selalu boleh dibuang.
   */
  function bolehHapus(b: BarisForm) {
    const indeks = indeksPeriode(b.payment_period)
    if (indeks === null) return true

    return periodeTerakhir.get(kunciTarif(b.member_id, b.rate_id)) === indeks
  }

  /**
   * Periode pertama yang masih kosong untuk anggota+tarif itu MENURUT
   * FORMULIR — "MM/YYYY", atau `undefined` bila belum ada barisnya di layar.
   *
   * Dikirim modal tambah sebagai `start_period`. Tanpa itu server menghitung
   * dari pembayaran terakhir yang TERSIMPAN, dan baris yang baru ditambahkan di
   * layar ini (atau periode yang barusan dikoreksi manual) belum masuk ke sana
   * — jadwal barunya akan mengulang bulan yang sudah ada di formulir dan
   * ditolak sebagai duplikat saat Simpan ditekan.
   */
  const lanjutanPeriode = useCallback(
    (memberId: string, rateId: string) => {
      const indeks = periodeTerakhir.get(
        kunciTarif(Number(memberId), Number(rateId)),
      )
      if (indeks === undefined) return undefined

      const berikut = indeks + 1

      return `${String((berikut % 12) + 1).padStart(2, "0")}/${Math.floor(berikut / 12)}`
    },
    [periodeTerakhir],
  )

  /**
   * Terima rincian dari modal dan tempelkan ke formulir.
   *
   * Belum tersimpan sampai tombol Simpan ditekan — sama seperti baris yang
   * dihapus di layar ini.
   */
  function terimaRincian(r: RincianBaru) {
    const seri = Date.now()

    setBaris((prev) => [
      ...prev,
      ...r.periode.map((p, i) => ({
        // Baris baru: `uuid` null menandai server harus MEMBUATNYA, bukan
        // memperbarui baris yang sudah ada.
        key: `baru-${seri}-${i}`,
        uuid: null,
        member_id: r.member_id,
        rate_id: r.rate_id,
        member_name: r.member_name,
        member_number: r.member_number,
        rate_name: r.rate_name,
        payment_period: p.payment_period,
        amount: String(Number(p.amount)),
        discount: String(Number(p.discount)),
      })),
    ])
  }

  function hapusBaris() {
    if (hapusIndex === null) return
    setBaris((prev) => prev.filter((_, k) => k !== hapusIndex))
    setHapusIndex(null)
  }

  /**
   * Gerbang tombol Simpan.
   *
   * Selisih pembayaran dikonfirmasi DULU, baru disimpan — selisih yang muncul
   * karena rincian dibuang dan pembayarannya lupa dibetulkan tidak boleh lewat
   * begitu saja. Kalau pas, langsung disimpan tanpa dialog.
   */
  function cobaSimpan() {
    if (!header || !asli || saving) return

    if (baris.length === 0) {
      setGalat(t("nafsulTransaksi.editNoLines"))
      return
    }

    if (selisih !== 0) {
      setKonfirmasiSelisih(true)
      return
    }

    void simpan()
  }

  async function simpan() {
    if (!header || !asli || saving) return

    if (baris.length === 0) {
      setGalat(t("nafsulTransaksi.editNoLines"))
      return
    }

    setKonfirmasiSelisih(false)

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
          member_deduction: angka(header.member_deduction),
          group_leader_fee_percent: kelompok ? angka(header.group_leader_fee_percent) : 0,
          payment: angka(header.payment),
          payment_method: header.payment_method,
          transactions: baris.map((b) => ({
            // `uuid` menandai baris ini SUDAH ADA, jadi server memperbaruinya di
            // tempat — bukan menghapus lalu membuat ulang, yang akan ditolak
            // sendiri oleh pemeriksaan duplikat periode. Baris baru mengirimnya
            // `null`, dan server membuatkannya.
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            {t("nafsulTransaksi.editLinesTitle")}
          </h2>
          {/* Untuk anggota yang BELUM ada di kuitansi ini. Anggota yang sudah
              ada punya tombolnya sendiri di baris judul kelompoknya. */}
          <Button variant="outline" onClick={() => bukaTambah(null)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("nafsulTransaksi.editAddMember")}
          </Button>
        </div>

        <div className="overflow-x-auto">
          {/* `min-w`: kolomnya berisi isian, bukan teks — dimampatkan ke lebar
              ponsel, kotak Nominal & Diskon tinggal selebar dua angka. */}
          <table className="w-full min-w-[720px] text-sm">
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
            {kelompokAnggota.map((g) => (
                <tbody
                  key={g.member_id}
                  ref={(el) => {
                    grupRef.current.set(g.member_id, el)
                  }}
                  className="divide-y divide-gray-100"
                >
                  {/* Kelompok yang ditunjuk dari daftar transaksi diberi garis
                      kiri berwarna — penanda yang cukup untuk menemukannya
                      setelah layar tergulir ke sini, tanpa mengubah warna
                      isiannya seolah-olah barisnya bermasalah. */}
                  <tr
                    className={
                      fokusAnggota === g.member_id
                        ? "bg-[#075489]/[0.06] shadow-[inset_3px_0_0_0_#075489]"
                        : "bg-slate-50/70"
                    }
                  >
                    <th colSpan={6} className="px-3 py-2 text-left">
                      <span className="font-semibold text-gray-900">{g.nama}</span>
                      {g.nomor ? (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {g.nomor}
                        </span>
                      ) : (
                        <span className="ml-2 text-xs font-normal text-gray-400">—</span>
                      )}
                      {/* Tambah rincian UNTUK ANGGOTA INI — anggotanya sudah
                          ditentukan oleh kelompok tempat tombolnya berada, jadi
                          modalnya tinggal menanyakan tarif & jumlah bulan. */}
                      <button
                        type="button"
                        onClick={() =>
                          bukaTambah({
                            member_id: g.member_id,
                            nama: g.nama,
                            nomor: g.nomor,
                          })
                        }
                        title={t("nafsulTransaksi.editAddFor", { member: g.nama })}
                        className="ml-3 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-[#075489] transition-colors hover:bg-[#075489]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#075489]/40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t("common.add")}
                      </button>
                    </th>
                  </tr>

                  {g.isi.map(({ b, i }) => (
                    <tr
                      key={b.key}
                      className={
                        fokusAnggota === g.member_id
                          ? "shadow-[inset_3px_0_0_0_#075489]"
                          : undefined
                      }
                    >
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
                        {/* Nominal DIKUNCI: angkanya harga tarif yang berlaku,
                            datang dari master Tarif — bukan angka yang boleh
                            berbeda per kuitansi. Yang memang boleh berbeda per
                            baris adalah diskonnya, dan kolom itu tetap terbuka
                            di sebelahnya.

                            Dimatikan, bukan disembunyikan: petugas tetap perlu
                            melihat harga yang dipakai baris ini untuk memeriksa
                            totalnya. */}
                        <NumberInput
                          prefix="Rp"
                          value={b.amount}
                          onValueChange={(v) => ubahBaris(i, { amount: v })}
                          disabled
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
                        {/* `title` dipasang di PEMBUNGKUSNYA: atom Button
                            memakai `disabled:pointer-events-none`, jadi tombol
                            yang mati tidak pernah memunculkan keterangannya
                            sendiri — padahal justru di keadaan itulah alasannya
                            perlu dibaca.

                            Dimatikan, bukan disembunyikan: baris ini BISA jadi
                            bisa dihapus begitu periode sesudahnya dibuang, dan
                            tombol yang hilang-muncul tanpa penjelasan lebih
                            membingungkan daripada tombol mati yang menyebutkan
                            aturannya. */}
                        <span
                          title={
                            bolehHapus(b)
                              ? undefined
                              : t("nafsulTransaksi.editRemoveLastOnly")
                          }
                        >
                          <Button
                            size="xs"
                            variant="destructive"
                            aria-label={t("common.delete")}
                            disabled={!bolehHapus(b)}
                            onClick={() => setHapusIndex(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Subtotal ditutup DI BAWAH barisnya, bukan di baris judul:
                      angka yang mendahului baris-baris penyusunnya memaksa
                      pembaca menjumlah sendiri untuk memastikan cocok, dan
                      letaknya di sini juga sejajar dengan kolom Total tiap
                      baris — dua angka yang memang dibandingkan. */}
                  <tr className="border-t-2 border-gray-300 bg-gray-100">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-600">
                      {t("nafsulTransaksi.editSubtotal", { member: g.nama })}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">
                      {rupiah(g.subtotal)}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
            ))}

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

      {/*
        Tambah rincian — dibuka dari baris judul tiap anggota (anggotanya sudah
        ditentukan) atau dari tombol di kepala kartu (anggotanya dipilih di
        sana). Sebagai modal, bukan panel yang selalu terbuka di bawah tabel:
        menambah rincian itu tindakan sesekali, dan formulir yang menetap di
        bawah tabel ikut terbaca sebagai isian yang wajib diisi sebelum Simpan.

        `key` berganti tiap kali dibuka sehingga isiannya dipasang ulang dari
        nol; isiannya sendiri dipegang komponen itu, jadi mengetik di dalamnya
        tidak ikut menggambar ulang tabel rincian di belakangnya.
      */}
      {targetTambah && (
        <TambahRincianModal
          key={targetTambah.seri}
          open
          onClose={() => setTargetTambah(null)}
          tetap={targetTambah.tetap}
          kelompok={kelompok}
          kodeKetua={asli.group_leader_code}
          lanjutanPeriode={lanjutanPeriode}
          onTambah={terimaRincian}
          onGalat={setGalat}
        />
      )}

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
            {/*
              Rupiah saja — pemilih satuan Rp/% dilepas bersama kolom
              `member_deduction_type` & `member_deduction_input` yang dibuang
              dari database. Potongan kini satu angka dengan satu arti.
            */}
            <NumberInput
              id="ed-potongan"
              prefix="Rp"
              value={header.member_deduction}
              onValueChange={(v) => setHeader((h) => (h ? { ...h, member_deduction: v } : h))}
            />
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
          {/*
            Jasa ketua ditulis TANPA tanda minus dan diberi keterangan: ia tidak
            mengurangi apa pun di baris "Harus Dibayar" di bawahnya. Tanda minus
            di sini dulu membuat totalnya terbaca tidak nyambung.
          */}
          {kelompok && (
            <div className="flex justify-between">
              <dt className="text-gray-600">{t("nafsulTransaksi.leaderFee")}</dt>
              <dd className="tabular-nums text-gray-500">{rupiah(jasaKetua)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
            <dt className="text-gray-700">{t("nafsulTransaksi.due")}</dt>
            <dd className="tabular-nums text-gray-900">{rupiah(seharusnya)}</dd>
          </div>
          {/* Selisihnya ditulis di ringkasan, bukan cuma muncul sebagai dialog
              saat Simpan: petugas perlu melihatnya SELAGI membetulkan angkanya,
              bukan setelah menganggap pekerjaannya selesai. Nol tidak
              ditampilkan sama sekali — tidak ada yang perlu diberitahukan. */}
          {selisih !== 0 && (
            <div
              className={`flex justify-between border-t border-gray-200 pt-1.5 font-semibold ${
                selisih > 0 ? "text-rose-600" : "text-amber-600"
              }`}
            >
              <dt>
                {t(
                  selisih > 0
                    ? "nafsulTransaksi.editShortLabel"
                    : "nafsulTransaksi.editExtraLabel",
                )}
              </dt>
              <dd className="tabular-nums">{rupiah(Math.abs(selisih))}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link href="/nafsul/transaksi">
            <Button variant="outline" disabled={saving}>
              {t("common.cancel")}
            </Button>
          </Link>
          <Button
            onClick={cobaSimpan}
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

      {/* Selisih bukan kesalahan — kuitansi yang kurang/lebih bayar tetap sah
          dan memang perlu bisa disimpan. Yang dicegah dialog ini hanyalah
          selisih yang tidak disadari, jadi nadanya bertanya, bukan menolak. */}
      <ConfirmDialog
        open={konfirmasiSelisih}
        onClose={() => setKonfirmasiSelisih(false)}
        onConfirm={simpan}
        loading={saving}
        tone="primary"
        confirmLabel={t("nafsulTransaksi.editBalanceConfirm")}
        title={t("nafsulTransaksi.editBalanceTitle")}
        description={t(
          selisih > 0
            ? "nafsulTransaksi.editBalanceShort"
            : "nafsulTransaksi.editBalanceExtra",
          {
            amount: rupiah(Math.abs(selisih)),
            due: rupiah(seharusnya),
            paid: rupiah(angka(header.payment)),
          },
        )}
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

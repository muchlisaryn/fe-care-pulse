"use client"

import { useCallback, useEffect, useState } from "react"
import { Search, Sheet } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { SelectSearch } from "@/components/atoms/SelectSearch"
import { Button } from "@/components/atoms/Button"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DateRangeFields } from "@/components/molecules/DateRangeFields"
import { Pagination } from "@/components/molecules/Pagination"
import api from "@/lib/axios"
import { downloadXlsx } from "@/lib/excel"
import { useLanguage, localeOf, type Lang } from "@/lib/i18n"

// Detail per aset (unit) di dalam satu label kemasan.
type ReportUnit = {
  id: number
  name: string | null
  unit_code: string | null
  result: string | null
  failed: boolean
}

// Satu baris laporan = satu LABEL KEMASAN (barcode_no) pada satu batch sterilisasi:
// seluruh unit yang dikemas bersama lebur jadi satu baris bernama nama setnya.
// `units` tidak lagi dirender di layar — barisnya datar, hanya menampilkan nama —
// tapi tetap dipakai export CSV yang memang dirinci per aset.
type ReportGroup = {
  key: string
  barcode_no: string | null
  name: string | null
  /** Kode unit — hanya terisi bila label ini memang berisi satu unit. */
  unit_code: string | null
  batch_code: string | null
  method: string | null
  machine: string | null
  cycle_number: string | null
  /** Suhu sterilisasi dalam °C; dikirim sebagai string desimal oleh Laravel. */
  temperature: string | number | null
  duration_minutes: number | null
  operator: string | null
  sterilized_at: string | null
  /** Hasil validasi batch — null bila batch belum divalidasi. */
  chemical_indicator: string | null
  bio_indicator_control: string | null
  bio_indicator_test: string | null
  expiry_date: string | null
  qty: number
  /** Ada unit di bungkus ini yang GAGAL steril (sumber: `sterilization_items.disabled`). */
  failed: boolean
  units: ReportUnit[]
}

const RESULT_OPTIONS = [
  { value: "berhasil", labelKey: "report.resultPassed" },
  { value: "gagal", labelKey: "report.resultFailed" },
]

// Hanya dipakai untuk MENERJEMAHKAN nilai metode di kolom tabel — filter metode sudah
// tidak ada, filternya kini cuma nama + rentang tanggal.
const METHOD_OPTIONS = [
  { value: "uap", labelKey: "report.methodSteam" },
  { value: "eo", labelKey: "report.methodEo" },
  { value: "plasma", labelKey: "report.methodPlasma" },
  { value: "panas_kering", labelKey: "report.methodDryHeat" },
]

const methodLabelKey: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((o) => [o.value, o.labelKey]),
)

/** Nama metode sterilisasi dalam bahasa aktif; nilai tak dikenal tampil apa adanya. */
function methodName(method: string | null, t: (key: string) => string): string {
  if (!method) return "—"
  const key = methodLabelKey[method]
  return key ? t(key) : method
}

function formatDate(value: string | null, lang: Lang): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(localeOf(lang), { day: "2-digit", month: "short", year: "numeric" })
}

/** Waktu steril = tanggal + jam:menit, mis. "05 Agu 2026, 13.00". */
function formatDateTime(value: string | null, lang: Lang): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Suhu batch, mis. "134°C". Nilai desimal bulat ditampilkan tanpa ekor ",00". */
function formatTemperature(value: string | number | null): string {
  if (value === null || value === "") return "—"
  const n = Number(value)
  if (Number.isNaN(n)) return String(value)
  return `${Number.isInteger(n) ? n : n.toFixed(1)}°C`
}

/** Durasi batch dalam menit, mis. "30 mnt". */
function formatDuration(value: number | null, unit: string): string {
  return value === null ? "—" : `${value} ${unit}`
}

/**
 * Tanggal untuk <input type="date"> (YYYY-MM-DD), digeser `offsetDays` hari dari
 * hari ini. Sengaja dirakit dari komponen tanggal LOKAL, bukan `toISOString()`
 * yang memakai UTC — di WIB (UTC+7) cara itu memundurkan tanggal sehari setiap
 * kali halaman dibuka sebelum pukul 07.00.
 */
function dateInput(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Default: batch sterilisasi 30 hari terakhir (H-30 s.d. hari ini). Rentangnya
 * dibandingkan ke `sterilizations.sterilized_at` di server — kolom yang sama
 * dengan yang ditampilkan di kolom "Waktu Steril", jadi hasil saring selalu
 * sejalan dengan yang terbaca di tabel. Filter lain kosong.
 */
function defaultFilters() {
  return {
    search: "",
    machine: "",
    result: "",
    chemical: "",
    bioControl: "",
    bioTest: "",
    dateFrom: dateInput(-30),
    dateTo: dateInput(),
  }
}

type Filters = ReturnType<typeof defaultFilters>

// Indikator biologi hanya bernilai Negatif / Positif (lihat validasi hasil batch).
const BIO_OPTIONS = [
  { value: "Negatif", labelKey: "report.bioNegative" },
  { value: "Positif", labelKey: "report.bioPositive" },
]

/** Opsi kosong = tidak menyaring. Ditulis "-" sesuai tampilan kolomnya di tabel. */
const ANY_LABEL = "-"

export default function LaporanPerAlatPage() {
  const { t, lang } = useLanguage()
  const [rows, setRows] = useState<ReportGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const perPage = 20

  // Filter aktif (yang sudah ditekan "Cari")
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  // Form input sementara
  const [form, setForm] = useState<Filters>(defaultFilters)

  // Pilihan mesin & indikator kimia diambil dari batch yang benar-benar ada (bukan
  // master), supaya nilai yang sudah dinonaktifkan/di-rename tetap bisa dipakai
  // menyaring batch lama — dan tidak ada opsi yang hasilnya pasti kosong.
  const [machines, setMachines] = useState<string[]>([])
  const [chemicals, setChemicals] = useState<string[]>([])

  const buildParams = useCallback(
    (extra: Record<string, string | number> = {}) => ({
      search: filters.search || undefined,
      machine: filters.machine || undefined,
      result: filters.result || undefined,
      chemical_indicator: filters.chemical || undefined,
      bio_indicator_control: filters.bioControl || undefined,
      bio_indicator_test: filters.bioTest || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      ...extra,
    }),
    [filters],
  )

  useEffect(() => {
    let active = true
    ;(async () => {
      // Kedua daftar opsi diambil berbarengan; kegagalan salah satunya tidak
      // menggagalkan yang lain (dropdown-nya cukup tampil tanpa pilihan).
      const [mesin, kimia] = await Promise.all([
        api.get("/master/reports/cssd-machines").catch(() => null),
        api.get("/master/reports/cssd-chemical-indicators").catch(() => null),
      ])
      if (!active) return
      setMachines(mesin?.data?.data ?? [])
      setChemicals(kimia?.data?.data ?? [])
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      // Status memuat di-set di DALAM fungsi async (bukan langsung di body efek) —
      // pola yang sama dengan halaman laporan lain, dan menghindari render berantai.
      setLoading(true)
      try {
        const res = await api.get("/master/reports/cssd-per-item", { params: buildParams({ page }) })
        if (!active) return
        const p = res.data.data
        setRows(p.data)
        setTotalPages(p.last_page)
        setTotalItems(p.total)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [buildParams, page])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setFilters({ ...form })
    setPage(1)
  }

  async function handleExportExcel() {
    setExporting(true)
    try {
      const res = await api.get("/master/reports/cssd-per-item", { params: buildParams({ per_page: 2000 }) })
      const data: ReportGroup[] = res.data.data.data
      const headers = [
        t("report.sterilizedAt"),
        t("report.barcode"),
        t("report.labelName"),
        t("report.instrumentName"),
        // Warna baris tidak terbawa ke file, jadi berhasil/gagal ditulis eksplisit.
        t("common.status"),
        t("report.machine"),
        t("report.method"),
        t("report.cycleNo"),
        t("report.temperature"),
        t("report.duration"),
        t("report.chemicalIndicator"),
        t("report.bioControlFull"),
        t("report.bioTestFull"),
        t("report.operator"),
        t("report.expiry"),
      ]
      // Isi file tetap per aset (per unit): baris gabungan diuraikan jadi baris-baris unitnya.
      const rows = data.flatMap((g) =>
        g.units.map((u) => [
          formatDateTime(g.sterilized_at, lang),
          g.barcode_no ?? "",
          g.name ?? "",
          u.name ?? "",
          u.failed ? t("report.resultFailed") : t("report.resultPassed"),
          g.machine ?? "",
          g.method ? methodName(g.method, t) : "",
          g.cycle_number ?? "",
          g.temperature === null ? "" : formatTemperature(g.temperature),
          g.duration_minutes === null ? "" : formatDuration(g.duration_minutes, t("common.minutesShort")),
          // Batch yang belum divalidasi ditulis "-" (bukan sel kosong) supaya jelas
          // memang tidak ada nilainya, bukan kolomnya yang bergeser.
          g.chemical_indicator ?? "-",
          g.bio_indicator_control ?? "-",
          g.bio_indicator_test ?? "-",
          g.operator ?? "",
          formatDate(g.expiry_date, lang),
        ]),
      )
      downloadXlsx(
        `${t("report.fileName")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        t("report.sheetName"),
        headers,
        rows,
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("report.title")}
        subtitle={t("report.subtitle")}
      />

      <Card className="p-0">
        {/* Filter */}
        <form onSubmit={handleSearch} className="border-b border-gray-100 px-5 py-4">
          {/* Delapan filter dibagi dua baris berisi 6 kolom yang sama-sama penuh:
              BARIS 1 — kotak pencarian selebar empat kolom (isinya teks bebas, jadi
              paling butuh ruang) lalu rentang tanggal di dua kolom terakhir.
              BARIS 2 — pilihan bernilai tetap yang cukup sempit: mesin, status, dan
              ketiga indikator hasil validasi, ditutup tombol Reset & Cari.
              Di layar sedang jadi dua kolom per baris, di ponsel menumpuk. */}
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("report.instrumentName")}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder={t("report.searchInstrument")}
                  value={form.search}
                  onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <DateRangeFields
              fromLabel={t("report.fromDate")}
              toLabel={t("report.toDate")}
              from={form.dateFrom}
              to={form.dateTo}
              onFromChange={(v) => setForm((f) => ({ ...f, dateFrom: v }))}
              onToChange={(v) => setForm((f) => ({ ...f, dateTo: v }))}
            />

            {/* ── Baris 2: pilihan mesin/status + indikator hasil validasi ───── */}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("report.machine")}</label>
              {/* Opsi bernilai kosong = kembali ke semua mesin (SelectSearch di app ini
                  tidak punya tombol clear sendiri). */}
              <SelectSearch
                options={[
                  { value: "", label: t("report.allMachines") },
                  ...machines.map((m) => ({ value: m, label: m })),
                ]}
                value={form.machine}
                onChange={(v) => setForm((f) => ({ ...f, machine: v }))}
                placeholder={t("report.allMachines")}
                searchPlaceholder={t("report.searchMachine")}
                triggerClassName="py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("common.status")}</label>
              <Select value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>
                <option value="">{t("report.allStatuses")}</option>
                {RESULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("report.chemicalIndicator")}
              </label>
              <SelectSearch
                options={[
                  { value: "", label: ANY_LABEL },
                  ...chemicals.map((c) => ({ value: c, label: c })),
                ]}
                value={form.chemical}
                onChange={(v) => setForm((f) => ({ ...f, chemical: v }))}
                placeholder={ANY_LABEL}
                searchPlaceholder={t("report.searchLot")}
                triggerClassName="py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("report.bioControl")}
              </label>
              <Select
                value={form.bioControl}
                onChange={(e) => setForm((f) => ({ ...f, bioControl: e.target.value }))}
              >
                <option value="">{ANY_LABEL}</option>
                {BIO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("report.bioTest")}
              </label>
              <Select
                value={form.bioTest}
                onChange={(e) => setForm((f) => ({ ...f, bioTest: e.target.value }))}
              >
                <option value="">{ANY_LABEL}</option>
                {BIO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </Select>
            </div>

            {/* Tombol Cari menutup baris kedua — sebaris dengan filter lain, dan
                kedua baris grid sama-sama terisi penuh 6 kolom tanpa sel menganga. */}
            <Button
              type="submit"
              className="w-full justify-center bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              <Search className="h-4 w-4" />
              {t("common.search")}
            </Button>
          </div>

          {/* Export berdiri di bawah filter: yang diunduh adalah SELURUH data sesuai
              filter yang sedang aktif, bukan halaman yang sedang tampil saja. */}
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportExcel}
              disabled={exporting}
              className="w-full justify-center sm:w-auto"
            >
              <Sheet className="h-4 w-4" />
              {exporting ? t("report.exporting") : t("report.exportExcel")}
            </Button>
          </div>
        </form>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("report.noData")}</div>
        ) : (
          <>
            {/* Mobile: tiap baris jadi kartu (label : nilai) agar tak terpotong. */}
            <div className="space-y-3 p-4 md:hidden">
              {rows.map((g) => (
                <ReportCard key={g.key} group={g} />
              ))}
            </div>
            {/* Desktop: kolomnya banyak, jadi tabel diberi lebar minimum dan
                pembungkusnya digeser horizontal — lebih baik digeser daripada kolom
                terhimpit sampai teksnya terpotong. */}
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.sterilizedAt")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.barcode")}</th>
                  {/* Kolom terpanjang isinya (nama set bisa panjang) — diberi lantai
                      lebar sendiri supaya tidak ikut menyusut saat kolom lain melebar. */}
                  <th className="min-w-[340px] py-2.5 px-4 text-left">{t("report.instrumentName")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.machine")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.method")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.cycleNo")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.temperature")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.duration")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.chemicalIndicator")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.bioControl")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.bioTest")}</th>
                  <th className="whitespace-nowrap py-2.5 px-4 text-left">{t("report.expiry")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((g) => (
                  <ReportRows key={g.key} group={g} />
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={perPage}
          onPageChange={setPage}
        />
      </Card>
    </div>
  )
}

/** Nilai indikator batch; batch yang belum divalidasi tidak pernah tampil kosong. */
function IndicatorValue({ value }: { value: string | null }) {
  return value ? <>{value}</> : <span className="text-xs text-gray-400">—</span>
}

/**
 * Satu baris laporan = satu label kemasan, ditampilkan sebagai satu baris datar.
 * Baris set TIDAK bisa dibuka: yang perlu terlihat cukup nama setnya. Rincian tiap
 * unit di dalamnya tetap tersedia lewat export CSV (yang memang per aset).
 */
function ReportRows({ group: g }: { group: ReportGroup }) {
  const { t, lang } = useLanguage()
  // Bungkus yang gagal steril tetap dilaporkan, hanya ditandai merah — laporan ini
  // juga dipakai menelusuri kegagalan, jadi barisnya tidak boleh disembunyikan.
  return (
    <tr className={g.failed ? "bg-red-50/70" : ""}>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">{formatDateTime(g.sterilized_at, lang)}</td>
      <td className="whitespace-nowrap py-2.5 px-4">
        {g.barcode_no ? (
          <span className="font-mono text-xs text-gray-700">{g.barcode_no}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="min-w-[340px] py-2.5 px-4">
        <span className="font-medium text-gray-900">{g.name ?? "—"}</span>
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">{g.machine ?? "—"}</td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        {methodName(g.method, t)}
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 font-mono text-xs text-gray-700">
        {g.cycle_number ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 tabular-nums text-gray-700">
        {formatTemperature(g.temperature)}
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 tabular-nums text-gray-700">
        {formatDuration(g.duration_minutes, t("common.minutesShort"))}
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <IndicatorValue value={g.chemical_indicator} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <IndicatorValue value={g.bio_indicator_control} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-700">
        <IndicatorValue value={g.bio_indicator_test} />
      </td>
      <td className="whitespace-nowrap py-2.5 px-4 text-gray-600">{formatDate(g.expiry_date, lang)}</td>
    </tr>
  )
}

// Versi kartu (mobile) dari satu baris laporan: header berisi nama + barcode, lalu
// daftar field label:nilai. Sama seperti versi tabel, kartunya tidak bisa dibuka.
function ReportCard({ group: g }: { group: ReportGroup }) {
  const { t, lang } = useLanguage()
  return (
    <div
      className={
        "overflow-hidden rounded-xl border shadow-sm " +
        // Penanda gagal versi kartu — sepadan dengan baris merah di tabel.
        (g.failed ? "border-red-200 bg-red-50/60" : "border-gray-200 bg-white")
      }
    >
      <div className="flex w-full items-start gap-2 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-gray-900">{g.name ?? "—"}</span>
          {g.barcode_no && (
            <span className="block font-mono text-xs text-gray-500">{g.barcode_no}</span>
          )}
        </div>
        {g.failed && (
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
            {t("report.resultFailed")}
          </span>
        )}
      </div>

      <dl className="divide-y divide-gray-50 border-t border-gray-100">
        <ReportField label={t("report.sterilizedAt")}>{formatDateTime(g.sterilized_at, lang)}</ReportField>
        <ReportField label={t("report.machine")}>{g.machine ?? "—"}</ReportField>
        <ReportField label={t("report.method")}>{methodName(g.method, t)}</ReportField>
        <ReportField label={t("report.cycleNo")}>{g.cycle_number ?? "—"}</ReportField>
        <ReportField label={t("report.temperature")}>{formatTemperature(g.temperature)}</ReportField>
        <ReportField label={t("report.duration")}>
          {formatDuration(g.duration_minutes, t("common.minutesShort"))}
        </ReportField>
        <ReportField label={t("report.chemicalIndicator")}>
          <IndicatorValue value={g.chemical_indicator} />
        </ReportField>
        <ReportField label={t("report.bioControl")}>
          <IndicatorValue value={g.bio_indicator_control} />
        </ReportField>
        <ReportField label={t("report.bioTest")}>
          <IndicatorValue value={g.bio_indicator_test} />
        </ReportField>
        <ReportField label={t("report.expiry")}>{formatDate(g.expiry_date, lang)}</ReportField>
      </dl>
    </div>
  )
}

function ReportField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-gray-800">{children}</dd>
    </div>
  )
}

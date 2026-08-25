"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Boxes, CalendarClock, Clock, MapPin, Search } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { StatCard } from "@/components/molecules/StatCard"
import { PageHeader } from "@/components/molecules/PageHeader"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Pagination } from "@/components/molecules/Pagination"
import { ExpiryCard } from "@/components/molecules/ExpiryCard"
import { RepackageModal } from "@/components/molecules/RepackageModal"
import { useToast } from "@/components/molecules/ToastProvider"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchSterileExpiry,
  fetchSterileExpirySummary,
  type SterileExpiryBatch,
} from "@/lib/store/slices/sterileExpirySlice"
import { useT } from "@/lib/i18n"

const ITEMS_PER_PAGE = 20

export default function KedaluwarsaPage() {
  const dispatch = useAppDispatch()
  const { items, page, lastPage, total, loading, summary } = useAppSelector((s) => s.sterileExpiry)
  const t = useT()
  const toast = useToast()
  const router = useRouter()

  // Batch yang sedang dibuka dialog "Packaging Ulang"-nya (null = tertutup).
  const [repacking, setRepacking] = useState<SterileExpiryBatch | null>(null)

  // Ambang hari & kata kunci yang SUDAH dikirim ke server; `*Input` adalah draft
  // di kotak isian (baru dipakai saat tombol ditekan / form disubmit).
  const [days, setDays] = useState(7)
  const [daysInput, setDaysInput] = useState("7")
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")

  // Penyaringan & penomoran halaman seluruhnya di server — halaman ini tidak
  // pernah menghitung ulang di klien supaya angkanya tidak beda dengan Storage Steril.
  useEffect(() => {
    dispatch(fetchSterileExpiry({ page: 1, search, days }))
    dispatch(fetchSterileExpirySummary({ days }))
  }, [dispatch, search, days])

  function applyDays(e: React.FormEvent) {
    e.preventDefault()
    setDays(Math.max(0, Number(daysInput) || 0))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
  }

  function changePage(next: number) {
    dispatch(fetchSterileExpiry({ page: next, search, days }))
  }

  /**
   * Selesai menarik label dari rak. Daftar & kartu statistik diambil ulang karena
   * baris yang ditarik sudah tidak lagi terhitung stok gudang — kalau tidak, angka
   * di layar tertinggal dan tombolnya bisa ditekan lagi untuk batch yang sama.
   *
   * Halaman selalu kembali ke 1: batch yang isinya habis ditarik lenyap dari daftar,
   * sehingga halaman terakhir bisa jadi tidak ada lagi.
   */
  function handleRepacked(result: { labels: number; units: number; packagings: string[] }) {
    setRepacking(null)
    dispatch(fetchSterileExpiry({ page: 1, search, days }))
    dispatch(fetchSterileExpirySummary({ days }))
    toast.success(
      t("expiry.repackDone", {
        units: result.units,
        labels: result.labels,
        codes: result.packagings.join(", "),
      }),
    )
    router.push("/cssd/produksi?tab=packaging")
  }

  const columns: Column<SterileExpiryBatch>[] = [
    {
      header: t("expiry.colBatchCode"),
      cell: (b) =>
        b.code ? (
          <span className="font-mono text-xs font-semibold text-[#075489] bg-[#075489]/8 px-2 py-1 rounded">
            {b.code}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
      className: "w-28",
    },
    {
      header: t("expiry.colMachine"),
      cell: (b) =>
        b.machine ? (
          <span className="text-gray-700">{b.machine}</span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      header: t("expiry.colRack"),
      cell: (b) =>
        b.racks.length ? (
          <span className="flex flex-wrap gap-1">
            {b.racks.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
              >
                <MapPin className="h-3 w-3" />
                {r}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      /**
       * Jumlah unit memakai aturan yang sama dengan Storage Steril: satu SET dihitung
       * 1 (bukan per instrumen di dalamnya) dan satu instrumen satuan dihitung 1.
       * Rinciannya ("2 set · 3 satuan") ditulis di bawah angkanya.
       */
      header: t("expiry.colUnitCount"),
      cell: (b) => (
        <div className="leading-tight">
          <span className="font-semibold text-gray-900">
            {b.item_count} <span className="text-xs font-normal text-gray-400">{t("common.units")}</span>
          </span>
          <div className="mt-0.5 text-xs text-gray-400">
            {[
              b.set_count > 0 ? t("expiry.setsSuffix", { n: b.set_count }) : null,
              b.unit_count > 0 ? t("expiry.singlesSuffix", { n: b.unit_count }) : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
        </div>
      ),
      className: "w-32",
    },
    {
      header: t("expiry.colExpiry"),
      cell: (b) => (
        <ExpiryCard
          date={b.expiry_date}
          daysToExpiry={b.days_to_expiry}
          expired={b.expired}
          alert={b.alert}
         
        />
      ),
    },
    {
      header: t("expiry.colRemaining"),
      cell: (b) => {
        if (b.days_to_expiry === null) return <span className="text-gray-400 text-xs">—</span>
        return b.days_to_expiry < 0 ? (
          <Badge variant="danger">{t("expiry.daysOverdue", { n: Math.abs(b.days_to_expiry) })}</Badge>
        ) : b.days_to_expiry === 0 ? (
          <Badge variant="danger">{t("expiry.today")}</Badge>
        ) : (
          <Badge variant="warning">{t("expiry.daysLeft", { n: b.days_to_expiry })}</Badge>
        )
      },
      className: "w-32",
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("expiry.title")}
        subtitle={t("expiry.subtitle")}
      />

      {/* Angka dari server (seluruh data), bukan dari baris halaman yang sedang tampil.
          Instrumen dihitung dengan aturan set = 1 & satuan = 1, sama dengan Storage Steril. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("expiry.statBatches")} value={`${summary.batches}`} icon={Boxes} />
        <StatCard title={t("expiry.statUnits")} value={`${summary.items}`} icon={CalendarClock} />
        <StatCard title={t("expiry.statExpired")} value={`${summary.expired}`} icon={AlertTriangle} positive={false} />
        <StatCard title={t("expiry.statAlert")} value={`${summary.alert}`} icon={Clock} positive={false} />
      </div>

      <Card className="p-0">
        <div className="space-y-3 border-b border-gray-100 px-5 py-4">
          <form onSubmit={handleSearch} className="flex w-full gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder={t("expiry.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
              {t("common.search")}
            </Button>
          </form>

          <form onSubmit={applyDays} className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("expiry.thresholdLabel")}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={daysInput}
                onChange={(e) => setDaysInput(e.target.value)}
                className="w-28"
              />
              <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white">
                {t("expiry.apply")}
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {t("expiry.thresholdHint", { days })}
            </p>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t("common.loading")}</div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            emptyMessage={t("expiry.empty")}
            rowNumberOffset={(page - 1) * ITEMS_PER_PAGE}
            extraActions={[
              {
                label: t("expiry.repackAction"),
                onClick: (b) => setRepacking(b),
                // Hanya batch yang SUDAH kedaluwarsa yang bisa ditarik, dan baris
                // gudang lama tanpa batch steril (id 0) tidak punya jejak ke kemasan
                // asalnya sehingga ronde barunya tak bisa dirangkai — server juga
                // menolaknya, tombolnya dimatikan di sini supaya tidak menyesatkan.
                disabled: (b) => !b.expired || b.id <= 0,
              },
            ]}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={lastPage}
          totalItems={total}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={changePage}
        />
      </Card>

      <RepackageModal
        batch={repacking}
        days={days}
        onClose={() => setRepacking(null)}
        onDone={handleRepacked}
      />
    </div>
  )
}

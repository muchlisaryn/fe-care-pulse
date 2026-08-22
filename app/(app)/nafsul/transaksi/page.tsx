"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, Upload, Wallet } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { Card } from "@/components/molecules/Card"
import { DataTable, type Column } from "@/components/molecules/DataTable"
import { Modal } from "@/components/molecules/Modal"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { ResultDialog } from "@/components/molecules/ResultDialog"
import ImportTransaksiModal from "@/components/nafsul/ImportTransaksiModal"
import { Pagination } from "@/components/molecules/Pagination"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import {
  fetchTransaksi,
  setTransaksiSearch,
  setTransaksiPaymentMethod,
  setTransaksiPage,
  invalidateTransaksi,
  PER_PAGE,
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

export default function NafsulTransaksiPage() {
  const t = useT()
  const dispatch = useAppDispatch()
  const {
    items,
    totalItems,
    totalPages,
    page,
    search,
    paymentMethod,
    loading,
    loaded,
    dirty,
  } = useAppSelector((s) => s.nafsulTransaksi)

  const [searchInput, setSearchInput] = useState(search)
  const [metodeInput, setMetodeInput] = useState(paymentMethod)

  const [galat, setGalat] = useState<string | null>(null)
  const [imporTerbuka, setImporTerbuka] = useState(false)

  const [detail, setDetail] = useState<TransaksiHeader | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TransaksiHeader | null>(null)
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null)

  const [resetTarget, setResetTarget] = useState<TransaksiHeader | null>(null)
  const [resettingUuid, setResettingUuid] = useState<string | null>(null)
  const [pesanSukses, setPesanSukses] = useState<string | null>(null)

  useEffect(() => {
    if (loaded && !dirty) return
    dispatch(fetchTransaksi())
  }, [loaded, dirty, dispatch])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    dispatch(setTransaksiSearch(searchInput))
    dispatch(setTransaksiPaymentMethod(metodeInput))
  }

  async function openDetail(row: TransaksiHeader) {
    setDetail(row)
    setDetailLoading(true)
    try {
      // Daftar tidak membawa rincian (hanya jumlahnya) — diambil saat dibuka.
      const lengkap = await api<TransaksiHeader>(`/transaksi/header/${row.uuid}`)
      setDetail(lengkap)
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"))
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deletingUuid !== null) return
    setDeletingUuid(deleteTarget.uuid)
    try {
      await api(`/transaksi/header/${deleteTarget.uuid}`, { method: "DELETE" })
      dispatch(invalidateTransaksi())
      setDeleteTarget(null)
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"))
    } finally {
      setDeletingUuid(null)
    }
  }

  /**
   * Kembalikan kuitansi ke keadaan belum dibayar.
   *
   * Rinciannya dilepas jadi tagihan lagi dan kuitansinya dihapus — perhitungan
   * lengkapnya di server, di sini cukup menyegarkan daftarnya.
   */
  async function handleReset() {
    if (!resetTarget || resettingUuid !== null) return
    setResettingUuid(resetTarget.uuid)
    try {
      const hasil = await api<{ message: string }>(
        `/transaksi/header/${resetTarget.uuid}/reset`,
        { method: "POST" }
      )
      dispatch(invalidateTransaksi())
      setResetTarget(null)
      setPesanSukses(hasil.message)
    } catch (e) {
      setGalat((e as ApiError).message ?? t("nafsulTransaksi.saveFailed"))
    } finally {
      setResettingUuid(null)
    }
  }

  const columns: Column<TransaksiHeader>[] = [
    {
      header: t("nafsulTransaksi.colNumber"),
      cell: (row) => (
        <span className="font-medium tabular-nums text-gray-900">
          {row.transaction_number}
        </span>
      ),
    },
    {
      header: t("nafsulTransaksi.colType"),
      cell: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.transaction_type === "pribadi"
              ? "bg-slate-100 text-slate-700"
              : "bg-[#075489]/10 text-[#075489]"
          }`}
        >
          {t(`nafsulTransaksi.tab_${row.transaction_type}`)}
        </span>
      ),
    },
    {
      header: t("nafsulTransaksi.colLines"),
      cell: (row) => (
        <span className="text-gray-700">
          {t("nafsulTransaksi.linesCount", { count: row.transactions_count })}
        </span>
      ),
    },
    {
      header: t("nafsulTransaksi.colTotal"),
      className: "text-right",
      cell: (row) => (
        <span className="tabular-nums text-gray-700">{rupiah(row.total)}</span>
      ),
    },
    {
      header: t("nafsulTransaksi.colPayment"),
      className: "text-right",
      cell: (row) => (
        <span className="font-semibold tabular-nums text-gray-900">
          {rupiah(row.payment)}
        </span>
      ),
    },
    {
      header: t("nafsulTransaksi.colMethod"),
      cell: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.payment_method === "cash"
              ? "bg-amber-50 text-amber-700"
              : "bg-sky-50 text-sky-700"
          }`}
        >
          {t(`nafsulTransaksi.method_${row.payment_method}`)}
        </span>
      ),
    },
    {
      header: t("nafsulTransaksi.colBalance"),
      className: "text-right",
      cell: (row) => {
        const nilai = Number(row.balance)
        if (nilai === 0) {
          return <span className="text-xs text-gray-400">{t("nafsulTransaksi.settled")}</span>
        }
        return (
          <span
            className={`tabular-nums font-medium ${
              nilai > 0 ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {rupiah(Math.abs(nilai))}
            <span className="ml-1 text-[11px] font-normal">
              {nilai > 0 ? t("nafsulTransaksi.under") : t("nafsulTransaksi.over")}
            </span>
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("nafsulTransaksi.title")}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {t("nafsulTransaksi.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImporTerbuka(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t("nafsulMaster.importExcel")}
          </Button>
          <Link href="/nafsul/transaksi/baru">
            <Button className="bg-[#075489] hover:bg-[#075489]/90 text-white">
              {t("nafsulTransaksi.add")}
            </Button>
          </Link>
        </div>
      </div>

      <ImportTransaksiModal
        open={imporTerbuka}
        onClose={() => setImporTerbuka(false)}
        // Daftar di-cache Redux; tanpa ini kuitansi hasil impor tidak muncul
        // sampai halaman dibuka ulang.
        onSelesai={() => dispatch(invalidateTransaksi())}
      />

      <Card className="p-0">
        <div className="border-b border-gray-100 px-5 py-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={t("nafsulTransaksi.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              aria-label={t("nafsulTransaksi.colMethod")}
              value={metodeInput}
              onChange={(e) => setMetodeInput(e.target.value)}
              className="sm:w-44"
            >
              <option value="">{t("nafsulTransaksi.allMethods")}</option>
              <option value="cash">{t("nafsulTransaksi.method_cash")}</option>
              <option value="transfer">{t("nafsulTransaksi.method_transfer")}</option>
            </Select>
            <Button
              type="submit"
              className="shrink-0 bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {t("common.search")}
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {t("common.loading")}
          </div>
        ) : (
          <DataTable
            rowNumberOffset={(page - 1) * PER_PAGE}
            columns={columns}
            data={items}
            extraActions={[
              { label: t("nafsulTransaksi.view"), onClick: openDetail },
              {
                label: t("nafsulTransaksi.reset"),
                onClick: (row) => setResetTarget(row),
                className: "text-amber-700 hover:bg-amber-50",
              },
            ]}
            onDelete={(row) => setDeleteTarget(row)}
            isRowLoading={(row) =>
              deletingUuid === row.uuid || resettingUuid === row.uuid
            }
            emptyMessage={t("nafsulTransaksi.empty")}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={PER_PAGE}
          onPageChange={(p) => dispatch(setTransaksiPage(p))}
        />
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletingUuid !== null}
      />

      {/*
        Akibat reset dijabarkan apa adanya di dialognya: tindakan ini melepas
        rincian DAN menghapus kuitansinya, dan tidak ada tombol urung.
      */}
      <ConfirmDialog
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        onConfirm={handleReset}
        loading={resettingUuid !== null}
        title={t("nafsulTransaksi.resetTitle")}
        description={t("nafsulTransaksi.resetConfirm", {
          number: resetTarget?.transaction_number ?? "",
          lines: resetTarget?.transactions_count ?? 0,
        })}
      />

      <ResultDialog
        open={pesanSukses !== null}
        onClose={() => setPesanSukses(null)}
        variant="success"
        description={pesanSukses ?? ""}
      />

      <ResultDialog
        open={galat !== null}
        onClose={() => setGalat(null)}
        variant="error"
        description={galat ?? ""}
      />

      {/* ── Detail kuitansi ── */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={`${t("nafsulTransaksi.detailTitle")} ${detail?.transaction_number ?? ""}`}
        size="lg"
        panelClassName="max-w-3xl"
        footer={
          <Button variant="outline" onClick={() => setDetail(null)}>
            {t("common.close")}
          </Button>
        }
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">
            {t("common.loading")}
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">{t("nafsulTransaksi.member")}</th>
                    <th className="px-3 py-2">{t("nafsulTransaksi.rate")}</th>
                    <th className="px-3 py-2">{t("nafsulTransaksi.colPeriod")}</th>
                    <th className="px-3 py-2 text-right">{t("nafsulTransaksi.amount")}</th>
                    <th className="px-3 py-2 text-right">{t("nafsulTransaksi.discount")}</th>
                    <th className="px-3 py-2 text-right">{t("nafsulTransaksi.colTotal")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(detail.transactions ?? []).map((r) => (
                    <tr key={r.uuid}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{r.member_name}</div>
                        {r.member_number ? (
                          <div className="text-xs text-gray-500">{r.member_number}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.rate_name}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">
                        {r.payment_period}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {rupiah(r.amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {Number(r.discount) > 0 ? rupiah(r.discount) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">
                        {rupiah(r.total)}
                      </td>
                    </tr>
                  ))}
                  {(detail.transactions ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">
                        {t("nafsulTransaksi.noLines")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <dl className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              {[
                [t("nafsulTransaksi.colTotal"), detail.total],
                [t("nafsulTransaksi.memberDeduction"), `-${detail.member_deduction}`],
                [t("nafsulTransaksi.leaderDeduction"), `-${detail.group_leader_deduction}`],
                [t("nafsulTransaksi.leaderFee"), `+${detail.group_leader_fee}`],
              ].map(([label, nilai]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-gray-600">{label}</dt>
                  <dd className="tabular-nums text-gray-900">
                    {String(nilai).startsWith("-")
                      ? `− ${rupiah(String(nilai).slice(1))}`
                      : String(nilai).startsWith("+")
                        ? `+ ${rupiah(String(nilai).slice(1))}`
                        : rupiah(String(nilai))}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
                <dt className="text-gray-700">
                  {t("nafsulTransaksi.paid")} ({t(`nafsulTransaksi.method_${detail.payment_method}`)})
                </dt>
                <dd className="tabular-nums text-gray-900">{rupiah(detail.payment)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>

    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Modal } from "@/components/molecules/Modal"
import { Button } from "@/components/atoms/Button"
import { TrendChart, type TrendPoint } from "@/components/molecules/TrendChart"
import {
  StackedBarChart,
  type StackedPoint,
  type StackedSeries,
} from "@/components/molecules/StackedBarChart"
import { useT } from "@/lib/i18n"
import api from "@/lib/axios"

type PreviewChartBase = {
  title: string
  formatValue?: (n: number) => string
  formatAxis?: (n: number) => string
  emptyLabel: string
}

/**
 * Grafik intip — bentuknya mengikuti grafik di halaman aslinya.
 *
 * `kind` boleh dilewatkan untuk grafik tren satu seri (bentuk yang paling
 * banyak dipakai) supaya pemanggil lama tidak perlu diubah.
 */
export type PreviewChart =
  | (PreviewChartBase & { kind?: "trend"; variant: "bar" | "line"; data: TrendPoint[] })
  | (PreviewChartBase & {
      kind: "stacked"
      series: StackedSeries[]
      data: StackedPoint[]
      otherKey?: string
      totalLabel?: string
    })

/** Bentuk ringkas yang dipahami modal ini — hasil pemetaan respons dashboard. */
export type DashboardPreview = {
  stats: { label: string; value: string; hint?: string }[]
  chart?: PreviewChart
}

type DashboardPreviewModalProps = {
  open: boolean
  onClose: () => void
  title: string
  /** Endpoint dashboard yang diintip, mis. "/cssd/dashboard". */
  endpoint: string
  /**
   * Pengubah respons mentah jadi bentuk ringkas di atas.
   *
   * Bertipe `unknown`: modal ini melayani tiga dashboard dengan bentuk respons
   * yang berbeda-beda, jadi bentuknya ditegaskan di pemanggil — di sanalah
   * pengetahuan soal bentuk itu berada.
   */
  map: (data: unknown) => DashboardPreview
}

/**
 * Intip isi sebuah dashboard tanpa meninggalkan halaman.
 *
 * Sengaja RINGKASAN, bukan salinan halamannya: modal memuat empat angka utama
 * dan satu grafik. Menjejalkan seluruh panel ke dalam sebuah kotak hanya
 * menghasilkan versi kecil yang lebih sulit dibaca daripada halaman aslinya;
 * halaman lengkapnya tetap bisa dibuka lewat menu di sidebar.
 *
 * Datanya diambil saat modal DIBUKA, bukan saat halaman dimuat: tiga permintaan
 * dashboard sekaligus di latar belakang hanya untuk kartu yang mungkin tidak
 * pernah diklik adalah pemborosan yang terasa di halaman pertama.
 */
export function DashboardPreviewModal({
  open,
  onClose,
  title,
  endpoint,
  map,
}: DashboardPreviewModalProps) {
  const t = useT()
  const [isi, setIsi] = useState<DashboardPreview | null>(null)
  const [gagal, setGagal] = useState(false)

  useEffect(() => {
    if (!open) return
    let aktif = true
    api
      .get(endpoint)
      .then((r) => {
        if (aktif) setIsi(map(r.data.data))
      })
      .catch(() => {
        if (aktif) setGagal(true)
      })
    return () => {
      aktif = false
    }
    // `map` sengaja tidak jadi dependensi: ia ditulis ulang tiap render halaman
    // pemanggil, dan memasukkannya akan membuat modal memuat ulang tanpa henti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, endpoint])

  // Isi dibuang saat ditutup supaya modal berikutnya tidak sempat menampilkan
  // angka milik dashboard yang tadi dibuka.
  function tutup() {
    setIsi(null)
    setGagal(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={tutup}
      title={title}
      // `xl` (max-w-5xl), bukan `lg`: isinya sebaris empat kartu angka DAN satu
      // grafik. Di lebar 2xl, kartunya berimpit dan grafiknya menyempit sampai
      // label sumbunya harus dijarangkan — padahal justru grafik itu yang bikin
      // orang membuka modal ini alih-alih membaca angka di kartu peran.
      size="xl"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={tutup}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      {gagal ? (
        <div className="py-12 text-center text-sm text-gray-400">{t("common.failed")}</div>
      ) : !isi ? (
        <div className="py-12 text-center text-sm text-gray-400">{t("common.loading")}</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {isi.stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <p className="truncate text-xs text-gray-500">{s.label}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{s.value}</p>
                {s.hint && <p className="mt-0.5 truncate text-[11px] text-gray-400">{s.hint}</p>}
              </div>
            ))}
          </div>

          {isi.chart && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-800">{isi.chart.title}</h3>
              {isi.chart.kind === "stacked" ? (
                <StackedBarChart
                  series={isi.chart.series}
                  data={isi.chart.data}
                  otherKey={isi.chart.otherKey}
                  totalLabel={isi.chart.totalLabel}
                  formatValue={isi.chart.formatValue}
                  formatAxis={isi.chart.formatAxis}
                  emptyLabel={isi.chart.emptyLabel}
                />
              ) : (
                <TrendChart
                  variant={isi.chart.variant}
                  data={isi.chart.data}
                  formatValue={isi.chart.formatValue}
                  formatAxis={isi.chart.formatAxis}
                  emptyLabel={isi.chart.emptyLabel}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

"use client"

import { Button } from "@/components/atoms/Button"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export type Column<T> = {
  header: string
  className?: string
  cell: (row: T, index: number) => ReactNode
}

export type ExtraAction<T> = {
  // Fungsi bila label bergantung pada baris (mis. "Mencetak..." saat proses).
  label: string | ((row: T) => string)
  onClick: (row: T) => void
  className?: string
  // Nonaktifkan tombol untuk baris tertentu, di luar isRowLoading.
  disabled?: (row: T) => boolean
}

type DataTableProps<T extends object> = {
  columns: Column<T>[]
  data: T[]
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  canDelete?: (row: T) => boolean
  extraActions?: ExtraAction<T>[]
  emptyMessage?: string
  isRowLoading?: (row: T) => boolean
  rowNumber?: (row: T, index: number) => ReactNode
  // Sembunyikan kolom "No" (mis. saat tabel sudah punya kolom urutan sendiri).
  hideRowNumber?: boolean
}

export function DataTable<T extends object>({
  columns,
  data,
  onEdit,
  onDelete,
  canDelete,
  extraActions,
  emptyMessage = "Tidak ada data.",
  isRowLoading,
  rowNumber,
  hideRowNumber = false,
}: DataTableProps<T>) {
  const hasActions = !!(onEdit || onDelete || extraActions?.length)

  // Tombol aksi baris — dipakai bersama oleh tampilan tabel (desktop) & kartu (mobile).
  function renderActions(row: T, rowLoading: boolean) {
    return (
      <>
        {extraActions?.map((action, k) => (
          <Button
            key={k}
            size="xs"
            variant="outline"
            disabled={rowLoading || (action.disabled?.(row) ?? false)}
            onClick={() => action.onClick(row)}
            className={action.className}
          >
            {typeof action.label === "function" ? action.label(row) : action.label}
          </Button>
        ))}
        {onEdit && (
          <Button size="xs" variant="outline" disabled={rowLoading} onClick={() => onEdit(row)}>
            Edit
          </Button>
        )}
        {onDelete && (canDelete?.(row) ?? true) && (
          <Button size="xs" variant="destructive" disabled={rowLoading} onClick={() => onDelete(row)}>
            {rowLoading ? "..." : "Hapus"}
          </Button>
        )}
      </>
    )
  }

  return (
    <>
      {/* Mobile: tiap baris jadi kartu (label : nilai) agar rapi & tak terpotong. */}
      <div className="space-y-3 p-4 md:hidden">
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">{emptyMessage}</p>
        ) : (
          data.map((row, i) => {
            const rowLoading = isRowLoading?.(row) ?? false
            return (
              <div
                key={i}
                className={cn(
                  "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity",
                  rowLoading && "opacity-60"
                )}
              >
                {!hideRowNumber && (
                  <div className="flex items-center border-b border-gray-100 bg-gray-50/70 px-4 py-2">
                    <span className="inline-flex h-6 items-center justify-center rounded-full bg-[#075489]/10 px-2.5 text-xs font-semibold text-[#075489]">
                      No {rowNumber ? rowNumber(row, i) : i + 1}
                    </span>
                  </div>
                )}
                <dl className="divide-y divide-gray-50">
                  {columns.map((col, j) => (
                    <div key={j} className="flex items-start justify-between gap-4 px-4 py-2.5">
                      <dt className="shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        {col.header}
                      </dt>
                      <dd className="min-w-0 text-right text-sm font-medium text-gray-800">
                        {col.cell(row, i)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {hasActions && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
                    {renderActions(row, rowLoading)}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Desktop: tabel penuh (scroll horizontal bila perlu). */}
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {!hideRowNumber && (
              <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-12">
                No
              </th>
            )}
            {columns.map((col, i) => (
              <th
                key={i}
                className={cn(
                  "py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
            {hasActions && (
              <th className="py-3 pl-3 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-400 w-36">
                Aksi
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (hasActions ? 1 : 0) + (hideRowNumber ? 0 : 1)}
                className="py-10 text-center text-sm text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => {
              const rowLoading = isRowLoading?.(row) ?? false
              return (
                <tr
                  key={i}
                  className={cn(
                    "transition-colors",
                    rowLoading ? "bg-gray-50 cursor-wait" : "hover:bg-gray-50"
                  )}
                >
                  {!hideRowNumber && (
                    <td className="py-3 pl-4 pr-3 text-gray-400">
                      {rowNumber ? rowNumber(row, i) : i + 1}
                    </td>
                  )}
                  {columns.map((col, j) => (
                    <td key={j} className={cn("py-3 px-3 text-gray-700", col.className)}>
                      {col.cell(row, i)}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="py-3 pl-3 pr-4">
                      <div className="flex justify-end gap-2">{renderActions(row, rowLoading)}</div>
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
      </div>
    </>
  )
}

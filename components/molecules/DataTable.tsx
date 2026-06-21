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
  label: string
  onClick: (row: T) => void
  className?: string
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

  return (
    <div className="overflow-x-auto">
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
                      <div className="flex justify-end gap-2">
                        {extraActions?.map((action, k) => (
                          <Button
                            key={k}
                            size="xs"
                            variant="outline"
                            disabled={rowLoading}
                            onClick={() => action.onClick(row)}
                            className={action.className}
                          >
                            {action.label}
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
                      </div>
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

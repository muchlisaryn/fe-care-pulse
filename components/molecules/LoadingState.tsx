"use client"

import { Spinner } from "@/components/atoms/Spinner"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type LoadingStateProps = {
  label?: string
  className?: string
}

/** Keadaan memuat yang seragam untuk isi kartu dashboard. */
export function LoadingState({ label, className }: LoadingStateProps) {
  const t = useT()

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-16 text-sm text-gray-400",
        className,
      )}
    >
      <Spinner />
      <span>{label ?? t("common.loading")}</span>
    </div>
  )
}

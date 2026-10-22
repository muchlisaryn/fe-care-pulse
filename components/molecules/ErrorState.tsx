"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type ErrorStateProps = {
  message?: string
  onRetry?: () => void
  className?: string
}

/** Keadaan gagal memuat yang tetap memberi jalan keluar: tombol coba lagi. */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  const t = useT()

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-[#b91c1c]">
        <AlertCircle className="h-5 w-5" />
      </span>
      <p className="max-w-sm text-sm text-gray-500">{message ?? t("dashboard.loadFailed")}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("dashboard.retry")}
        </Button>
      )}
    </div>
  )
}

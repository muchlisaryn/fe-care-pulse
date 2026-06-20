import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

type SelectProps = ComponentProps<"select"> & {
  error?: boolean
}

export function Select({ className, error, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors bg-white",
        "border-gray-300 text-gray-900",
        "focus:border-[#075489] focus:ring-2 focus:ring-[#075489]/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

type InputProps = ComponentProps<"input"> & {
  error?: boolean
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border px-4 py-2 text-sm outline-none transition-colors",
        "border-gray-300 bg-white placeholder:text-gray-400 text-gray-900",
        "focus:border-[#075489] focus:ring-2 focus:ring-[#075489]/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
        className
      )}
      {...props}
    />
  )
}

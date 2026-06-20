import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

type TextareaProps = ComponentProps<"textarea"> & {
  error?: boolean
}

export function Textarea({ className, error, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border px-4 py-2 text-sm outline-none transition-colors resize-y",
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

import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

type RadioProps = Omit<ComponentProps<"input">, "type">

export function Radio({ className, ...props }: RadioProps) {
  return (
    <input
      type="radio"
      className={cn(
        "h-4 w-4 border-gray-300 text-[#075489] outline-none transition-colors",
        "accent-[#075489] focus:ring-2 focus:ring-[#075489]/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

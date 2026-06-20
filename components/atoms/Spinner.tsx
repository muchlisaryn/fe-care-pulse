import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

type SpinnerProps = {
  className?: string
}

export function Spinner({ className }: SpinnerProps) {
  return (
    <Loader2
      className={cn("h-4 w-4 animate-spin text-[#075489]", className)}
    />
  )
}

import { cn } from "@/lib/utils"

type CardProps = {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white border border-gray-100 shadow-sm p-5",
        className
      )}
    >
      {children}
    </div>
  )
}

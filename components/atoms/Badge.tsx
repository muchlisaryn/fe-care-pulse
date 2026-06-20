import { cn } from "@/lib/utils"

type BadgeVariant = "success" | "warning" | "info" | "danger" | "default"

type BadgeProps = {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-[#4ba69d]/15 text-[#4ba69d]",
  danger: "bg-red-100 text-red-600",
  default: "bg-gray-100 text-gray-600",
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

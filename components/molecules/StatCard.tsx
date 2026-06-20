import { cn } from "@/lib/utils"
import { Card } from "@/components/molecules/Card"
import type { LucideIcon } from "lucide-react"

type StatCardProps = {
  title: string
  value: string
  change?: string
  positive?: boolean
  icon: LucideIcon
  className?: string
}

export function StatCard({ title, value, change, positive = true, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {change && (
        <p className={cn("mt-3 text-xs font-medium", positive ? "text-[#4ba69d]" : "text-red-500")}>
          {change}
        </p>
      )}
    </Card>
  )
}

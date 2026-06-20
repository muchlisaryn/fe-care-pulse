import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { cn } from "@/lib/utils"
import type { ComponentProps, ReactNode } from "react"

type FormFieldProps = ComponentProps<"input"> & {
  id: string
  label: string
  error?: boolean
  addon?: ReactNode
  trailing?: ReactNode
}

export function FormField({ id, label, error, addon, trailing, className, ...inputProps }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {addon}
      </div>
      <div className="relative">
        <Input
          id={id}
          error={error}
          className={cn(trailing && "pr-10", className)}
          {...inputProps}
        />
        {trailing && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            {trailing}
          </div>
        )}
      </div>
    </div>
  )
}

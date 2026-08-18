import { Label } from "@/components/atoms/Label"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type FieldGroupProps = {
  label: string
  children: ReactNode
  className?: string
  /** Tandai wajib diisi — memberi tanda bintang di sebelah label. */
  wajib?: boolean
}

/**
 * Label + kontrol apa pun (Select, Textarea, DatePicker, input ber-addon).
 *
 * Bedanya dengan `FormField`: FormField adalah pintasan khusus `Input` dan
 * menerima props input langsung, sedangkan FieldGroup tidak menentukan
 * kontrolnya — dipakai saat kontrolnya bukan Input biasa.
 *
 * Label-nya membungkus kontrol, jadi klik pada teks label tetap memfokuskan
 * kontrol tanpa perlu memasangkan `id`/`htmlFor` di tiap pemakaian.
 */
export function FieldGroup({ label, children, className, wajib }: FieldGroupProps) {
  return (
    <Label className={cn("block font-normal", className)}>
      <span className="mb-1.5 block font-medium">
        {label}
        {wajib && (
          <span className="ml-0.5 text-red-500" title="Wajib diisi">
            *
          </span>
        )}
      </span>
      {children}
    </Label>
  )
}

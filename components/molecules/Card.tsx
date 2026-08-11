import { cn } from "@/lib/utils"

type CardProps = {
  children: React.ReactNode
  className?: string
  /** Untuk warna dinamis yang tak bisa jadi kelas Tailwind (mis. aksen per baris). */
  style?: React.CSSProperties
}

export function Card({ children, className, style }: CardProps) {
  return (
    <div
      style={style}
      className={cn(
        "rounded-xl bg-white border border-gray-100 shadow-sm p-5",
        className
      )}
    >
      {children}
    </div>
  )
}

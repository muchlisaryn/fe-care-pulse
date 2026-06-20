import Image from "next/image"
import { cn } from "@/lib/utils"

type LogoProps = {
  className?: string
  width?: number
  height?: number
}

export function Logo({ className, width = 120, height = 40 }: LogoProps) {
  return (
    <Image
      src="/new_logo.png"
      alt="CarePulse"
      width={width}
      height={height}
      priority
      unoptimized
      className={cn("object-contain", className)}
    />
  )
}

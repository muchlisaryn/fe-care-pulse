"use client"

import type { Ref } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/atoms/Button"

type LoadMoreSentinelProps = {
  /** Elemen penanda yang diamati IntersectionObserver di halaman pemakai. */
  ref?: Ref<HTMLDivElement>
  /** Masih ada halaman berikutnya di server. */
  hasMore: boolean
  /** Halaman berikutnya sedang diambil. */
  loading: boolean
  onLoadMore: () => void
}

/**
 * Penanda dasar daftar untuk LAZY LOAD: saat elemen ini masuk layar, halaman
 * pemakai mengambil halaman berikutnya. Tombolnya jadi cadangan manual bila
 * pengamat scroll tak jalan (mis. daftar belum bisa di-scroll).
 */
export function LoadMoreSentinel({ ref, hasMore, loading, onLoadMore }: LoadMoreSentinelProps) {
  if (!hasMore && !loading) return null

  return (
    <div ref={ref} className="flex justify-center py-4">
      {loading ? (
        <span className="inline-flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat data...
        </span>
      ) : (
        <Button type="button" variant="outline" onClick={onLoadMore}>
          Muat lebih banyak
        </Button>
      )}
    </div>
  )
}

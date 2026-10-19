"use client"

import { useCallback, useEffect, useState } from "react"
import api from "@/lib/axios"

/** Bentuk `paginate()` Laravel yang dibungkus helper `success()` backend. */
type Paginated<T> = {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

type Params = Record<string, string | number | undefined>

type PagedListState<T> = {
  /** Kunci permintaan pemilik `items`; beda dengan kunci aktif = halaman sedang dimuat. */
  key: string | null
  items: T[]
  lastPage: number
  perPage: number
  total: number
}

/**
 * Daftar ber-PAGINATION (nomor halaman) untuk endpoint `paginate()`: hanya halaman
 * yang sedang dibuka yang diambil dari server. Pasangkan dengan molecule
 * `Pagination`. Ganti `params` (mis. search) → panggil `setPage(1)` bersamaan.
 *
 * Kembaran `useLazyList` (scroll bertahap) untuk layar yang memakai nomor halaman.
 */
export function usePagedList<T>(url: string, params: Params = {}, onError?: () => void) {
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const paramsJson = JSON.stringify(params)
  const key = `${url}|${paramsJson}|${page}|${version}`

  const [state, setState] = useState<PagedListState<T>>({
    key: null,
    items: [],
    lastPage: 1,
    perPage: 20,
    total: 0,
  })

  useEffect(() => {
    if (state.key === key) return
    let cancelled = false
    api
      .get(url, { params: { ...JSON.parse(paramsJson), page } })
      .then((res) => {
        if (cancelled) return
        const p: Paginated<T> = res.data.data
        setState({
          key,
          items: p.data ?? [],
          lastPage: p.last_page,
          perPage: p.per_page,
          total: p.total,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState((s) => ({ ...s, key, items: [] }))
        onError?.()
      })
    return () => {
      cancelled = true
    }
    // onError sengaja tidak jadi dependensi: callback baru tiap render tidak boleh
    // memicu request ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state.key, url, paramsJson, page])

  // Halaman terakhir jadi kosong (mis. item terakhirnya baru diproses) → mundur ke
  // halaman terakhir yang masih ada, bukan menampilkan daftar kosong.
  if (state.key === key && page > state.lastPage && state.lastPage >= 1) {
    setPage(state.lastPage)
  }

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return {
    items: state.items,
    loading: state.key !== key,
    page,
    setPage,
    totalPages: state.lastPage,
    totalItems: state.total,
    perPage: state.perPage,
    reload,
  }
}

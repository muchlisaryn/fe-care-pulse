"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import api from "@/lib/axios"

/** Bentuk `paginate()` Laravel yang dibungkus helper `success()` backend. */
type Paginated<T> = {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

type Params = Record<string, string | number | undefined>

type LazyListState<T> = {
  /** Kunci permintaan pemilik `items`; beda dengan kunci aktif = halaman 1 sedang dimuat. */
  key: string | null
  items: T[]
  page: number
  lastPage: number
  total: number
  loadingMore: boolean
  error: boolean
}

type Options = {
  /** false → belum diminta (mis. sub-tampilan tidak aktif): tidak ada request. */
  enabled?: boolean
  onError?: () => void
}

/**
 * Daftar LAZY LOAD untuk endpoint ber-paginasi: halaman 1 baru diambil saat
 * daftar diminta (`enabled`), halaman berikutnya saat `sentinelRef` (pasang di
 * `LoadMoreSentinel`) masuk layar. Ganti `params` (mis. search) atau `reload()`
 * → mulai ulang dari halaman 1.
 *
 * Data yang sudah dimuat tetap disimpan selama komponen hidup, jadi bolak-balik
 * sub-tampilan tidak memicu request ulang selama `params` tidak berubah.
 */
export function useLazyList<T>(url: string, params: Params = {}, { enabled = true, onError }: Options = {}) {
  const [version, setVersion] = useState(0)
  const key = `${url}|${JSON.stringify(params)}|${version}`

  const [state, setState] = useState<LazyListState<T>>({
    key: null,
    items: [],
    page: 0,
    lastPage: 0,
    total: 0,
    loadingMore: false,
    error: false,
  })

  // Disimpan di ref supaya callback dari pemakai tidak memicu fetch ulang.
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  // Parameter yang benar-benar dikirim — dibaca dari kunci supaya effect tidak
  // bergantung pada identitas objek `params` yang baru di setiap render.
  const paramsJson = JSON.stringify(params)

  useEffect(() => {
    if (!enabled || state.key === key) return
    let cancelled = false
    api
      .get(url, { params: { ...JSON.parse(paramsJson), page: 1 } })
      .then((res) => {
        if (cancelled) return
        const p: Paginated<T> = res.data.data
        setState({
          key,
          items: p.data ?? [],
          page: p.current_page,
          lastPage: p.last_page,
          total: p.total,
          loadingMore: false,
          error: false,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({ key, items: [], page: 0, lastPage: 0, total: 0, loadingMore: false, error: true })
        onErrorRef.current?.()
      })
    return () => {
      cancelled = true
    }
  }, [enabled, key, state.key, url, paramsJson])

  const loading = enabled && state.key !== key
  const hasMore = !loading && state.page < state.lastPage

  const loadMore = useCallback(() => {
    if (loading || state.loadingMore || state.page >= state.lastPage) return
    const requestKey = state.key
    const nextPage = state.page + 1
    setState((s) => ({ ...s, loadingMore: true }))
    api
      .get(url, { params: { ...JSON.parse(paramsJson), page: nextPage } })
      .then((res) => {
        const p: Paginated<T> = res.data.data
        // Permintaan sudah usang (search diganti / reload) → buang hasilnya.
        setState((s) =>
          s.key !== requestKey
            ? s
            : {
                ...s,
                items: [...s.items, ...(p.data ?? [])],
                page: p.current_page,
                lastPage: p.last_page,
                total: p.total,
                loadingMore: false,
              },
        )
      })
      .catch(() => {
        setState((s) => (s.key !== requestKey ? s : { ...s, loadingMore: false }))
        onErrorRef.current?.()
      })
  }, [loading, state.key, state.page, state.lastPage, state.loadingMore, url, paramsJson])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  return {
    items: state.items,
    total: state.total,
    loading,
    loadingMore: state.loadingMore,
    hasMore,
    error: state.error,
    loadMore,
    reload,
    sentinelRef,
  }
}

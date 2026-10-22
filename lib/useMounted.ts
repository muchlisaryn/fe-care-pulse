"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * False during SSR and the first hydration render, true once React is attached.
 *
 * Dipakai untuk atribut yang tidak boleh berbeda antara HTML server dan render
 * pertama klien. Setelah hidrasi, React boleh mengubahnya seperti biasa tanpa
 * memicu peringatan hydration mismatch.
 */
export function useMounted() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}

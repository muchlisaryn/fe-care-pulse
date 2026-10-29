/** Item label kemasan BMHP beserta baris produksi asalnya. */
type PackagingItemLike = {
  production_item?: {
    name: string
    quantity?: number
    unit_name?: string | null
  } | null
}

export type PackagingContent = { name: string; quantity: number; unit_name: string | null }

/** Filter pipeline BMHP (pengemasan & sterilisasi) — dipegang halaman, bukan tab. */
export type BmhpPipelineFilter = {
  search: string
  dateFrom: string
  dateTo: string
}

/**
 * Isi SATU kemasan BMHP, dihitung dari label-labelnya (bukan dari seluruh item
 * produksi — satu produksi bisa terpecah ke beberapa kemasan, satu per BMHP/paket).
 * Paket berisi N set punya N label @1, jadi digabung per nama + satuan.
 */
export function packagingContents(items: PackagingItemLike[] | undefined): PackagingContent[] {
  const byKey = new Map<string, PackagingContent>()
  for (const it of items ?? []) {
    const pi = it.production_item
    if (!pi) continue
    const unit = pi.unit_name ?? null
    const key = `${pi.name}|${unit ?? ""}`
    const row = byKey.get(key)
    if (row) row.quantity += Number(pi.quantity ?? 1)
    else byKey.set(key, { name: pi.name, quantity: Number(pi.quantity ?? 1), unit_name: unit })
  }
  return [...byKey.values()]
}

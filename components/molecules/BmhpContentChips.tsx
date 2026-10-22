import { packagingContents } from "@/lib/bmhpPackaging"

type PackagingItems = Parameters<typeof packagingContents>[0]

/**
 * Isi kemasan BMHP sebagai chip "nama · jumlah" (tanpa kode kemasan). `packagings` =
 * label-label per kemasan. Jumlah hanya digabung untuk BMHP yang sama DI DALAM
 * satu kemasan (mis. set-set paket); BMHP berbeda atau kemasan berbeda tetap jadi
 * chip sendiri-sendiri. Dipakai kartu di tab Pengemasan & Sterilisasi.
 */
export function BmhpContentChips({ packagings }: { packagings: PackagingItems[] }) {
  const contents = packagings.flatMap((items) => packagingContents(items))
  if (contents.length === 0) return <span className="text-xs text-gray-400">—</span>
  const qty = (it: (typeof contents)[number]) => [it.quantity, it.unit_name].filter(Boolean).join(" ")
  // Selalu SATU baris supaya tinggi kartu seragam: chip yang tidak muat disembunyikan
  // & diganti "…" (text-overflow pada chip inline), isi lengkapnya ada di tooltip.
  return (
    <div
      className="truncate text-xs leading-7 text-gray-400"
      title={contents.map((it) => `${it.name} ${qty(it)}`).join(", ")}
    >
      {contents.map((it, i) => (
        <span
          key={`${i}|${it.name}|${it.unit_name ?? ""}`}
          className="mr-1.5 inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-100 bg-white px-2 py-0.5 align-middle text-xs font-medium leading-5 text-gray-800"
        >
          <span className="truncate">{it.name}</span>
          <span className="shrink-0 font-semibold text-[#075489]">{qty(it)}</span>
        </span>
      ))}
    </div>
  )
}

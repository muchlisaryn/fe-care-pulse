import { redirect } from "next/navigation"

// Halaman ini dulu satu form bertab (?tab=kelompok / ?tab=pribadi). Tabnya kini
// dipecah jadi dua halaman tersendiri. Stub ini mengarahkan tautan & bookmark
// lama ke halaman yang sesuai; tanpa ?tab= jatuh ke kelompok, jenis yang paling
// sering dipakai.
export default async function TransaksiBaruRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const tab = sp.tab
  redirect(
    tab === "pribadi"
      ? "/nafsul/transaksi/baru/pribadi"
      : "/nafsul/transaksi/baru/kelompok"
  )
}

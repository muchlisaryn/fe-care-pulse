import { redirect } from "next/navigation"

// URL lama halaman ini adalah /cssd/monitoring. Route-nya kini bernama
// /cssd/tracking-order (menyesuaikan nama menu "Tracking Order"). Stub ini
// mengarahkan tautan/bookmark/notifikasi lama ke URL baru, sambil mempertahankan
// query ?tab= agar deep-link (mis. ?tab=sterilization) tetap berfungsi.
export default async function MonitoringRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const tab = sp.tab
  const q = typeof tab === "string" && tab ? `?tab=${encodeURIComponent(tab)}` : ""
  redirect(`/cssd/tracking-order${q}`)
}

import { redirect } from "next/navigation"

// Halaman Sterilisasi mandiri dihapus dari navigasi — tahap sterilisasi kini
// menjadi tab pada halaman Tracking Order. URL lama diarahkan ke tab tersebut
// agar bookmark/tautan lama tetap berfungsi.
export default function SterilisasiRedirectPage() {
  redirect("/cssd/monitoring?tab=sterilization")
}

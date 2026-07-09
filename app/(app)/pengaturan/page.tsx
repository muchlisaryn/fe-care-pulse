import { redirect } from "next/navigation"

// Menu "Pengaturan" mengarah ke /pengaturan → alihkan ke sub-menu pertama
// (Master Printer). Sub-navigasi Pengaturan ada di sidebar kedua (layout.tsx).
export default function PengaturanIndexPage() {
  redirect("/pengaturan/master-printer")
}

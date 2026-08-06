import type { AuthTitleSection } from "@/lib/store/slices/authSlice"

/** Menu "Tracking Order" — halaman daftar order masuk yang perlu diproses CSSD. */
export const INCOMING_MENU_URL = "/cssd/tracking-order"

/**
 * Apakah otoritas user memuat menu dengan url tertentu.
 *
 * `auth.menus` sudah disaring backend sesuai otoritas user (lihat
 * `AuthController::buildMenuResponse`), jadi hadirnya sebuah menu di sini SAMA
 * DENGAN "user berhak atas halaman itu". Dipakai untuk memutuskan siapa yang
 * berhak menerima notifikasi halaman tersebut, bukan sekadar merender sidebar.
 *
 * Url dicek sampai level sub-menu karena menu induk sering hanya wadah tanpa url.
 */
export function hasMenuAccess(
  sections: AuthTitleSection[] | null | undefined,
  url: string,
): boolean {
  for (const section of sections ?? []) {
    for (const menu of section.menus ?? []) {
      if (menu.url === url) return true
      for (const sub of menu.menu ?? []) {
        if (sub.url === url) return true
      }
    }
  }

  return false
}

const LS_KEY = "medassist_auth"
const COOKIE_NAME = "auth_token"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// Bentuknya HARUS sama dengan yang dikirim `/auth/me` & login — isinya memang
// respons itu, disimpan apa adanya. Sebelumnya `url` submenu ditulis `string`
// padahal server mengirimkannya nullable (menu induk sebagai wadah), sehingga
// tipe di sini diam-diam berbeda dari data yang benar-benar tersimpan.
type StoredSubMenu = {
  name: string
  url: string | null
  icon?: string | null
  open_sidebar?: boolean
}
type StoredMenuGroup = {
  name: string
  url: string | null
  icon: string | null
  sort_order: number
  is_open: boolean
  open_sidebar?: boolean
  menu: StoredSubMenu[] | null
}
type StoredTitleSection = { title_menu: string | null; menus: StoredMenuGroup[] }

export type StoredAuth = {
  username: string
  token: string
  menus: StoredTitleSection[]
  name?: string | null
  email?: string | null
}

export function saveAuth(
  username: string,
  token: string,
  menus: StoredTitleSection[] = [],
  name?: string | null,
  email?: string | null
): void {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_KEY, JSON.stringify({ username, token, menus, name, email }))
  document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function loadAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as StoredAuth) : null
  } catch {
    return null
  }
}

export function clearAuth(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(LS_KEY)
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
}

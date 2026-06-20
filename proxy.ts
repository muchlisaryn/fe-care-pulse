import { NextRequest, NextResponse } from "next/server"

const COOKIE_NAME = "auth_token"
const LOGIN_PATH = "/login"
const DEFAULT_HOME = "/dashboard"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE_NAME)?.value
  const isLoginPage = pathname.startsWith(LOGIN_PATH)

  if (!token && !isLoginPage) {
    const url = new URL(LOGIN_PATH, request.url)
    // Sertakan query string agar parameter seperti ?code= (dari scan QR) tidak hilang setelah login.
    if (pathname !== "/") url.searchParams.set("from", pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  if (token && isLoginPage) {
    return NextResponse.redirect(new URL(DEFAULT_HOME, request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Lewati API, aset internal Next, dan semua file aset statis (gambar, audio,
  // font) agar bisa diakses tanpa autentikasi — mis. logo di halaman login &
  // bunyi notifikasi. Tanpa ini, file di /public ikut di-redirect ke /login.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp3|wav|ogg|m4a|woff2?|ttf)).*)",
  ],
}

// Ambil pesan error yang layak ditampilkan dari respons API Laravel:
// pesan validasi field pertama (422) → `message` dari server → pesan cadangan.
//
// Dua bentuk galat didukung:
//   1. Galat axios     — payload server ada di `err.response.data`.
//   2. ApiError (fetch) — `message` & `errors` langsung di objek galatnya,
//      dipakai modul Nafsul yang memanggil API lewat `lib/nafsul/api.ts`.
export function apiErrorMessage(err: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  const e = err as {
    message?: string
    errors?: Record<string, string[]>
    response?: { data?: { message?: string; errors?: Record<string, string[]> } }
  }
  const data = e?.response?.data
  const fieldError =
    Object.values(data?.errors ?? {})[0]?.[0] ?? Object.values(e?.errors ?? {})[0]?.[0]

  return fieldError ?? data?.message ?? e?.message ?? fallback
}

// Ambil pesan error yang layak ditampilkan dari respons API Laravel:
// pesan validasi field pertama (422) → `message` dari server → pesan cadangan.
export function apiErrorMessage(err: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  const e = err as {
    response?: { data?: { message?: string; errors?: Record<string, string[]> } }
  }
  const fieldError = Object.values(e?.response?.data?.errors ?? {})[0]?.[0]
  return fieldError ?? e?.response?.data?.message ?? fallback
}

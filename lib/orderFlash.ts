// Pesan "sekali tampil" antar halaman: form Tambah Order menitipkan pesan sukses,
// lalu halaman daftar Order menampilkannya sebagai modal setelah redirect.
// Dipakai sessionStorage (bukan query string) agar pesan hilang setelah dibaca dan
// tidak muncul lagi saat halaman di-refresh atau URL-nya dibagikan.
export const ORDER_FLASH_KEY = "cssd-order-flash"

export function setOrderFlash(message: string) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(ORDER_FLASH_KEY, message)
}

// Ambil pesan sekaligus menghapusnya — sehingga hanya tampil satu kali.
export function takeOrderFlash(): string | null {
  if (typeof window === "undefined") return null
  const msg = sessionStorage.getItem(ORDER_FLASH_KEY)
  if (msg) sessionStorage.removeItem(ORDER_FLASH_KEY)
  return msg
}

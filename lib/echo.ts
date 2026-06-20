import Echo from "laravel-echo"
import Pusher from "pusher-js"

// Echo v2 mencari Pusher di scope global saat broadcaster = "pusher".
if (typeof window !== "undefined") {
  ;(window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher
}

let echo: Echo<"pusher"> | null = null

/**
 * Inisialisasi Laravel Echo (Pusher) sekali sebagai singleton. Mengembalikan
 * null bila dipanggil di server atau bila env Pusher belum diisi — pemanggil
 * harus menangani null (mis. tetap mengandalkan polling sebagai fallback).
 *
 * Butuh env:
 *   NEXT_PUBLIC_PUSHER_KEY
 *   NEXT_PUBLIC_PUSHER_CLUSTER
 */
export function getEcho(): Echo<"pusher"> | null {
  if (typeof window === "undefined") return null
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!key || !cluster) return null
  if (!echo) {
    echo = new Echo({
      broadcaster: "pusher",
      key,
      cluster,
      forceTLS: true,
    })
  }
  return echo
}

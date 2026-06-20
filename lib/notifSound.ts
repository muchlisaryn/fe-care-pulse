// Bunyi notifikasi saat ada order masuk baru — memutar file aset
// `public/hidup-jokowi.mp3`.
//
// Browser memblokir pemutaran audio yang tidak dipicu langsung oleh gesture user
// (kebijakan autoplay). Karena itu suara notifikasi yang dipicu otomatis (saat
// jumlah order bertambah) bisa diam. Solusinya: `primeNotifSound()` dipanggil
// pada gesture user pertama untuk "membuka kunci" elemen audio, sehingga
// `playNotifSound()` setelahnya diizinkan berbunyi.
const NOTIF_SOUND_SRC = "/hidup-jokowi.mp3"

let audio: HTMLAudioElement | null = null
let unlocked = false

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null
  if (!audio) {
    audio = new Audio(NOTIF_SOUND_SRC)
    audio.preload = "auto"
  }
  return audio
}

// Dipanggil dari gesture user pertama (klik / tekan tombol). Memutar audio dalam
// keadaan bisu lalu langsung menjeda — cukup untuk membuat browser menandai
// elemen audio sebagai "boleh diputar" tanpa benar-benar terdengar.
export function primeNotifSound(): void {
  if (unlocked) return
  const a = getAudio()
  if (!a) return
  a.muted = true
  a.play()
    .then(() => {
      a.pause()
      a.currentTime = 0
      a.muted = false
      unlocked = true
    })
    .catch(() => {
      a.muted = false
    })
}

export function playNotifSound(): void {
  const a = getAudio()
  if (!a) return
  try {
    a.currentTime = 0
    void a.play().catch(() => {
      // Masih diblokir (belum ada gesture user) — abaikan.
    })
  } catch {
    // Audio tidak didukung — abaikan.
  }
}

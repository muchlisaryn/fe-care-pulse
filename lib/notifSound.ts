// Notifikasi order masuk: diucapkan lewat Web Speech API ("Ada order masuk dari
// ruangan ...") dengan SUARA PEREMPUAN dan tempo pelan agar petugas tahu asal ordernya
// tanpa melihat layar. Browser yang tidak mendukung sintesis suara tidak berbunyi apa
// pun — badge di sidebar tetap menjadi penanda visualnya.
//
// Browser memblokir sintesis suara yang tidak dipicu gesture user (kebijakan
// autoplay). Karena itu `primeNotifSound()` dipanggil pada gesture user pertama
// untuk "membuka kunci", sehingga notifikasi yang dipicu otomatis setelahnya
// diizinkan berbunyi.

let unlocked = false

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null
  return window.speechSynthesis ?? null
}

// Penanda jenis kelamin suara dari NAMA voice — satu-satunya petunjuk yang tersedia,
// karena `SpeechSynthesisVoice` tidak punya properti gender. Nama voice Indonesia yang
// umum: "Microsoft Gadis" & "Google Bahasa Indonesia" (perempuan), "Microsoft Ardi"
// (laki-laki).
const FEMALE_VOICE = /female|wanita|perempuan|gadis|andika|damayanti|google bahasa indonesia/i
// `\bmale\b` sengaja dipakai supaya TIDAK ikut cocok pada kata "Female".
const MALE_VOICE = /\bmale\b|pria|laki|ardi/i

/**
 * Suara PEREMPUAN berbahasa Indonesia bila tersedia di perangkat. Daftar suara dimuat
 * asinkron oleh browser, jadi bisa saja masih kosong saat dipanggil — biarkan null dan
 * andalkan `utterance.lang`, bukan menunda pengucapan.
 *
 * Urutan pilihan: suara id-ID yang namanya jelas perempuan → suara id-ID yang bukan
 * laki-laki → suara id-ID apa pun. Perangkat yang hanya punya satu suara Indonesia
 * tetap berbunyi, tidak dibiarkan bisu hanya karena namanya tidak dikenali.
 */
function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("id"))

  return (
    voices.find((v) => FEMALE_VOICE.test(v.name)) ??
    voices.find((v) => !MALE_VOICE.test(v.name)) ??
    voices[0] ??
    null
  )
}

/** Ucapkan teks. Mengembalikan false bila browser tidak mendukung sintesis suara. */
function speak(text: string): boolean {
  const synth = getSynth()
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false

  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "id-ID"
    // Pelan & jelas: ruang CSSD berisik dan petugas sering tidak menghadap layar, jadi
    // kalimatnya harus sempat dicerna sekali dengar. Jangan dinaikkan mendekati 1.
    utterance.rate = 0.8
    // Nada sedikit di atas normal — menegaskan karakter suara perempuan, sekaligus
    // menjaga pengumuman tetap terdengar feminin di perangkat yang suara Indonesianya
    // netral / tidak bisa dikenali jenis kelaminnya dari nama.
    utterance.pitch = 1.1
    const voice = pickVoice(synth)
    if (voice) utterance.voice = voice
    // Tidak memakai cancel(): bila beberapa order masuk beruntun, pengumumannya
    // mengantre satu per satu alih-alih saling memotong.
    synth.speak(utterance)

    return true
  } catch {
    return false
  }
}

// Dipanggil dari gesture user pertama (klik / tekan tombol). Sintesis suara dipancing
// dengan ucapan kosong bervolume 0 — cukup untuk membuat browser menandainya "boleh
// dibunyikan" tanpa terdengar apa pun.
export function primeNotifSound(): void {
  if (unlocked) return

  const synth = getSynth()
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return

  try {
    // Memancing pemuatan daftar suara sekalian: `getVoices()` diisi browser secara
    // asinkron, jadi memanggilnya dari sini membuat suara perempuan sudah tersedia
    // saat pengumuman pertama berbunyi (lihat pickVoice).
    synth.getVoices()
    const warmup = new SpeechSynthesisUtterance("")
    warmup.volume = 0
    synth.speak(warmup)
    unlocked = true
  } catch {
    // Tidak didukung — notifikasi cukup tampil sebagai badge, tanpa suara.
  }
}

// SATU ORDER = SATU PENGUMUMAN, berapa pun jumlah instrumen yang dipesan di dalamnya.
// Id order yang sudah diumumkan diingat sebentar supaya event `order.submitted` yang
// sampai lebih dari sekali ke tab yang sama (langganan channel ganda, event dikirim
// ulang oleh Pusher) tidak berbunyi berkali-kali. Catatannya kedaluwarsa sendiri agar
// tidak tumbuh terus selama tab dibuka seharian.
const announcedAt = new Map<number, number>()
const ANNOUNCE_TTL_MS = 60_000

function shouldAnnounce(orderId?: number | null): boolean {
  // Tanpa id (payload lama) tidak bisa disaring — umumkan apa adanya.
  if (orderId == null) return true

  const now = Date.now()
  for (const [id, at] of announcedAt) {
    if (now - at > ANNOUNCE_TTL_MS) announcedAt.delete(id)
  }
  if (announcedAt.has(orderId)) return false

  announcedAt.set(orderId, now)

  return true
}

/**
 * Umumkan order masuk. `room` & `orderId` berasal dari payload broadcast
 * `order.submitted`; bila ruangan kosong (ruangan terhapus / data lama), kalimatnya
 * diringkas tanpa menyebut ruangan alih-alih mengucapkan "dari ruangan undefined".
 *
 * Order yang sama tidak diumumkan dua kali — lihat `shouldAnnounce`.
 */
export function announceIncomingOrder(room?: string | null, orderId?: number | null): void {
  if (!shouldAnnounce(orderId)) return

  const name = room?.trim()
  speak(name ? `Ada order masuk dari ruangan ${name}` : "Ada order masuk")
}

// Notifikasi order masuk: diucapkan lewat Web Speech API ("Ada order masuk, dari
// ruangan, ...") dengan SUARA PEREMPUAN dan tempo PELAN agar petugas tahu asal
// ordernya tanpa melihat layar. Browser yang tidak mendukung sintesis suara tidak
// berbunyi apa pun — badge di sidebar tetap menjadi penanda visualnya.
//
// Tiga hal yang menentukan pengumumannya terdengar perempuan & tidak buru-buru:
// pemilihan voice (pickVoice), `rate` 0.7, dan jeda sesudah nada pendek. Ketiganya
// saling melengkapi — mengubah salah satu saja biasanya tidak cukup.
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

// ---------------------------------------------------------------------------
// Nada pendek (beep) — jaring pengaman untuk PONSEL.
//
// Di Android/iOS sintesis suara sering gagal berbunyi: daftar voice bahasa
// Indonesia belum termuat, mesin TTS sedang dipakai aplikasi lain, atau
// `speechSynthesis` masih ter-pause setelah layar mati. Karena itu tiap
// pengumuman SELALU didahului nada pendek lewat Web Audio (tanpa berkas audio,
// jadi tidak ada aset yang bisa gagal dimuat) — petugas tetap mendengar sesuatu
// walau kalimatnya tidak sempat terucap.
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null

/** Lama seluruh nada pendek berbunyi (dua nada) — dipakai sbg jeda sebelum bicara. */
const BEEP_DURATION_MS = 400

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  audioCtx ??= new Ctor()
  return audioCtx
}

/**
 * Dua nada pendek "ding-ding". Web Audio pada ponsel ikut terkunci kebijakan
 * autoplay & otomatis di-suspend saat tab tersembunyi, jadi context-nya selalu
 * di-`resume()` dulu — resume() setelah pernah dibuka lewat gesture user tidak
 * memerlukan gesture baru.
 */
function beep(): void {
  const ctx = getAudioCtx()
  if (!ctx) return

  try {
    if (ctx.state === "suspended") void ctx.resume()
    const start = ctx.currentTime
    ;[0, 0.18].forEach((offset, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = i === 0 ? 880 : 1175
      // Amplop naik-turun halus supaya tidak berbunyi "klik" di speaker ponsel.
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.16)
    })
  } catch {
    // Perangkat tidak mendukung Web Audio — cukup andalkan sintesis suara.
  }
}

// Penanda jenis kelamin suara dari NAMA voice — satu-satunya petunjuk yang tersedia,
// karena `SpeechSynthesisVoice` tidak punya properti gender.
//
// Nama suara Indonesia yang beredar:
//   perempuan → "Microsoft Gadis", "Microsoft Damayanti", "Google Bahasa Indonesia"
//   laki-laki → "Microsoft Andika", "Microsoft Ardi"
//
// ANDIKA & ARDI ITU LAKI-LAKI. Dulu "andika" keliru masuk daftar perempuan, padahal
// di Windows justru Andika yang biasanya SATU-SATUNYA suara Indonesia bawaan — jadi
// pengumuman selalu terdengar sebagai suara laki-laki walau kodenya minta perempuan.
// Nama suara di luar bahasa Indonesia hampir tidak pernah memuat kata "female"
// (Windows menamainya "Microsoft Zira", macOS "Samantha"), jadi nama-nama yang
// memang perempuan didaftar apa adanya. Tanpa daftar ini, perangkat yang suara
// Indonesianya cuma Andika tidak pernah menemukan pengganti perempuan.
const FEMALE_NAMES = [
  // Indonesia / Melayu
  "gadis", "damayanti", "google bahasa indonesia",
  // Windows
  "zira", "hazel", "heera", "catherine", "linda", "susan", "eva", "hedda", "elsa", "helena",
  // macOS / iOS
  "samantha", "karen", "moira", "tessa", "fiona", "victoria", "alice", "anna",
  "monica", "nora", "paulina", "sara", "veena", "yuna", "kanya",
  // Azure / Chrome
  "aria", "jenny", "michelle", "sonia", "libby", "maisie", "natasha", "clara", "neerja",
  "google uk english female", "google us english",
]
const FEMALE_VOICE = new RegExp(
  ["female", "wanita", "perempuan", ...FEMALE_NAMES].join("|"),
  "i",
)
// `\bmale\b` sengaja dipakai supaya TIDAK ikut cocok pada kata "Female".
const MALE_VOICE = /\bmale\b|pria|laki|ardi|andika/i

/**
 * Suara yang dipakai + apakah ia benar-benar suara perempuan. Jenis kelaminnya ikut
 * dikembalikan karena nada bicara (pitch) hanya perlu dinaikkan saat terpaksa memakai
 * suara yang bukan perempuan — menaikkan pitch suara yang memang sudah perempuan
 * malah membuatnya melengking.
 */
type PickedVoice = { voice: SpeechSynthesisVoice | null; female: boolean }

/**
 * Pilih suara PEREMPUAN untuk pengumuman, dengan urutan mengalah yang jelas:
 *
 *  1. suara Indonesia yang namanya jelas perempuan (paling ideal — lafalnya benar);
 *  2. suara Indonesia yang namanya bukan laki-laki (netral/tidak dikenali);
 *  3. suara PEREMPUAN bahasa lain — banyak perangkat (Windows) sama sekali tidak
 *     punya suara Indonesia perempuan, dan vokal Indonesia cukup dekat dengan
 *     bahasa-bahasa ini sehingga kalimatnya masih terdengar jelas. Jenis kelamin
 *     yang diminta petugas didahulukan daripada kesempurnaan lafal;
 *  4. suara Indonesia apa pun (laki-laki) — daripada bisu; pitch-nya dinaikkan.
 *
 * Daftar suara dimuat asinkron oleh browser, jadi bisa saja masih kosong saat
 * dipanggil pertama kali; itu ditangani `voiceschanged` di bawah.
 */
function pickVoice(synth: SpeechSynthesis): PickedVoice {
  const all = synth.getVoices()
  const id = all.filter((v) => v.lang?.toLowerCase().startsWith("id"))

  const idFemale = id.find((v) => FEMALE_VOICE.test(v.name))
  if (idFemale) return { voice: idFemale, female: true }

  const idNeutral = id.find((v) => !MALE_VOICE.test(v.name))
  if (idNeutral) return { voice: idNeutral, female: true }

  // Suara perempuan bahasa lain — utamakan yang vokalnya paling dekat dengan
  // bahasa Indonesia (Melayu, lalu Inggris sebagai yang paling pasti ada).
  const preferred = ["ms", "en"]
  for (const prefix of preferred) {
    const hit = all.find(
      (v) => v.lang?.toLowerCase().startsWith(prefix) && FEMALE_VOICE.test(v.name),
    )
    if (hit) return { voice: hit, female: true }
  }
  const anyFemale = all.find((v) => FEMALE_VOICE.test(v.name))
  if (anyFemale) return { voice: anyFemale, female: true }

  // Menyerah: suara Indonesia apa adanya (kemungkinan laki-laki).
  return { voice: id[0] ?? null, female: false }
}

/** Ucapkan teks. Mengembalikan false bila browser tidak mendukung sintesis suara. */
function speak(text: string): boolean {
  const synth = getSynth()
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false

  try {
    // Android: `speechSynthesis` bisa tertinggal dalam keadaan pause setelah layar
    // mati / tab pindah, dan semua ucapan berikutnya diam saja sampai di-resume.
    if (synth.paused) synth.resume()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "id-ID"
    // PELAN. Ruang CSSD berisik dan petugas sering tidak menghadap layar, jadi
    // kalimatnya harus sempat dicerna sekali dengar tanpa perlu diulang. 0.8 masih
    // terasa buru-buru; 0.7 memberi jeda antar suku kata tanpa terdengar melambat
    // seperti baterai habis. Jangan naikkan mendekati 1.
    utterance.rate = 0.7
    const { voice, female } = pickVoice(synth)
    if (voice) {
      utterance.voice = voice
      // Samakan `lang` dengan suara yang benar-benar dipakai. Bila terpaksa memakai
      // suara berbahasa lain, membiarkannya "id-ID" membuat sebagian mesin TTS
      // bingung lalu diam sama sekali.
      utterance.lang = voice.lang
    }
    // Pitch dinaikkan HANYA saat terpaksa memakai suara yang bukan perempuan —
    // menaikkan nada suara yang memang sudah perempuan justru membuatnya melengking.
    utterance.pitch = female ? 1 : 1.4
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

  // Web Audio dibuka lebih dulu — di ponsel, INI yang paling menentukan apakah
  // notifikasi nanti terdengar, karena context-nya hanya boleh dibuat/di-resume
  // dari gesture user. Sekali dibuka, ia tetap bisa di-resume otomatis nanti.
  try {
    const ctx = getAudioCtx()
    if (ctx?.state === "suspended") void ctx.resume()
  } catch {
    // Tidak didukung — lanjut ke sintesis suara.
  }

  const synth = getSynth()
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    // Web Audio saja sudah cukup untuk menandai notifikasi bisa berbunyi.
    unlocked = true

    return
  }

  try {
    // Memancing pemuatan daftar suara sekalian: `getVoices()` diisi browser secara
    // asinkron, jadi memanggilnya dari sini membuat suara perempuan sudah tersedia
    // saat pengumuman pertama berbunyi (lihat pickVoice). Di Chrome daftarnya baru
    // benar-benar terisi saat event `voiceschanged`, jadi kita panggil sekali lagi
    // di sana — tanpa itu, pengumuman PERTAMA jatuh ke suara bawaan (laki-laki)
    // walaupun perangkatnya punya suara perempuan.
    synth.getVoices()
    synth.addEventListener?.("voiceschanged", () => synth.getVoices(), { once: true })
    // Android hanya menandai TTS "boleh berbunyi" bila ucapan pemancing benar-benar
    // punya teks — utterance kosong diabaikan begitu saja. Volume 0 → tak terdengar.
    const warmup = new SpeechSynthesisUtterance("­")
    warmup.volume = 0
    warmup.lang = "id-ID"
    synth.speak(warmup)
    unlocked = true
  } catch {
    // Tidak didukung — notifikasi cukup tampil sebagai badge, tanpa suara.
  }
}

/**
 * Dipanggil saat tab kembali terlihat: di ponsel, Web Audio di-suspend dan
 * `speechSynthesis` bisa tertinggal pause setelah layar mati — keduanya
 * dibangunkan lagi supaya order yang masuk berikutnya tetap berbunyi.
 */
export function resumeNotifSound(): void {
  if (!unlocked) return

  try {
    const ctx = getAudioCtx()
    if (ctx?.state === "suspended") void ctx.resume()
  } catch {
    // Abaikan — nada pendek akan mencoba resume lagi saat berbunyi.
  }

  const synth = getSynth()
  if (synth?.paused) synth.resume()
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

  // Nada pendek dulu — di ponsel inilah yang paling bisa diandalkan; kalimatnya
  // menyusul bila mesin TTS perangkat memang tersedia.
  beep()

  const name = room?.trim()
  // Koma bukan hiasan: mesin TTS berhenti sejenak di situ, jadi nama ruangan tidak
  // menempel pada kalimat pembuka dan lebih mudah ditangkap sekali dengar.
  const text = name ? `Ada order masuk, dari ruangan, ${name}` : "Ada order masuk"

  // Beri jeda sampai nada pendeknya selesai (dua nada, ±0,35 detik) sebelum mulai
  // bicara. Tanpa jeda, kata pertama tertimpa bunyi "ding" dan sering tidak terdengar.
  setTimeout(() => speak(text), BEEP_DURATION_MS)
}

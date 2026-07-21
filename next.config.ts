import type { NextConfig } from "next";

// Origin backend Laravel (tanpa trailing slash). Diatur lewat env BACKEND_API_URL
// agar gampang ganti antar lingkungan (lokal / staging / produksi).
const BACKEND_API_URL = (process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Izinkan akses dev server dari perangkat lain di LAN (mis. HP via IP).
  // Tanpa ini, Next 16 memblokir request cross-origin saat development.
  allowedDevOrigins: ["10.20.20.218", "10.12.12.205", "10.12.12.174", "192.168.1.17"],
  // Teruskan semua panggilan /api ke backend Laravel (server-side),
  // jadi browser cukup akses port 3000 — tak perlu buka port 8000 / atur CORS.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_API_URL}/api/:path*`,
      },
      // Berkas unggahan (gambar instrumen & katalog) juga dilayani backend. Backend
      // mengirim path root-relatif `/uploads/...`, jadi browser memintanya ke port
      // 3000 dan diteruskan ke sini — tak perlu buka port 8000 maupun menyetel APP_URL.
      {
        source: "/uploads/:path*",
        destination: `${BACKEND_API_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;

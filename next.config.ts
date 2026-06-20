import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Izinkan akses dev server dari perangkat lain di LAN (mis. HP via IP).
  // Tanpa ini, Next 16 memblokir request cross-origin saat development.
  allowedDevOrigins: ["10.20.20.218"],
  // Teruskan semua panggilan /api ke backend Laravel (server-side),
  // jadi browser cukup akses port 3000 — tak perlu buka port 8000 / atur CORS.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;

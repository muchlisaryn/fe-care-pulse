// Modul Nafsul di-mount pada prefix /nafsul di backend gabungan. Base URL
// memakai proxy Next (/api → Laravel) yang sama dengan modul CSSD.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const API_URL = `${API_BASE}/nafsul`;

// Auth memakai token milik modul CSSD (satu login untuk seluruh aplikasi).
// Token disimpan CSSD di localStorage key "medassist_auth" (JSON) sebagai
// { token, ... }.
const CSSD_AUTH_KEY = "medassist_auth";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CSSD_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

// Manajemen sesi ditangani modul CSSD; helper ini dipertahankan agar kode lama
// yang mengimpornya tetap terkompilasi, tetapi tidak menyentuh auth CSSD.
export function setToken(_token: string) {
  // no-op: login ditangani modul CSSD.
}

export function clearToken() {
  // no-op: logout ditangani modul CSSD.
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | undefined | null>;
  auth?: boolean;
}

/**
 * Ambil berkas dari endpoint sebagai Blob, dengan token auth ikut terkirim.
 *
 * Dipisah dari `apiDownload` karena tidak semua berkas untuk diunduh: PDF
 * biling ditampilkan dulu di iframe sebagai pratinjau. Membukanya lewat
 * `window.open(url)` bukan pilihan — permintaan itu tidak membawa header
 * Authorization, jadi yang sampai ke layar adalah 401, bukan dokumennya.
 *
 * Galat dari server dibalas JSON (mis. 422 "belum divalidasi"), jadi isinya
 * dibaca dulu supaya pesannya bisa ditampilkan apa adanya alih-alih kalimat
 * umum yang tidak menjelaskan apa-apa.
 */
export async function apiBlob(
  path: string,
  params?: Record<string, string | number | undefined | null>
): Promise<{ blob: Blob; nama: string | null }> {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(`${API_URL}${path}`, base);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    let pesan = `Server membalas ${res.status}.`;
    try {
      const teks = await res.text();
      pesan = (JSON.parse(teks) as { message?: string }).message ?? pesan;
    } catch {
      // Balasan galat yang bukan JSON: pesan bawaan di atas sudah cukup.
    }
    throw new ApiError(pesan, res.status);
  }

  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(cd);

  return { blob: await res.blob(), nama: match?.[1] ?? null };
}

/** Unduh file dari endpoint (mis. export CSV) dengan menyertakan token auth. */
export async function apiDownload(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  fallbackName = "download"
): Promise<void> {
  const { blob, nama } = await apiBlob(path, params);
  const name = nama ?? fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, params, auth = true } = options;

  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(`${API_URL}${path}`, base);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  // FormData: biarkan browser set Content-Type (multipart + boundary) otomatis.
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : isFormData
          ? (body as FormData)
          : JSON.stringify(body),
  });

  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  const text = await res.text();

  // Respons tidak selalu JSON: backend mati membuat proxy Next membalas
  // "Internal Server Error" sebagai teks biasa, dan error PHP fatal membalas
  // HTML. Keduanya harus jadi pesan yang menjelaskan, bukan SyntaxError dari
  // JSON.parse yang menutupi penyebab aslinya.
  let data: { message?: string; errors?: Record<string, string[]> } | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(
        res.ok
          ? "Balasan server tidak berbentuk JSON."
          : pesanNonJson(res.status, text),
        res.status
      );
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.message ?? "Terjadi kesalahan", res.status, data?.errors);
  }

  return data as T;
}

/** Ringkas balasan non-JSON jadi pesan yang menunjuk penyebabnya. */
function pesanNonJson(status: number, text: string): string {
  const cuplikan = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

  if (status === 500 && /internal server error/i.test(text)) {
    return "Tidak bisa menghubungi server API. Pastikan backend Laravel berjalan (php artisan serve).";
  }

  return `Server membalas ${status}: ${cuplikan || "tanpa isi"}`;
}

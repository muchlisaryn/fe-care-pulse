import axios from "axios"

type TokenGetter = () => string | null
type UnauthorizedHandler = () => void

let getToken: TokenGetter = () => null
let onUnauthorized: UnauthorizedHandler = () => {}

// Called once in StoreProvider after the store is created
export function setupAxiosInterceptors(
  tokenGetter: TokenGetter,
  unauthorizedHandler: UnauthorizedHandler
): void {
  getToken = tokenGetter
  onUnauthorized = unauthorizedHandler
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "/api",
  headers: { "Content-Type": "application/json" },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url: string = error.config?.url ?? ""
    // 401 pada request login = kredensial salah → biarkan halaman login yang
    // menampilkan pesannya (jangan picu logout global).
    const isLoginRequest = url.includes("/auth/login")

    if (status === 401 && !isLoginRequest) {
      // Sesi habis / token tidak valid: bersihkan auth & arahkan ke login.
      onUnauthorized()
      // Hentikan rantai promise agar 401 ini tidak menjadi error tak tertangani
      // (yang memunculkan overlay) di pemanggil yang tidak punya .catch — UI
      // sudah dialihkan ke halaman login oleh handler di atas.
      return new Promise(() => {})
    }

    return Promise.reject(error)
  }
)

export default api

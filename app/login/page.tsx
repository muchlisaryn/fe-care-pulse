"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Logo } from "@/components/atoms/Logo"
import { FormField } from "@/components/molecules/FormField"
import { useAppDispatch } from "@/lib/store/hooks"
import { setCredentials } from "@/lib/store/slices/authSlice"
import { saveAuth } from "@/lib/auth"
import api from "@/lib/axios"

function LoginForm() {
  const dispatch = useAppDispatch()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Fallback baca langsung dari input: sebagian password manager / autofill di
    // HP mengisi kolom tanpa memicu onChange React, jadi state bisa kosong walau
    // kolom terlihat terisi. Ambil nilai form sebelum ada await.
    const form = e.currentTarget as HTMLFormElement
    const uname =
      username.trim() ||
      (form.elements.namedItem("username") as HTMLInputElement | null)?.value.trim() ||
      ""
    const pass =
      password || (form.elements.namedItem("password") as HTMLInputElement | null)?.value || ""
    if (!uname || !pass) {
      setError("Username dan kata sandi wajib diisi.")
      return
    }
    setError("")
    setLoading(true)
    try {
      const res = await api.post("/auth/login", { username: uname, password: pass })
      const { username: loggedUsername, token, menus } = res.data.data
      saveAuth(loggedUsername, token, menus ?? [])
      dispatch(setCredentials({ username: loggedUsername, token, menus: menus ?? [] }))
      const from = searchParams.get("from") || "/dashboard"
      router.replace(from)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Terjadi kesalahan. Silakan coba lagi."
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo width={140} height={48} className="mb-6" />
          <h2 className="text-2xl font-bold text-gray-900">Selamat Datang</h2>
          <p className="mt-1 text-sm text-gray-500">
            Masuk ke akun Anda untuk melanjutkan
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <FormField
            id="username"
            name="username"
            label="Username"
            type="text"
            placeholder="johndoe"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />

          <FormField
            id="password"
            name="password"
            label="Kata Sandi"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={loading}
                aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#075489] hover:bg-[#075489]/90 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-60"
          >
            {loading ? "Masuk..." : "Masuk"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Dengan masuk, Anda menyetujui{" "}
          <a href="#" className="text-[#075489] hover:underline">
            Syarat & Ketentuan
          </a>{" "}
          dan{" "}
          <a href="#" className="text-[#075489] hover:underline">
            Kebijakan Privasi
          </a>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

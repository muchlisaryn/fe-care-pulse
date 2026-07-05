"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { CheckCircle2, XCircle, Info, X } from "lucide-react"

type ToastType = "success" | "error" | "info"
type ToastItem = { id: number; type: ToastType; message: string }

type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

// Hook untuk memunculkan notifikasi (toast). Wajib dipakai di dalam <ToastProvider>.
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider")
  return ctx
}

const STYLES: Record<ToastType, { ring: string; icon: React.ReactNode }> = {
  success: { ring: "border-green-200", icon: <CheckCircle2 className="h-5 w-5 text-green-600" /> },
  error: { ring: "border-red-200", icon: <XCircle className="h-5 w-5 text-red-600" /> },
  info: { ring: "border-[#075489]/30", icon: <Info className="h-5 w-5 text-[#075489]" /> },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, type, message }])
      // Error dibiarkan lebih lama agar sempat dibaca.
      window.setTimeout(() => remove(id), type === "error" ? 6000 : 4000)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg " +
              STYLES[t.type].ring
            }
          >
            <span className="mt-0.5 shrink-0">{STYLES[t.type].icon}</span>
            <p className="flex-1 text-sm text-gray-700">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

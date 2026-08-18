"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { useAppDispatch } from "@/lib/store/hooks"
import { updateToken } from "@/lib/store/slices/authSlice"
import { saveAuth, loadAuth } from "@/lib/auth"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"

type PasswordForm = {
  current_password: string
  password: string
  password_confirmation: string
}

type FieldErrors = Partial<Record<keyof PasswordForm, string>>

const emptyPassword: PasswordForm = {
  current_password: "",
  password: "",
  password_confirmation: "",
}

const MIN_LENGTH = 8

/**
 * Periksa di sisi klien SEBELUM request dikirim. Aturannya sengaja disamakan dengan
 * validasi AuthController::changePassword — supaya pesan yang muncul saat mengetik
 * tidak berbeda dari yang nanti dikembalikan server.
 *
 * Yang dikembalikan KUNCI kamus, bukan kalimatnya, supaya pesannya ikut bahasa
 * aktif. Pesan mentah dari server dilewatkan ke `t()` juga — kunci yang tak dikenal
 * dikembalikan apa adanya, jadi kalimat server tetap tampil utuh.
 */
function validate(form: PasswordForm): FieldErrors {
  const errors: FieldErrors = {}

  if (!form.current_password) {
    errors.current_password = "changePassword.errCurrentRequired"
  }

  if (!form.password) {
    errors.password = "changePassword.errNewRequired"
  } else if (form.password.length < MIN_LENGTH) {
    errors.password = "changePassword.errNewTooShort"
  } else if (form.current_password && form.password === form.current_password) {
    errors.password = "changePassword.errNewSame"
  }

  if (!form.password_confirmation) {
    errors.password_confirmation = "changePassword.errConfirmRequired"
  } else if (form.password && form.password !== form.password_confirmation) {
    errors.password_confirmation = "changePassword.errConfirmMismatch"
  }

  return errors
}

export default function UbahKataSandiPage() {
  const dispatch = useAppDispatch()
  const t = useT()

  const [form, setForm] = useState<PasswordForm>(emptyPassword)
  const [errors, setErrors] = useState<FieldErrors>({})
  // Pesan tingkat-halaman: hanya untuk hasil (berhasil) atau kegagalan yang tidak
  // menempel pada satu kolom (mis. jaringan / 500).
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState(false)

  // Kolom yang sudah pernah disentuh — pesan baru muncul setelah itu, supaya form
  // tidak langsung merah sebelum pengguna sempat mengetik apa pun.
  const [touched, setTouched] = useState<Partial<Record<keyof PasswordForm, boolean>>>({})

  const liveErrors = validate(form)
  const shownError = (field: keyof PasswordForm) => errors[field] ?? (touched[field] ? liveErrors[field] : undefined)

  function setField(field: keyof PasswordForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    // Pesan dari server sudah tidak berlaku begitu nilainya diubah.
    setErrors((e) => ({ ...e, [field]: undefined }))
    setBanner(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const found = validate(form)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setTouched({ current_password: true, password: true, password_confirmation: true })
      return
    }

    setBanner(null)
    setErrors({})
    setSaving(true)
    try {
      const res = await api.put("/auth/change-password", form)
      const newToken: string = res.data.data.token
      dispatch(updateToken(newToken))
      const stored = loadAuth()
      if (stored) saveAuth(stored.username, newToken, stored.menus, stored.name, stored.email)
      setForm(emptyPassword)
      setTouched({})
      setBanner({ type: "success", text: t("changePassword.success") })
    } catch (err: unknown) {
      const res = (err as {
        response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } }
      })?.response

      // Validasi server dikembalikan per field → tempelkan tepat di bawah kolomnya,
      // bukan digabung jadi satu kalimat di atas form.
      const serverErrors = res?.data?.errors
      if (serverErrors && Object.keys(serverErrors).length > 0) {
        setErrors({
          current_password: serverErrors.current_password?.[0],
          password: serverErrors.password?.[0],
          password_confirmation: serverErrors.password_confirmation?.[0],
        })
        setTouched({ current_password: true, password: true, password_confirmation: true })
        return
      }

      setBanner({
        type: "error",
        text:
          res?.data?.message ??
          (res?.status
            ? t("changePassword.failCode", { code: res.status })
            : t("changePassword.failNetwork")),
      })
    } finally {
      setSaving(false)
    }
  }

  const fields: { key: keyof PasswordForm; label: string; hint?: string }[] = [
    { key: "current_password", label: t("changePassword.currentLabel") },
    {
      key: "password",
      label: t("changePassword.newLabel"),
      hint: t("changePassword.newHint", { min: MIN_LENGTH }),
    },
    { key: "password_confirmation", label: t("changePassword.confirmLabel") },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={t("changePassword.title")} subtitle={t("changePassword.subtitle")} />

      <Card className="max-w-xl">
        {banner && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              banner.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-600"
            }`}
          >
            {banner.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {fields.map(({ key, label, hint }) => {
            const error = shownError(key)
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <div className="relative">
                  <Input
                    id={key}
                    type={show ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete={key === "current_password" ? "current-password" : "new-password"}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
                    disabled={saving}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${key}-error` : undefined}
                    className={error ? "border-red-300 focus-visible:ring-red-200" : undefined}
                  />
                </div>
                {error ? (
                  <p id={`${key}-error`} className="text-xs font-medium text-red-600">
                    {t(error, { min: MIN_LENGTH, len: form.password.length })}
                  </p>
                ) : hint ? (
                  <p className="text-xs text-gray-400">{hint}</p>
                ) : null}
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {show ? t("changePassword.hidePassword") : t("changePassword.showPassword")}
          </button>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setForm(emptyPassword)
                setErrors({})
                setTouched({})
                setBanner(null)
              }}
              disabled={saving}
            >
              {t("common.reset")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#075489] hover:bg-[#075489]/90 text-white"
            >
              {saving ? t("common.saving") : t("changePassword.title")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

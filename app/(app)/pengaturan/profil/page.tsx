"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { updateProfile, updateToken } from "@/lib/store/slices/authSlice"
import { saveAuth, loadAuth } from "@/lib/auth"
import api from "@/lib/axios"

type ProfileForm = { name: string; username: string; email: string }
type PasswordForm = {
  current_password: string
  password: string
  password_confirmation: string
}

const emptyPassword: PasswordForm = {
  current_password: "",
  password: "",
  password_confirmation: "",
}

export default function ProfilPage() {
  const dispatch = useAppDispatch()
  const { name, username, email } = useAppSelector((s) => s.auth)

  const [profile, setProfile] = useState<ProfileForm>({
    name: name ?? "",
    username: username ?? "",
    email: email ?? "",
  })
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPassword)
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)

  useEffect(() => {
    setProfile({
      name: name ?? "",
      username: username ?? "",
      email: email ?? "",
    })
  }, [name, username, email])

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    setProfileMsg(null)
    setProfileSaving(true)
    try {
      const res = await api.put("/auth/profile", profile)
      const updated = res.data.data
      dispatch(updateProfile({ name: updated.name, username: updated.username, email: updated.email }))
      const stored = loadAuth()
      if (stored) {
        saveAuth(updated.username, stored.token, stored.menus, updated.name, updated.email)
      }
      setProfileMsg({ type: "success", text: "Profil berhasil diperbarui." })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Gagal memperbarui profil."
      setProfileMsg({ type: "error", text: msg })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault()
    if (passwordForm.password !== passwordForm.password_confirmation) {
      setPasswordMsg({ type: "error", text: "Konfirmasi password tidak sesuai." })
      return
    }
    setPasswordMsg(null)
    setPasswordSaving(true)
    try {
      const res = await api.put("/auth/change-password", passwordForm)
      const newToken: string = res.data.data.token
      dispatch(updateToken(newToken))
      const stored = loadAuth()
      if (stored) saveAuth(stored.username, newToken, stored.menus, stored.name, stored.email)
      setPasswordForm(emptyPassword)
      setPasswordMsg({ type: "success", text: "Password berhasil diubah." })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Gagal mengubah password."
      setPasswordMsg({ type: "error", text: msg })
    } finally {
      setPasswordSaving(false)
    }
  }

  const displayName = name ?? username ?? "User"
  const initials = displayName.charAt(0).toUpperCase()

  return (
    <div className="space-y-6">
      <PageHeader title="Profil" subtitle="Kelola informasi akun Anda" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Avatar card */}
        <Card className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#4ba69d] text-3xl font-bold text-white">
            {initials}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{name ?? "—"}</p>
            <p className="text-sm text-gray-400">@{username ?? "—"}</p>
          </div>
          <div className="w-full border-t border-gray-100 pt-3 space-y-1 text-left">
            <p className="text-xs text-gray-400">Username</p>
            <p className="text-sm font-medium text-gray-700">{username ?? "—"}</p>
          </div>
          <div className="w-full space-y-1 text-left">
            <p className="text-xs text-gray-400">Email</p>
            <p className="text-sm font-medium text-gray-700 break-all">{email ?? "—"}</p>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          {/* Profile info form */}
          <Card>
            <h2 className="mb-5 text-base font-semibold text-gray-900">Informasi Pribadi</h2>

            {profileMsg && (
              <div
                className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                  profileMsg.type === "success"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-600"
                }`}
              >
                {profileMsg.text}
              </div>
            )}

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Nama Lengkap</Label>
                <Input
                  id="profile-name"
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  disabled={profileSaving}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-username">Username</Label>
                  <Input
                    id="profile-username"
                    value={profile.username}
                    onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
                    disabled={profileSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                    disabled={profileSaving}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button
                  type="submit"
                  disabled={profileSaving}
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  {profileSaving ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </div>
            </form>
          </Card>

          {/* Change password form */}
          <Card>
            <h2 className="mb-5 text-base font-semibold text-gray-900">Ubah Kata Sandi</h2>

            {passwordMsg && (
              <div
                className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                  passwordMsg.type === "success"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-600"
                }`}
              >
                {passwordMsg.text}
              </div>
            )}

            <form onSubmit={handlePasswordSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pw-current">Kata Sandi Saat Ini</Label>
                <Input
                  id="pw-current"
                  type="password"
                  placeholder="••••••••"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, current_password: e.target.value }))}
                  disabled={passwordSaving}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pw-new">Kata Sandi Baru</Label>
                  <Input
                    id="pw-new"
                    type="password"
                    placeholder="••••••••"
                    value={passwordForm.password}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, password: e.target.value }))}
                    disabled={passwordSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw-confirm">Konfirmasi Kata Sandi</Label>
                  <Input
                    id="pw-confirm"
                    type="password"
                    placeholder="••••••••"
                    value={passwordForm.password_confirmation}
                    onChange={(e) =>
                      setPasswordForm((p) => ({ ...p, password_confirmation: e.target.value }))
                    }
                    disabled={passwordSaving}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setPasswordForm(emptyPassword); setPasswordMsg(null) }}
                  disabled={passwordSaving}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={
                    passwordSaving ||
                    !passwordForm.current_password ||
                    !passwordForm.password ||
                    !passwordForm.password_confirmation
                  }
                  className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                >
                  {passwordSaving ? "Menyimpan..." : "Ubah Password"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}

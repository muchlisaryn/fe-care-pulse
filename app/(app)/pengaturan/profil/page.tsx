"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
import { updateProfile } from "@/lib/store/slices/authSlice"
import { saveAuth, loadAuth } from "@/lib/auth"
import api from "@/lib/axios"
import { useT } from "@/lib/i18n"

type ProfileForm = { name: string; username: string; email: string }

export default function ProfilPage() {
  const dispatch = useAppDispatch()
  const { name, username, email } = useAppSelector((s) => s.auth)
  const t = useT()

  const [profile, setProfile] = useState<ProfileForm>({
    name: name ?? "",
    username: username ?? "",
    email: email ?? "",
  })
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

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
      setProfileMsg({ type: "success", text: t("profile.updated") })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? t("profile.updateFailed")
      setProfileMsg({ type: "error", text: msg })
    } finally {
      setProfileSaving(false)
    }
  }

  const displayName = name ?? username ?? "User"
  const initials = displayName.charAt(0).toUpperCase()

  return (
    <div className="space-y-6">
      <PageHeader title={t("profile.title")} subtitle={t("profile.subtitle")} />

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
            <p className="text-xs text-gray-400">{t("profile.username")}</p>
            <p className="text-sm font-medium text-gray-700">{username ?? "—"}</p>
          </div>
          <div className="w-full space-y-1 text-left">
            <p className="text-xs text-gray-400">{t("profile.email")}</p>
            <p className="text-sm font-medium text-gray-700 break-all">{email ?? "—"}</p>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          {/* Profile info form */}
          <Card>
            <h2 className="mb-5 text-base font-semibold text-gray-900">{t("profile.personalInfo")}</h2>

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
                <Label htmlFor="profile-name">{t("profile.fullName")}</Label>
                <Input
                  id="profile-name"
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  disabled={profileSaving}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-username">{t("profile.username")}</Label>
                  <Input
                    id="profile-username"
                    value={profile.username}
                    onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
                    disabled={profileSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-email">{t("profile.email")}</Label>
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
                  {profileSaving ? t("common.saving") : t("profile.saveChanges")}
                </Button>
              </div>
            </form>
          </Card>

          {/* Ubah kata sandi punya halamannya sendiri (/pengaturan/kata-sandi) —
              di sini cukup penunjuk arah, bukan formulir kedua. */}
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t("profile.passwordCard")}</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {t("profile.passwordCardHint")}
              </p>
            </div>
            <Link href="/pengaturan/kata-sandi" className="shrink-0">
              <Button variant="outline" className="border-[#075489] text-[#075489] hover:bg-[#075489]/10">
                <KeyRound className="h-4 w-4" />
                {t("profile.changePassword")}
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Input } from "@/components/atoms/Input"
import { Label } from "@/components/atoms/Label"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { invalidateUsers } from "@/lib/store/slices/userSlice"
import { useAppDispatch } from "@/lib/store/hooks"
import api from "@/lib/axios"

type ProfileForm = { name: string; username: string; email: string }

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const dispatch = useAppDispatch()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ProfileForm>({ name: "", username: "", email: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMsg, setSuccessMsg] = useState("")

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await api.get(`/master/users/${id}`)
        const u = res.data.data
        setForm({ name: u.name, username: u.username, email: u.email })
      } catch {
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.username.trim() || !form.email.trim()) return
    setErrors({})
    setSuccessMsg("")
    setSaving(true)
    try {
      await api.put(`/master/users/${id}`, form)
      setSuccessMsg("Profil berhasil diperbarui.")
      dispatch(invalidateUsers())
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })
        ?.response?.data
      if (data?.errors) {
        const flat: Record<string, string> = {}
        for (const [key, msgs] of Object.entries(data.errors)) {
          flat[key] = msgs[0]
        }
        setErrors(flat)
      } else if (data?.message) {
        setErrors({ _: data.message })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <PageHeader title="Update Profil User" subtitle="Perbarui nama, username, dan email pengguna" />
      </div>

      <Card className="max-w-lg">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Memuat data...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {errors._ && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {errors._}
              </div>
            )}
            {successMsg && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {successMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nama Lengkap</Label>
              <Input
                id="p-name"
                placeholder="John Doe"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                disabled={saving}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-username">Username</Label>
              <Input
                id="p-username"
                placeholder="johndoe"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                disabled={saving}
              />
              {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-email">Email</Label>
              <Input
                id="p-email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                disabled={saving}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={saving}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#075489] hover:bg-[#075489]/90 text-white"
              >
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}

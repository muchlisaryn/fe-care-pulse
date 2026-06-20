"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Monitor, ShieldCheck } from "lucide-react"
import { Button } from "@/components/atoms/Button"
import { Badge } from "@/components/atoms/Badge"
import { Card } from "@/components/molecules/Card"
import { PageHeader } from "@/components/molecules/PageHeader"
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog"
import { useAppDispatch } from "@/lib/store/hooks"
import { logout } from "@/lib/store/slices/authSlice"
import { clearAuth } from "@/lib/auth"
import api from "@/lib/axios"

type Session = {
  id: number
  device_name: string | null
  last_used: string | null
  created_at: string
  is_current: boolean
}

function formatDateTime(value: string | null) {
  if (!value) return null
  const d = new Date(value.replace(" ", "T"))
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function SesiAktifPage() {
  const dispatch = useAppDispatch()
  const router = useRouter()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [revokeTarget, setRevokeTarget] = useState<Session | null>(null)
  const [revokingId, setRevokingId] = useState<number | null>(null)
  const [revokeAllOpen, setRevokeAllOpen] = useState(false)
  const [revokingAll, setRevokingAll] = useState(false)

  async function loadSessions() {
    setLoading(true)
    try {
      const res = await api.get("/auth/sessions")
      setSessions(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    api
      .get("/auth/sessions")
      .then((res) => {
        if (active) setSessions(res.data.data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function handleRevoke() {
    if (!revokeTarget || revokingId !== null) return
    setRevokingId(revokeTarget.id)
    try {
      await api.delete(`/auth/sessions/${revokeTarget.id}`)
      setRevokeTarget(null)
      await loadSessions()
    } finally {
      setRevokingId(null)
    }
  }

  // Cabut semua menghapus token saat ini juga → sekalian logout & arahkan ke login.
  async function handleRevokeAll() {
    if (revokingAll) return
    setRevokingAll(true)
    try {
      await api.delete("/auth/sessions")
      clearAuth()
      dispatch(logout())
      router.push("/login")
    } finally {
      setRevokingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="Sesi Aktif" subtitle="Kelola perangkat yang sedang login ke akun Anda" />
        {sessions.length > 1 && (
          <Button variant="destructive" onClick={() => setRevokeAllOpen(true)}>
            Cabut Semua Sesi
          </Button>
        )}
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Tidak ada sesi aktif.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#075489]/8 text-[#075489]">
                  <Monitor className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-gray-900">
                      {s.device_name || "Perangkat tidak dikenal"}
                    </p>
                    {s.is_current && <Badge variant="success">Sesi ini</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Terakhir aktif:{" "}
                    {formatDateTime(s.last_used) ?? (
                      <span className="text-gray-400">belum pernah</span>
                    )}
                    <span className="mx-1.5 text-gray-300">•</span>
                    Login: {formatDateTime(s.created_at)}
                  </p>
                </div>
                {s.is_current ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={revokingId !== null}
                    onClick={() => setRevokeTarget(s)}
                  >
                    {revokingId === s.id ? "Mencabut..." : "Cabut"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#4ba69d]" />
        <p>
          Setiap kali login dari perangkat baru, sebuah sesi (token) dibuat. Cabut sesi yang tidak
          Anda kenali untuk menjaga keamanan akun. <strong>Cabut Semua Sesi</strong> akan mengeluarkan
          Anda dari semua perangkat, termasuk yang ini.
        </p>
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        loading={revokingId !== null}
        title="Cabut Sesi"
        description="Perangkat ini akan langsung keluar dari akun Anda. Lanjutkan?"
      />

      <ConfirmDialog
        open={revokeAllOpen}
        onClose={() => setRevokeAllOpen(false)}
        onConfirm={handleRevokeAll}
        loading={revokingAll}
        title="Cabut Semua Sesi"
        description="Anda akan keluar dari semua perangkat, termasuk perangkat ini, dan harus login kembali. Lanjutkan?"
      />
    </div>
  )
}

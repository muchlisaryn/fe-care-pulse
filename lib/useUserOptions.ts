"use client"

import { useEffect, useMemo, useState } from "react"
import api from "@/lib/axios"

/**
 * User (Master › User). Tidak ada kolom `nopeg` di tabel users; `username` yang
 * berperan sebagai nomor pegawai.
 */
export type MasterUser = {
  id: number
  name: string | null
  username: string
}

/**
 * Pilihan "orang" (peminjam / penerima / pengembali) dari Master User, dipakai
 * bersama beberapa halaman CSSD agar daftar & format labelnya seragam.
 *
 * Nilai opsi = `username` karena unik — dua user bisa bernama sama, sedangkan
 * `SelectSearch` mem-*key* opsi berdasarkan value. Label = "nama (nopeg)" supaya
 * keduanya terbaca dan ikut tercari (penyaringan SelectSearch berbasis teks label).
 *
 * Yang disimpan server pada kolom-kolom terkait (`borrowed_by`, `recipient`,
 * `returned_by`) adalah NAMA, bukan username — pakai `nameOf()` sebelum mengirim.
 */
export function useUserOptions() {
  const [users, setUsers] = useState<MasterUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        // Endpoint membatasi per_page maksimal 200, jadi tetap ditelusuri per halaman.
        const collected: MasterUser[] = []
        let cur = 1
        let last = 1
        do {
          const res = await api.get("/master/users", { params: { page: cur, per_page: 200 } })
          const p = res.data.data
          collected.push(...p.data)
          last = p.last_page
          cur += 1
        } while (cur <= last && active)
        if (active) setUsers(collected)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const options = useMemo(
    () =>
      users.map((u) => ({
        value: u.username,
        label: u.name ? `${u.name} (${u.username})` : u.username,
      })),
    [users],
  )

  return {
    users,
    options,
    loading,

    /** username → nama untuk dikirim ke server. Nilai tak dikenal dibiarkan apa adanya. */
    nameOf: (value: string) => users.find((u) => u.username === value)?.name ?? value,

    /** nama → username, untuk memilihkan nilai awal dari data yang menyimpan nama. */
    usernameOf: (name: string) => users.find((u) => u.name === name)?.username ?? name,

    /**
     * Opsi + nilai lama yang tidak cocok dengan user mana pun (data lama yang dulu
     * diketik bebas), supaya tetap tampil & tetap terkirim alih-alih hilang jadi
     * placeholder kosong.
     */
    optionsWith: (value: string) =>
      value && !options.some((o) => o.value === value)
        ? [...options, { value, label: value }]
        : options,
  }
}

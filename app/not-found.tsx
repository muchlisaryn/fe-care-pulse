"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Logo } from "@/components/atoms/Logo"
import { Button } from "@/components/atoms/Button"

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-md w-full">
        <Logo width={140} height={46} className="mb-10" />

        <div className="relative mb-6 select-none">
          <span className="text-[120px] sm:text-[160px] font-extrabold leading-none text-[#075489]/8 tracking-tighter">
            404
          </span>
          <span className="absolute inset-0 flex items-center justify-center text-5xl sm:text-6xl font-extrabold text-[#075489] tracking-tight">
            404
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
          Halaman tidak ditemukan
        </h1>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          Halaman yang kamu cari tidak tersedia atau telah dipindahkan.
          <br />
          Pastikan URL yang kamu masukkan sudah benar.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/dashboard">
            <Button className="w-full sm:w-auto bg-[#075489] hover:bg-[#075489]/90 text-white px-6">
              Ke Dashboard
            </Button>
          </Link>
          <Button
            variant="outline"
            className="w-full sm:w-auto px-6"
            onClick={() => router.back()}
          >
            Kembali
          </Button>
        </div>
      </div>

      <div className="absolute bottom-6 text-xs text-gray-400">
        &copy; {new Date().getFullYear()} MedAssist. All rights reserved.
      </div>
    </div>
  )
}

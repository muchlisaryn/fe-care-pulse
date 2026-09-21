"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import type { Anggota } from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { Label } from "@/components/atoms/Label";
import { Modal } from "@/components/molecules/Modal";
import MasterSelect from "@/components/nafsul/MasterSelect";
import { useT } from "@/lib/i18n";

/** Sel kosong seragam dengan tabel lain di aplikasi. */
function Kosong() {
  return <span className="text-gray-400 text-xs">—</span>;
}

/**
 * Cari anggota yang sudah terdaftar untuk menyalin data yang memang dipakai
 * bersama satu keluarga: alamat, telepon, wilayah, dan penanggung jawabnya.
 *
 * Anggotanya dipilih lewat dropdown berpencarian (`MasterSelect`), bukan kotak
 * teks berisi tombol Cari: yang dicari petugas selalu SATU orang tertentu, jadi
 * memilih langsung dari daftar lebih pendek daripada menyaring dulu lalu
 * memilih lagi dari hasilnya. Pencariannya di sisi server dan mencakup nama
 * maupun No. KK, jadi keduanya sama-sama bisa dipakai sebagai kata kunci.
 *
 * Kenapa tidak otomatis saat No. KK diketik: satu keluarga bisa punya beberapa
 * anggota dengan alamat yang sudah berbeda (anak yang pindah, mis.), jadi baris
 * mana yang disalin adalah keputusan petugas — bukan tebakan sistem. Karena itu
 * pula data yang akan tersalin ditampilkan dulu sebagai pratinjau, supaya
 * terbaca sebelum benar-benar dimasukkan ke formulir.
 */
export default function CariKKModal({
  open,
  onClose,
  kunciAwal,
  onPilih,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Label nilai terpilih selagi opsinya belum dimuat. Diisi pemanggil dari
   * No. KK atau nama yang sudah diketik, sekadar supaya dropdown-nya tidak
   * tampak kosong saat modal baru dibuka.
   */
  kunciAwal: string;
  onPilih: (anggota: Anggota) => void;
}) {
  const t = useT();
  /**
   * Baris yang sedang dipratinjau.
   *
   * Disimpan UTUH, bukan cuma id-nya: seluruh isi pratinjau datang dari sini,
   * dan menembak ulang detail anggota yang datanya sudah ada di tangan hanya
   * menambah satu permintaan tanpa menambah apa pun yang terbaca.
   */
  const [terpilih, setTerpilih] = useState<Anggota | null>(null);

  /**
   * Label opsi: "(NIK) Nama - Alamat".
   *
   * NIK di depan karena itu yang membedakan dua orang bernama sama, dan alamat
   * di belakang karena justru alamatlah yang menentukan apakah baris ini benar
   * satu rumah dengan anggota yang sedang didaftarkan. Keduanya dilewati bila
   * kosong — tanda kurung hampa dan tanda hubung menggantung lebih mengganggu
   * daripada label yang lebih pendek.
   */
  const label = (a: Anggota) =>
    [a.noktp ? `(${a.noktp})` : "", a.nama, a.alamat ? `- ${a.alamat}` : ""]
      .filter(Boolean)
      .join(" ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("nafsulAnggotaForm.kkSearchTitle")}
      size="xl"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("nafsulAnggota.colName")}</Label>
          <MasterSelect<Anggota>
            endpoint="/anggota"
            value={terpilih ? String(terpilih.id) : ""}
            onChange={(_, row) => setTerpilih(row ?? null)}
            /* Label memuat No. KK di depan namanya: keduanya sama-sama jadi
               kata kunci pencarian, jadi keduanya pula yang perlu terbaca saat
               memilih — tanpa nomornya, dua orang bernama mirip dari keluarga
               berbeda tidak bisa dibedakan. */
            toOption={(a) => ({ value: String(a.id), label: label(a) })}
            placeholder={t("nafsulAnggotaForm.kkSearchPlaceholder")}
            labelTerpilih={terpilih ? label(terpilih) : kunciAwal}
          />
          <p className="text-xs text-slate-500">{t("nafsulAnggotaForm.kkSearchHint")}</p>
        </div>

        {terpilih === null ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {t("nafsulAnggotaForm.kkSearchEmpty")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {/* Aksi ditaruh PALING DEPAN: kolom alamat di sebelahnya
                        bisa panjang dan mendorong tombolnya keluar layar, jadi
                        yang harus ditekan akan tersembunyi di balik gulir
                        mendatar justru pada baris yang paling perlu ditekan. */}
                    <th className="w-16 px-3 py-2 text-center">{t("common.actions")}</th>
                    <th className="px-3 py-2">{t("nafsulAnggotaForm.familyCardNo")}</th>
                    <th className="px-3 py-2">{t("nafsulAnggota.colName")}</th>
                    <th className="px-3 py-2">{t("nafsulAnggotaForm.phone")}</th>
                    <th className="px-3 py-2">{t("nafsulAnggotaForm.address")}</th>
                    <th className="px-3 py-2">{t("nafsulAnggota.colRegion")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-center">
                      {/* Ikon saja — artinya dibawa `title` + `aria-label`.
                          `type="button"`: modal ini dipasang DI DALAM formulir
                          pendaftaran, dan tombol tanpa `type` bertipe submit
                          sehingga akan menyimpan anggota setengah jadi. */}
                      <Button
                        type="button"
                        size="xs"
                        title={t("nafsulAnggotaForm.kkSearchUse")}
                        aria-label={t("nafsulAnggotaForm.kkSearchUse")}
                        onClick={() => onPilih(terpilih)}
                        className="bg-[#075489] hover:bg-[#075489]/90 text-white"
                      >
                        {/* Diputar seperempat berlawanan jarum jam supaya
                            panahnya mengarah KE ATAS, bukan ke samping —
                            datanya memang naik ke formulir di belakang modal
                            ini, bukan berpindah ke kanan. */}
                        <LogOut className="h-3.5 w-3.5 -rotate-90" />
                      </Button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-700">
                      {terpilih.nokk ?? <Kosong />}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{terpilih.nama}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {terpilih.telepon ?? <Kosong />}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {terpilih.alamat ?? <Kosong />}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {terpilih.wilayah?.nama ?? <Kosong />}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

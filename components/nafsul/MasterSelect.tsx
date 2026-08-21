"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/nafsul/api";
import type { Paginated } from "@/lib/nafsul/types";
import { SelectSearch, type SelectSearchOption } from "@/components/atoms/SelectSearch";
import { useT } from "@/lib/i18n";

/** Banyak opsi yang ditarik sekali jalan — juga jumlah yang tampil pertama kali. */
const PER_PAGE = 20;

/** Jeda ketik sebelum pencarian dikirim ke server. */
const DEBOUNCE_MS = 350;

/**
 * Dropdown master dengan pencarian di sisi server.
 *
 * Opsi **tidak** ditarik saat halaman dibuka, melainkan saat dropdown pertama
 * kali dibuka — master seperti ketua kelompok bisa ratusan baris, dan sebagian
 * besar form tidak pernah menyentuhnya. Sekali buka hanya mengambil 20 baris
 * pertama; sisanya dicari lewat kotak pencarian, yang dikirim setelah pengguna
 * berhenti mengetik (debounce) supaya tidak satu permintaan per huruf.
 */
export default function MasterSelect<T>({
  endpoint,
  value,
  onChange,
  toOption,
  placeholder,
  searchPlaceholder,
  labelTerpilih,
  params,
}: {
  /** Endpoint master, mis. "/wilayah". */
  endpoint: string;
  value: string;
  /**
   * `row` adalah baris master yang dipilih, bila masih ada di daftar yang
   * sedang dimuat. Berguna untuk memakai field lain dari baris itu (mis.
   * mengisi nominal dari harga tarif) tanpa permintaan tambahan.
   */
  onChange: (value: string, row?: T) => void;
  /** Ubah satu baris master jadi opsi dropdown. */
  toOption: (row: T) => SelectSearchOption;
  placeholder?: string;
  /** Kosongkan agar memakai teks bawaan yang mengikuti bahasa aktif. */
  searchPlaceholder?: string;
  /** Label nilai terpilih saat opsinya belum dimuat (form edit). */
  labelTerpilih?: string;
  /**
   * Parameter penyaring tambahan, mis. `{ noketua: "KKL2601001" }`.
   *
   * Opsi dimuat sekali lalu ditahan, jadi mengubah isi `params` TIDAK memicu
   * pemuatan ulang. Pemanggil yang menyaring secara dinamis perlu memberi
   * `key` yang ikut berubah supaya komponennya dipasang ulang — kalau tidak,
   * daftarnya masih menampilkan hasil saringan yang lama.
   */
  params?: Record<string, string | number | undefined>;
}) {
  const t = useT();
  const [options, setOptions] = useState<SelectSearchOption[]>([]);
  // Baris mentah disimpan berdampingan dengan opsinya: `toOption` hanya
  // menyisakan value & label, sedangkan pemanggil kadang butuh field lain.
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Menandai permintaan terakhir; balasan yang datang telat diabaikan supaya
  // hasil ketikan lama tidak menimpa hasil ketikan terbaru.
  const permintaan = useRef(0);
  /**
   * Kata kunci yang isinya sedang ditampilkan (null = belum pernah memuat).
   *
   * Jadi penentu tunggal apakah sebuah permintaan perlu dikirim. Membuka
   * dropdown memicu DUA callback sekaligus dari SelectSearch —
   * `onQueryChange("")` lalu `onOpen()` — dan tanpa penanda ini keduanya
   * sama-sama menembak endpoint yang sama, jadi satu klik = dua GET.
   */
  const terakhirDimuat = useRef<string | null>(null);

  // Kalau sudah ada nilai terpilih tapi labelnya tidak diberikan, opsi terpaksa
  // dimuat di awal — tanpa itu tombolnya cuma menampilkan placeholder seolah
  // belum ada yang dipilih.
  useEffect(() => {
    if (value && !labelTerpilih) muat("");

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function muat(search: string) {
    const nomor = ++permintaan.current;
    terakhirDimuat.current = search;
    setLoading(true);

    try {
      const res = await api<Paginated<T>>(endpoint, {
        params: { ...params, search, per_page: PER_PAGE },
      });
      if (nomor === permintaan.current) {
        setOptions(res.data.map(toOption));
        setRows(res.data);
      }
    } catch {
      if (nomor === permintaan.current) {
        setOptions([]);
        setRows([]);
      }
    } finally {
      if (nomor === permintaan.current) setLoading(false);
    }
  }

  /**
   * Dropdown dibuka: pastikan daftarnya kembali tanpa filter.
   *
   * Dipanggil SETELAH `handleQuery("")`, jadi debounce yang baru saja
   * dijadwalkan di sana dibatalkan dulu — pemuatannya dikerjakan di sini
   * secara langsung supaya tidak perlu menunggu jeda ketik.
   */
  function handleOpen() {
    if (timer.current) clearTimeout(timer.current);
    if (terakhirDimuat.current === "") return; // daftar tanpa filter sudah tampil
    muat("");
  }

  function handleQuery(query: string) {
    if (timer.current) clearTimeout(timer.current);
    if (query === terakhirDimuat.current) return; // isinya sudah sesuai kata kunci ini
    timer.current = setTimeout(() => muat(query), DEBOUNCE_MS);
  }

  return (
    <SelectSearch
      options={options}
      value={value}
      onChange={(v) => onChange(v, rows.find((row) => toOption(row).value === v))}
      loading={loading}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder ?? t("common.searchPlaceholder")}
      labelTerpilih={labelTerpilih}
      onOpen={handleOpen}
      onQueryChange={handleQuery}
    />
  );
}

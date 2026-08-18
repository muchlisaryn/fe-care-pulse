"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/nafsul/api";
import type { Paginated } from "@/lib/nafsul/types";
import { SelectSearch, type SelectSearchOption } from "@/components/atoms/SelectSearch";

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
  searchPlaceholder = "Cari...",
  labelTerpilih,
}: {
  /** Endpoint master, mis. "/wilayah". */
  endpoint: string;
  value: string;
  onChange: (value: string) => void;
  /** Ubah satu baris master jadi opsi dropdown. */
  toOption: (row: T) => SelectSearchOption;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Label nilai terpilih saat opsinya belum dimuat (form edit). */
  labelTerpilih?: string;
}) {
  const [options, setOptions] = useState<SelectSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const sudahDibuka = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Menandai permintaan terakhir; balasan yang datang telat diabaikan supaya
  // hasil ketikan lama tidak menimpa hasil ketikan terbaru.
  const permintaan = useRef(0);

  // Kalau sudah ada nilai terpilih tapi labelnya tidak diberikan, opsi terpaksa
  // dimuat di awal — tanpa itu tombolnya cuma menampilkan placeholder seolah
  // belum ada yang dipilih.
  useEffect(() => {
    if (value && !labelTerpilih && !sudahDibuka.current) {
      sudahDibuka.current = true;
      muat("");
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function muat(search: string) {
    const nomor = ++permintaan.current;
    setLoading(true);

    try {
      const res = await api<Paginated<T>>(endpoint, {
        params: { search, per_page: PER_PAGE },
      });
      if (nomor === permintaan.current) setOptions(res.data.map(toOption));
    } catch {
      if (nomor === permintaan.current) setOptions([]);
    } finally {
      if (nomor === permintaan.current) setLoading(false);
    }
  }

  function handleOpen() {
    if (sudahDibuka.current) return;
    sudahDibuka.current = true;
    muat("");
  }

  function handleQuery(query: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => muat(query), DEBOUNCE_MS);
  }

  return (
    <SelectSearch
      options={options}
      value={value}
      onChange={onChange}
      loading={loading}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      labelTerpilih={labelTerpilih}
      onOpen={handleOpen}
      onQueryChange={handleQuery}
    />
  );
}

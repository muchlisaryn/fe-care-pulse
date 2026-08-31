"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowLeft, Combine, Search } from "lucide-react";
import { api, ApiError } from "@/lib/nafsul/api";
import type { Paginated } from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { Input } from "@/components/atoms/Input";
import { Modal } from "@/components/molecules/Modal";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { Pagination } from "@/components/molecules/Pagination";
import { ResultDialog } from "@/components/molecules/ResultDialog";
import MasterSelect from "@/components/nafsul/MasterSelect";
import { useT } from "@/lib/i18n";
import { rupiah } from "@/lib/format";

/** Nilai kosong tidak boleh tampil sebagai sel kosong — aturan komponen repo. */
const tandaKosong = <span className="text-xs text-gray-400">—</span>;

/** Satu baris riwayat penggabungan, sebagaimana dikirim `/gabung-anggota`. */
type Riwayat = {
  id: number;
  uuid: string;
  anggota_asal: Anggota | null;
  anggota_tujuan: Anggota | null;
  header_count: number;
  /** Rincian yang benar-benar BERPINDAH. */
  transaction_count: number;
  /** Rincian yang DINONAKTIFKAN karena periodenya bentrok. */
  disabled_count: number;
  amount: string;
  source_disabled: boolean;
  note: string | null;
  created_at: string | null;
  created_by: string | null;
};

/** Satu anggota sebagaimana dikembalikan `/anggota`. */
// `no_anggota` bisa null pada data lama — lihat `Anggota` di lib/nafsul/types.
type Anggota = { id: number; no_anggota: string | null; nama: string };

/** Label satu anggota di dropdown & ringkasan; nomor kosong tidak ditulis "null". */
const labelAnggota = (a: Anggota | null) =>
  a ? [a.no_anggota, a.nama].filter(Boolean).join(" — ") : "";

/** Satu rincian di dalam kelompok kuitansi. */
type Rincian = {
  id: number;
  rate: string | null;
  payment_period: string | null;
  total: string;
  conflict: boolean;
};

/** Satu kelompok = satu nomor kuitansi (atau kelompok "tanpa kuitansi"). */
type Kelompok = {
  transaction_header_id: number | null;
  transaction_number: string | null;
  date: string | null;
  is_validated: boolean;
  transaction_count: number;
  amount: number;
  conflict_count: number;
  can_merge: boolean;
  transactions: Rincian[];
};

type Ringkasan = {
  member: { id: number; no_anggota: string; nama: string };
  total_headers: number;
  total_transactions: number;
  total_amount: number;
  conflict_count: number;
  groups: Kelompok[];
};

/** Kunci pilihan untuk kelompok tanpa kuitansi — id-nya null, tidak bisa jadi kunci. */
const TANPA_KUITANSI = "tanpa-kuitansi";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Dipanggil setelah penggabungan berhasil, agar daftar anggota dimuat ulang. */
  onSuccess: () => void;
};

/**
 * Gabung Anggota — memindahkan transaksi seorang anggota ke anggota lain.
 *
 * Tiga langkah, sengaja tidak dijadikan satu formulir panjang: memilih anggota
 * TUJUAN harus terjadi sebelum daftar transaksi dimuat, karena daftar itulah
 * yang menandai baris mana yang bentrok dengan transaksi milik tujuan. Satu
 * halaman penuh tidak bisa menjamin urutan itu.
 *
 * Yang berpindah hanya rincian milik anggota asal. Satu kuitansi bisa memuat
 * rincian beberapa anggota sekaligus, dan rincian milik orang lain tidak pernah
 * ikut — nomor kuitansi di sini hanya cara mengelompokkan pilihan.
 */
export default function GabungAnggotaModal({ open, onClose, onSuccess }: Props) {
  const t = useT();

  const [langkah, setLangkah] = useState<1 | 2 | 3>(1);
  const [asal, setAsal] = useState<Anggota | null>(null);
  const [tujuan, setTujuan] = useState<Anggota | null>(null);
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [catatan, setCatatan] = useState("");
  /**
   * Izin menonaktifkan rincian yang periodenya bentrok.
   *
   * MATI secara bawaan, dan memang harus begitu: ia menghapus (lunak) catatan
   * setoran, jadi tidak boleh terjadi sebagai efek samping dari tombol Gabungkan
   * yang ditekan tanpa membaca apa pun.
   */
  const [selesaikanBentrok, setSelesaikanBentrok] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hasil, setHasil] = useState<{ sukses: boolean; pesan: string } | null>(null);

  // ── Riwayat penggabungan ────────────────────────────────────────────────
  // `cariInput` adalah draft yang diketik; `cari` baru berisi setelah tombol
  // Cari ditekan — pencarian di repo ini tidak pernah live.
  const [cariInput, setCariInput] = useState("");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  /**
   * Rentang tanggal penggabungan. Kosong = seluruh riwayat.
   *
   * Sengaja TIDAK dibawakan bawaan "bulan ini" seperti dashboard: yang dicari
   * di sini biasanya satu penggabungan tertentu yang bisa saja terjadi berbulan
   * lalu, dan menyaringnya diam-diam ke bulan berjalan akan membuat riwayatnya
   * terlihat kosong padahal ada.
   */
  const [rentang, setRentang] = useState({ from: "", to: "" });
  /**
   * Dinaikkan setelah penggabungan berhasil, dan ikut jadi bagian kunci di
   * bawah. Tanpa itu, memuat ulang riwayat pada pencarian & halaman yang sama
   * tidak mengubah kuncinya sama sekali — sehingga baris yang baru saja dibuat
   * tidak pernah muncul.
   */
  const [versiRiwayat, setVersiRiwayat] = useState(0);

  /**
   * Hasil disimpan BERSAMA kunci permintaannya, dan status memuat diturunkan
   * dari perbandingan kunci — bukan disimpan sebagai state tersendiri yang
   * di-set di badan effect. setState sinkron di dalam effect memicu render
   * beruntun dan dilarang aturan react-hooks; pola ini juga dipakai ketiga
   * halaman dashboard.
   */
  const kunciRiwayat = `${cari}|${rentang.from}|${rentang.to}|${halaman}|${versiRiwayat}`;
  const [hasilRiwayat, setHasilRiwayat] = useState<{
    kunci: string;
    isi: Paginated<Riwayat> | null;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let aktif = true;

    api<Paginated<Riwayat>>("/gabung-anggota", {
      params: {
        search: cari || undefined,
        date_from: rentang.from || undefined,
        date_to: rentang.to || undefined,
        page: halaman,
      },
    })
      .then((res) => {
        if (aktif) setHasilRiwayat({ kunci: kunciRiwayat, isi: res });
      })
      .catch(() => {
        // Riwayat adalah pelengkap, bukan syarat: kegagalannya tidak boleh
        // memunculkan dialog error di atas wizard yang sedang dipakai. Kuncinya
        // tetap ditandai selesai supaya tidak memuat selamanya.
        if (aktif) setHasilRiwayat({ kunci: kunciRiwayat, isi: null });
      });

    return () => {
      aktif = false;
    };
  }, [open, kunciRiwayat, cari, rentang.from, rentang.to, halaman]);

  const memuatRiwayat = hasilRiwayat?.kunci !== kunciRiwayat;
  const riwayat = hasilRiwayat?.isi ?? null;

  function cariRiwayat(e: React.FormEvent) {
    e.preventDefault();
    setCari(cariInput);
    setHalaman(1);
  }

  const kolomRiwayat: Column<Riwayat>[] = [
    {
      header: t("gabungAnggota.histDate"),
      cell: (r) => r.created_at?.slice(0, 16) ?? tandaKosong,
    },
    {
      header: t("gabungAnggota.histMembers"),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-gray-900">{labelAnggota(r.anggota_asal)}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="font-medium text-gray-900">{labelAnggota(r.anggota_tujuan)}</span>
        </span>
      ),
    },
    {
      header: t("gabungAnggota.histMoved"),
      cell: (r) => (
        <span className="tabular-nums text-gray-700">
          {r.transaction_count}
          {/* Yang dinonaktifkan disebut terpisah dan diberi warna: ia bukan
              perpindahan, melainkan rincian yang dibuang karena bentrok. */}
          {r.disabled_count > 0 && (
            <span className="ml-2 text-amber-700">
              +{r.disabled_count} {t("gabungAnggota.histDisabled")}
            </span>
          )}
        </span>
      ),
    },
    {
      header: t("gabungAnggota.histAmount"),
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{rupiah(Number(r.amount))}</span>,
    },
    {
      header: t("gabungAnggota.histBy"),
      cell: (r) => r.created_by || tandaKosong,
    },
  ];

  /** Kembalikan seluruh isian ke keadaan awal — dipakai saat modal ditutup. */
  function reset() {
    setLangkah(1);
    setAsal(null);
    setTujuan(null);
    setRingkasan(null);
    setTerpilih(new Set());
    setCatatan("");
    setSelesaikanBentrok(false);
    setMenyimpan(false);
    // Pencarian riwayat ikut dikosongkan supaya baris terbaru pasti terlihat.
    setCariInput("");
    setCari("");
    setRentang({ from: "", to: "" });
    setHalaman(1);
  }

  function tutup() {
    reset();
    onClose();
  }

  /** Kunci pilihan satu kelompok. */
  const kunci = (k: Kelompok) =>
    k.transaction_header_id === null ? TANPA_KUITANSI : String(k.transaction_header_id);

  /**
   * Muat transaksi anggota asal, ditandai bentrok terhadap anggota tujuan.
   *
   * Kelompok yang bisa dipindahkan langsung TERCENTANG semua: penggabungan
   * hampir selalu memindahkan seluruhnya, dan memaksa petugas mencentang tiga
   * puluh kuitansi satu per satu untuk kasus yang paling umum itu hanya
   * mengundang kesalahan.
   */
  async function muatTransaksi() {
    if (!asal || !tujuan) return;
    setMemuat(true);
    try {
      const res = await api<{ data: Ringkasan }>(
        `/gabung-anggota/anggota/${asal.id}/transaksi`,
        { params: { target_member_id: tujuan.id } },
      );
      setRingkasan(res.data);
      setTerpilih(new Set(res.data.groups.filter((g) => g.can_merge).map(kunci)));
      setLangkah(3);
    } catch (err) {
      setHasil({
        sukses: false,
        pesan: err instanceof ApiError ? err.message : t("common.failed"),
      });
    } finally {
      setMemuat(false);
    }
  }

  /** Kelompok bentrok baru bisa dipilih setelah izin menonaktifkan diberikan. */
  const bolehPilih = (k: Kelompok) => k.can_merge || selesaikanBentrok;

  function togglePilih(k: Kelompok) {
    if (!bolehPilih(k)) return;
    setTerpilih((s) => {
      const baru = new Set(s);
      const key = kunci(k);
      if (baru.has(key)) baru.delete(key);
      else baru.add(key);
      return baru;
    });
  }

  const bisaDipindah = ringkasan?.groups.filter(bolehPilih) ?? [];
  const semuaTercentang = bisaDipindah.length > 0 && bisaDipindah.every((g) => terpilih.has(kunci(g)));

  function toggleSemua() {
    setTerpilih(semuaTercentang ? new Set() : new Set(bisaDipindah.map(kunci)));
  }

  /** Jumlah rincian & nominal yang benar-benar akan berpindah. */
  const pilihan = (ringkasan?.groups ?? []).filter((g) => terpilih.has(kunci(g)));
  const jumlahRincian = pilihan.reduce((a, g) => a + g.transaction_count, 0);

  /**
   * Anggota asal sama sekali belum punya transaksi.
   *
   * Keadaan ini TETAP boleh digabungkan — justru bentuk data ganda yang paling
   * sepele: dua kartu untuk orang yang sama, salah satunya belum pernah dipakai
   * menyetor. Yang terjadi cuma anggota asalnya dinonaktifkan.
   *
   * Dibedakan dari "punya transaksi tapi belum satu pun dicentang", yang tetap
   * dikunci: yang itu salah pakai, dan meloloskannya cuma menghasilkan riwayat
   * penggabungan kosong sementara transaksinya masih tertinggal di kartu lama.
   */
  const tanpaTransaksi = ringkasan !== null && ringkasan.total_transactions === 0;
  const jumlahNominal = pilihan.reduce((a, g) => a + g.amount, 0);

  async function simpan() {
    if (!asal || !tujuan) return;
    setMenyimpan(true);
    try {
      const headerIds = pilihan
        .map((g) => g.transaction_header_id)
        .filter((id): id is number => id !== null);

      const res = await api<{ message: string }>("/gabung-anggota", {
        method: "POST",
        body: {
          source_member_id: asal.id,
          target_member_id: tujuan.id,
          transaction_header_ids: headerIds,
          include_without_header: terpilih.has(TANPA_KUITANSI),
          resolve_conflicts: selesaikanBentrok,
          note: catatan || undefined,
        },
      });

      // Modal TETAP TERBUKA, hanya wizardnya yang dikosongkan. Riwayat di
      // bawahnya dimuat ulang sehingga penggabungan yang barusan langsung
      // terlihat sebagai baris baru — itulah gunanya riwayat ada di sini.
      // Dialog hasil muncul di atasnya karena dirender setelah modal.
      reset();
      onSuccess();
      setVersiRiwayat((v) => v + 1);
      setHasil({ sukses: true, pesan: res.message });
    } catch (err) {
      setHasil({
        sukses: false,
        pesan: err instanceof ApiError ? err.message : t("common.failed"),
      });
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={tutup}
        title={t("gabungAnggota.title")}
        size="xl"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={tutup} disabled={menyimpan}>
              {t("common.close")}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* ── Langkah 1 & 2: dua anggota yang terlibat ───────────────────── */}
          {langkah === 1 && (
            <Langkah
              judul={t("gabungAnggota.step1Title")}
              keterangan={t("gabungAnggota.step1Desc")}
            >
              <MasterSelect<Anggota>
                endpoint="/anggota"
                value={asal ? String(asal.id) : ""}
                labelTerpilih={asal ? labelAnggota(asal) : undefined}
                onChange={(v, row) => setAsal(v ? (row ?? asal) : null)}
                toOption={(a) => ({ value: String(a.id), label: labelAnggota(a) })}
                placeholder={t("gabungAnggota.pickSource")}
              />
            </Langkah>
          )}

          {langkah === 2 && (
            <Langkah
              judul={t("gabungAnggota.step2Title")}
              keterangan={t("gabungAnggota.step2Desc")}
            >
              <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {t("gabungAnggota.fromLabel")}:{" "}
                <span className="font-semibold text-gray-900">
                  {labelAnggota(asal)}
                </span>
              </p>

              <MasterSelect<Anggota>
                // `key` memuat id anggota asal supaya daftarnya dipasang ulang
                // saat asal diganti — tanpa itu `exclude_ids` yang lama masih
                // berlaku dan anggota asal yang baru tetap bisa dipilih.
                key={`tujuan-${asal?.id}`}
                endpoint="/anggota"
                params={{ exclude_ids: asal ? String(asal.id) : undefined }}
                value={tujuan ? String(tujuan.id) : ""}
                labelTerpilih={tujuan ? labelAnggota(tujuan) : undefined}
                onChange={(v, row) => setTujuan(v ? (row ?? tujuan) : null)}
                toOption={(a) => ({ value: String(a.id), label: labelAnggota(a) })}
                placeholder={t("gabungAnggota.pickTarget")}
              />
            </Langkah>
          )}

          {/* ── Langkah 3 & 4: pilih nomor transaksi yang dipindahkan ──────── */}
          {langkah === 3 && ringkasan && (
            <Langkah
              judul={t("gabungAnggota.step3Title")}
              keterangan={t("gabungAnggota.step3Desc")}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-600">
                  <span className="font-semibold text-gray-900">
                    {labelAnggota(asal)}
                  </span>
                  <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-gray-400" />
                  <span className="font-semibold text-gray-900">
                    {labelAnggota(tujuan)}
                  </span>
                </span>
                <span className="text-xs text-gray-500">
                  {t("gabungAnggota.summary", {
                    groups: String(jumlahRincian > 0 ? pilihan.length : 0),
                    rows: String(jumlahRincian),
                    amount: rupiah(jumlahNominal),
                  })}
                </span>
              </div>

              {ringkasan.groups.length === 0 ? (
                // Bukan jalan buntu: tombol Gabungkan tetap hidup, dan
                // kalimatnya menyebutkan apa yang akan terjadi supaya petugas
                // tidak mengira layarnya sedang menolak.
                <div className="py-10 text-center text-sm text-gray-500">
                  {t("gabungAnggota.noTransactions")}
                </div>
              ) : (
                <>
                  {ringkasan.conflict_count > 0 && (
                    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <p className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {t("gabungAnggota.conflictWarning", {
                          count: String(ringkasan.conflict_count),
                        })}
                      </p>

                      {/* Jalan keluarnya ditawarkan di sini, tepat di bawah
                          penjelasan bentroknya — bukan sebagai pilihan lepas di
                          tempat lain yang harus dicari sendiri. Sengaja mati
                          secara bawaan: mencentangnya MENGHAPUS (lunak) rincian
                          milik anggota asal. */}
                      <label className="mt-2 flex cursor-pointer items-start gap-2 border-t border-amber-300/70 pt-2 font-medium">
                        <Checkbox
                          checked={selesaikanBentrok}
                          onChange={(e) => setSelesaikanBentrok(e.target.checked)}
                          className="mt-0.5"
                        />
                        {t("gabungAnggota.resolveConflicts")}
                      </label>
                    </div>
                  )}

                  <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-gray-100 pb-2 text-sm font-medium text-gray-700">
                    <Checkbox
                      checked={semuaTercentang}
                      indeterminate={!semuaTercentang && terpilih.size > 0}
                      onChange={toggleSemua}
                      disabled={bisaDipindah.length === 0}
                    />
                    {t("gabungAnggota.selectAll")}
                  </label>

                  <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {ringkasan.groups.map((g) => (
                      <li key={kunci(g)}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                            bolehPilih(g)
                              ? terpilih.has(kunci(g))
                                ? "border-[#075489]/40 bg-[#075489]/5"
                                : "border-gray-200 hover:bg-gray-50"
                              : "cursor-not-allowed border-amber-200 bg-amber-50/50"
                          }`}
                        >
                          <Checkbox
                            checked={terpilih.has(kunci(g))}
                            onChange={() => togglePilih(g)}
                            disabled={!bolehPilih(g)}
                          />

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900">
                              {g.transaction_number ?? t("gabungAnggota.withoutReceipt")}
                              {g.is_validated && (
                                <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                                  {t("gabungAnggota.validated")}
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-gray-500">
                              {g.date ?? "—"} · {t("gabungAnggota.rowCount", {
                                count: String(g.transaction_count),
                              })}
                              {!g.can_merge && (
                                <span className="ml-2 font-medium text-amber-700">
                                  {t("gabungAnggota.conflictBadge")}
                                </span>
                              )}
                            </span>
                          </span>

                          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                            {rupiah(g.amount)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {t("gabungAnggota.note")}
                    </label>
                    <Input
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      placeholder={t("gabungAnggota.notePlaceholder")}
                      maxLength={255}
                    />
                  </div>
                </>
              )}
            </Langkah>
          )}

          {/* Tombol wizard DI SINI, bukan di kaki modal. Di kaki, ia duduk di
              bawah tabel riwayat dan terbaca seolah tombol untuk tabel itu —
              "Lanjut" di bawah daftar riwayat tidak jelas melanjutkan apa. */}
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-4">
            <span className="text-xs text-gray-400">
              {t("gabungAnggota.step", { step: String(langkah), total: "3" })}
            </span>

            <div className="flex gap-2">
              {langkah > 1 && (
                <Button
                  variant="secondary"
                  onClick={() => setLangkah((s) => (s === 3 ? 2 : 1))}
                  disabled={menyimpan}
                  className="flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("common.back")}
                </Button>
              )}

              {langkah < 3 ? (
                <Button
                  onClick={() => (langkah === 1 ? setLangkah(2) : muatTransaksi())}
                  disabled={langkah === 1 ? !asal : !tujuan || memuat}
                  className="flex items-center gap-1.5"
                >
                  {memuat ? t("common.loading") : t("gabungAnggota.next")}
                  {!memuat && <ArrowRight className="h-4 w-4" />}
                </Button>
              ) : (
                <Button
                  onClick={simpan}
                  disabled={menyimpan || (jumlahRincian === 0 && !tanpaTransaksi)}
                  className="flex items-center gap-1.5"
                >
                  <Combine className="h-4 w-4" />
                  {menyimpan ? t("common.saving") : t("gabungAnggota.merge")}
                </Button>
              )}
            </div>
          </div>

          {/* ── Riwayat penggabungan ────────────────────────────────────────
              Ditaruh DI DALAM modal yang sama, di bawah wizard: pertanyaan
              "anggota ini dulu digabungkan ke mana" hampir selalu muncul tepat
              saat hendak menggabungkan yang lain, dan memindahkannya ke halaman
              terpisah berarti pekerjaan yang sedang berjalan harus ditinggalkan
              dulu. */}
          <div className="border-t border-gray-100 pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-800">
                  {t("gabungAnggota.historyTitle")}
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">{t("gabungAnggota.historySub")}</p>
              </div>

              {/* Pencarian pakai tombol, bukan live search — aturan komponen
                  repo ini. Enter juga men-submit karena berupa <form>.
                  Tanggal langsung menyaring saat diubah: ia bukan ketikan yang
                  perlu diselesaikan dulu, jadi menunggu tombol malah membingungkan. */}
              <form onSubmit={cariRiwayat} className="flex w-full flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={rentang.from}
                  max={rentang.to || undefined}
                  onChange={(e) => {
                    setRentang((r) => ({ ...r, from: e.target.value }));
                    setHalaman(1);
                  }}
                  className="w-full sm:w-36"
                  aria-label={t("common.dateFrom")}
                />
                <Input
                  type="date"
                  value={rentang.to}
                  min={rentang.from || undefined}
                  onChange={(e) => {
                    setRentang((r) => ({ ...r, to: e.target.value }));
                    setHalaman(1);
                  }}
                  className="w-full sm:w-36"
                  aria-label={t("common.dateTo")}
                />

                <div className="relative min-w-40 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={cariInput}
                    onChange={(e) => setCariInput(e.target.value)}
                    placeholder={t("gabungAnggota.historySearch")}
                    className="pl-9"
                  />
                </div>

                {/* Warna merek, mengikuti pola tombol Cari di seluruh halaman
                    daftar repo ini — bukan varian bawaan yang gelap. */}
                <Button type="submit" className="shrink-0 bg-[#075489] text-white hover:bg-[#075489]/90">
                  {t("common.search")}
                </Button>
              </form>
            </div>

            {memuatRiwayat ? (
              <div className="py-10 text-center text-sm text-gray-400">{t("common.loading")}</div>
            ) : (
              <>
                <DataTable
                  columns={kolomRiwayat}
                  data={riwayat?.data ?? []}
                  hideRowNumber
                  emptyMessage={t("gabungAnggota.historyEmpty")}
                />

                {riwayat && (
                  <Pagination
                    currentPage={riwayat.current_page}
                    totalPages={riwayat.last_page}
                    totalItems={riwayat.total}
                    itemsPerPage={riwayat.per_page}
                    onPageChange={setHalaman}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </Modal>

      <ResultDialog
        open={hasil !== null}
        onClose={() => setHasil(null)}
        variant={hasil?.sukses ? "success" : "error"}
        description={hasil?.pesan}
      />
    </>
  );
}

/** Kepala tiap langkah — judul + keterangan, seragam di ketiganya. */
function Langkah({
  judul,
  keterangan,
  children,
}: {
  judul: string;
  keterangan: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800">{judul}</h3>
      <p className="mb-3 mt-0.5 text-xs text-gray-500">{keterangan}</p>
      {children}
    </div>
  );
}


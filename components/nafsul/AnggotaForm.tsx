"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/nafsul/api";
import type {
  Anggota,
  KetuaKelompok,
  Kota,
  Pekerjaan,
  Pendidikan,
  StatusAnggota,
  Wilayah,
} from "@/lib/nafsul/types";
import { Button } from "@/components/atoms/Button";
import { FieldGroup } from "@/components/molecules/FieldGroup";
import { Input } from "@/components/atoms/Input";
import { ResultDialog } from "@/components/molecules/ResultDialog";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";
import { apiErrorMessage } from "@/lib/apiError";

type FormState = Record<string, string>;

const FIELDS = [
  "kode_wilayah", "noketua", "nokk", "no_anggota",
  "nama", "tgl_lahir", "kode_kota_lahir", "jenis_kelamin", "pendidikan_id",
  "pekerjaan_id", "status_nikah", "noktp", "alamat", "telepon", "tgl_aktif",
  "tgl_nonaktif", "kode_status", "keterangan", "nama_keluarga",
  "hubungan", "alamat_keluarga", "telepon_keluarga", "kunjungan", "tgl_update",
];

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export default function AnggotaForm({ anggota }: { anggota?: Anggota }) {
  const router = useRouter();
  const isEdit = !!anggota;

  const [form, setForm] = useState<FormState>(() => {
    const initial: FormState = {};
    FIELDS.forEach((f) => {
      const v = anggota ? (anggota as unknown as Record<string, unknown>)[f] : "";
      initial[f] = v == null ? "" : String(v);
    });
    ["tgl_lahir", "tgl_aktif", "tgl_nonaktif", "tgl_update"].forEach((f) => {
      initial[f] = toDateInput(anggota?.[f as keyof Anggota] as string | null);
    });
    // Anggota baru: default aktif sejak hari ini agar terhitung di Laporan/Dashboard.
    if (!anggota) {
      initial.tgl_aktif = new Date().toISOString().slice(0, 10);
      initial.kode_status = "STS1";
    }
    return initial;
  });

  const [wilayahOpts, setWilayahOpts] = useState<Wilayah[]>([]);
  const [ketuaOpts, setKetuaOpts] = useState<KetuaKelompok[]>([]);
  const [kotaOpts, setKotaOpts] = useState<Kota[]>([]);
  const [statusOpts, setStatusOpts] = useState<StatusAnggota[]>([]);
  const [pendidikanOpts, setPendidikanOpts] = useState<Pendidikan[]>([]);
  const [pekerjaanOpts, setPekerjaanOpts] = useState<Pekerjaan[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  /**
   * Pesan gagal simpan. Hasil BERHASIL tidak memakai dialog: halaman langsung
   * pindah ke daftar / halaman edit, jadi dialognya tak sempat terbaca.
   */
  const [gagal, setGagal] = useState<string | null>(null);

  useEffect(() => {
    api<Wilayah[]>("/wilayah", { params: { all: 1 } }).then(setWilayahOpts);
    api<KetuaKelompok[]>("/ketua-kelompok", { params: { all: 1 } }).then(setKetuaOpts);
    api<Kota[]>("/kota", { params: { all: 1 } }).then(setKotaOpts);
    api<StatusAnggota[]>("/status-anggota", { params: { all: 1 } }).then(setStatusOpts);
    api<Pendidikan[]>("/pendidikan", { params: { all: 1 } }).then(setPendidikanOpts);
    api<Pekerjaan[]>("/pekerjaan", { params: { all: 1 } }).then(setPekerjaanOpts);
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setGagal(null);

    const payload: Record<string, string | null> = {};
    FIELDS.forEach((f) => {
      payload[f] = form[f] === "" ? null : form[f];
    });

    try {
      if (isEdit) {
        await api(`/anggota/${anggota!.id}`, { method: "PUT", body: payload });
        // Sudah berada di halaman edit-nya, jadi kembali ke daftar.
        router.push("/nafsul/master/anggota");
      } else {
        const created = await api<Anggota>("/anggota", { method: "POST", body: payload });
        router.push(`/nafsul/master/anggota/${created.id}/edit`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(err.errors);
        setGagal("Periksa kembali isian yang ditandai.");
      } else {
        setGagal(apiErrorMessage(err, "Gagal menyimpan data."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const err = (f: string) =>
    errors[f] ? <span className="text-xs text-rose-600">{errors[f][0]}</span> : null;

  return (
    <>
      <ResultDialog
        open={gagal !== null}
        onClose={() => setGagal(null)}
        variant="error"
        description={gagal ?? undefined}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="Identitas">
          <FieldGroup label="Nama Lengkap" className="md:col-span-2">
            <Input value={form.nama} onChange={(e) => set("nama", e.target.value)} required />
            {err("nama")}
          </FieldGroup>
          <FieldGroup label="Jenis Kelamin">
            <Select value={form.jenis_kelamin} onChange={(e) => set("jenis_kelamin", e.target.value)}>
              <option value="">-</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </Select>
          </FieldGroup>
          <FieldGroup label="No. KTP">
            <Input value={form.noktp} onChange={(e) => set("noktp", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="No. KK">
            <Input value={form.nokk} onChange={(e) => set("nokk", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Status Nikah">
            <Input value={form.status_nikah} onChange={(e) => set("status_nikah", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Pendidikan">
            <Select value={form.pendidikan_id} onChange={(e) => set("pendidikan_id", e.target.value)}>
              <option value="">-</option>
              {pendidikanOpts.map((p) => (
                <option key={p.id} value={p.id}>{p.nama}</option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Pekerjaan">
            <Select value={form.pekerjaan_id} onChange={(e) => set("pekerjaan_id", e.target.value)}>
              <option value="">-</option>
              {pekerjaanOpts.map((p) => (
                <option key={p.id} value={p.id}>{p.nama}</option>
              ))}
            </Select>
          </FieldGroup>
        </Section>

        <Section title="Kelahiran & Domisili">
          <FieldGroup label="Kota Lahir">
            <Select value={form.kode_kota_lahir} onChange={(e) => set("kode_kota_lahir", e.target.value)}>
              <option value="">-</option>
              {kotaOpts.map((k) => (
                <option key={k.kode} value={k.kode}>{k.nama}</option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Tanggal Lahir">
            <Input type="date" value={form.tgl_lahir} onChange={(e) => set("tgl_lahir", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Telepon">
            <Input value={form.telepon} onChange={(e) => set("telepon", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Alamat" className="md:col-span-3">
            <Textarea rows={2} value={form.alamat} onChange={(e) => set("alamat", e.target.value)} />
          </FieldGroup>
        </Section>

        <Section title="Keanggotaan">
          <FieldGroup label="No. Anggota">
            <Input value={form.no_anggota} onChange={(e) => set("no_anggota", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Wilayah">
            <Select value={form.kode_wilayah} onChange={(e) => set("kode_wilayah", e.target.value)}>
              <option value="">-</option>
              {wilayahOpts.map((w) => (
                <option key={w.kode} value={w.kode}>{w.nama}</option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Ketua Kelompok">
            <Select value={form.noketua} onChange={(e) => set("noketua", e.target.value)}>
              <option value="">-</option>
              {ketuaOpts.map((k) => (
                <option key={k.noketua} value={k.noketua}>{k.nama} ({k.noketua})</option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Status Anggota">
            <Select value={form.kode_status} onChange={(e) => set("kode_status", e.target.value)}>
              <option value="">-</option>
              {statusOpts.map((s) => (
                <option key={s.kode} value={s.kode}>{s.nama}</option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Keterangan">
            <Input value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Tanggal Aktif">
            <Input type="date" value={form.tgl_aktif} onChange={(e) => set("tgl_aktif", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Tanggal Nonaktif">
            <Input type="date" value={form.tgl_nonaktif} onChange={(e) => set("tgl_nonaktif", e.target.value)} />
          </FieldGroup>
        </Section>

        <Section title="Data Keluarga">
          <FieldGroup label="Nama Keluarga">
            <Input value={form.nama_keluarga} onChange={(e) => set("nama_keluarga", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Hubungan">
            <Input value={form.hubungan} onChange={(e) => set("hubungan", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Telepon Keluarga">
            <Input value={form.telepon_keluarga} onChange={(e) => set("telepon_keluarga", e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Alamat Keluarga" className="md:col-span-3">
            <Textarea rows={2} value={form.alamat_keluarga} onChange={(e) => set("alamat_keluarga", e.target.value)} />
          </FieldGroup>
        </Section>

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Batal
          </Button>
        </div>
      </form>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="font-semibold mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

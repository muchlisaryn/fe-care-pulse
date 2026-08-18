"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
import ImportAnggotaModal from "@/components/nafsul/ImportAnggotaModal";
import { Button } from "@/components/atoms/Button";
import { FieldGroup } from "@/components/molecules/FieldGroup";
import { Input } from "@/components/atoms/Input";
import { PageHeader } from "@/components/molecules/PageHeader";
import { Select } from "@/components/atoms/Select";
import MasterSelect from "@/components/nafsul/MasterSelect";
import { Textarea } from "@/components/atoms/Textarea";


type FormState = Record<string, string>;

// `no_anggota` sengaja tidak ada di form: nomor anggota dibuat otomatis
// oleh backend saat data disimpan.
const FIELDS = [
  "nama",
  "kode_wilayah", "noketua", "nokk", "tgl_lahir",
  "kode_kota_lahir", "jenis_kelamin", "pendidikan_id", "pekerjaan_id", "status_nikah",
  "noktp", "alamat", "telepon", "tgl_aktif", "tgl_nonaktif",
  "kode_status", "keterangan", "nama_keluarga", "hubungan", "alamat_keluarga",
  "telepon_keluarga",
];

function emptyForm(): FormState {
  const f: FormState = {};
  FIELDS.forEach((k) => (f[k] = ""));
  // Anggota baru: default aktif sejak hari pendaftaran agar terhitung di Laporan.
  f.tgl_aktif = new Date().toISOString().slice(0, 10);
  f.kode_status = "STS1";
  return f;
}

export default function PendaftaranAnggotaPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<Anggota | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function clearForm() {
    setForm(emptyForm());
    setErrors({});
    setFlash(null);
    setLastCreated(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Ketua Kelompok wajib, tapi dropdown-nya bukan <select> asli sehingga
    // atribut `required` browser tidak berlaku — jadi dicek di sini.
    if (!form.noketua) {
      setErrors({ noketua: ["Ketua Kelompok wajib dipilih."] });
      setFlash("Periksa kembali isian yang ditandai.");

      return;
    }

    setSubmitting(true);
    setErrors({});
    setFlash(null);
    setLastCreated(null);

    const payload: Record<string, unknown> = {};
    FIELDS.forEach((f) => {
      payload[f] = form[f] === "" ? null : form[f];
    });

    try {
      const created = await api<Anggota>("/anggota", { method: "POST", body: payload });

      clearForm();
      setFlash(`Anggota "${created.nama}" berhasil disimpan (No. ${created.no_anggota ?? "-"}).`);
      setLastCreated(created);
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(err.errors);
        setFlash("Periksa kembali isian yang ditandai.");
      } else {
        setFlash("Gagal menyimpan data.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const err = (f: string) =>
    errors[f] ? <span className="text-xs text-rose-600">{errors[f][0]}</span> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Link
          href="/nafsul/master/anggota"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-emerald-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Data Anggota
        </Link>
        <PageHeader
        className="mb-5"
          title="Pendaftaran Anggota"
          subtitle="Pendaftaran anggota baru — nomor anggota dibuat otomatis oleh sistem"
          action={
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              Import Excel
            </Button>
          }
        />
      </div>

      <ImportAnggotaModal open={importOpen} onClose={() => setImportOpen(false)} />

      {flash && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flash.includes("berhasil")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-rose-300 bg-rose-50 text-rose-700"
          }`}
        >
          {flash}
          {lastCreated && (
            <Link
              href={`/nafsul/master/anggota/${lastCreated.id}/edit`}
              className="ml-2 font-medium underline"
            >
              Ubah data anggota
            </Link>
          )}
        </div>
      )}

      {/*
        Grid 3 kolom: jumlah field tiap section dijaga kelipatan 3 (dengan bantuan
        col-span) supaya tidak ada sel menggantung / lubang di tengah baris.
        Identitas — baris 1: nama; 2: kelamin + KTP + KK; 3: nikah + pendidikan + pekerjaan.
      */}
      <Section title="Identitas">
        <FieldGroup label="Nama Lengkap" className="md:col-span-3" wajib>
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
          <Input
            value={form.noktp}
            onChange={(e) => set("noktp", e.target.value)}
          />
          {err("noktp")}
        </FieldGroup>
        <FieldGroup label="Nomor KK">
          <Input
            value={form.nokk}
            onChange={(e) => set("nokk", e.target.value)}
          />
          {err("nokk")}
        </FieldGroup>
        <FieldGroup label="Status Nikah">
          <Select value={form.status_nikah} onChange={(e) => set("status_nikah", e.target.value)}>
            <option value="">-</option>
            <option value="Belum Kawin">Belum Kawin</option>
            <option value="Kawin">Kawin</option>
            <option value="Cerai Hidup">Cerai Hidup</option>
            <option value="Cerai Mati">Cerai Mati</option>
          </Select>
        </FieldGroup>
        <FieldGroup label="Pendidikan">
          <MasterSelect<Pendidikan>
            endpoint="/pendidikan"
            value={form.pendidikan_id}
            onChange={(v) => set("pendidikan_id", v)}
            toOption={(p) => ({ value: String(p.id), label: p.nama })}
            placeholder="- Pilih Pendidikan -"
          />
        </FieldGroup>
        <FieldGroup label="Pekerjaan">
          <MasterSelect<Pekerjaan>
            endpoint="/pekerjaan"
            value={form.pekerjaan_id}
            onChange={(v) => set("pekerjaan_id", v)}
            toOption={(p) => ({ value: String(p.id), label: p.nama })}
            placeholder="- Pilih Pekerjaan -"
          />
        </FieldGroup>
      </Section>

      <Section title="Kelahiran & Domisili">
        <FieldGroup label="Kota Lahir">
          <MasterSelect<Kota>
            endpoint="/kota"
            value={form.kode_kota_lahir}
            onChange={(v) => set("kode_kota_lahir", v)}
            toOption={(k) => ({ value: k.kode, label: k.nama })}
            placeholder="- Pilih Kota -"
          />
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
        <FieldGroup label="Wilayah">
          <MasterSelect<Wilayah>
            endpoint="/wilayah"
            value={form.kode_wilayah}
            onChange={(v) => set("kode_wilayah", v)}
            toOption={(w) => ({ value: w.kode, label: w.nama })}
            placeholder="- Pilih Wilayah -"
          />
        </FieldGroup>
        <FieldGroup label="Ketua Kelompok" wajib>
          <MasterSelect<KetuaKelompok>
            endpoint="/ketua-kelompok"
            value={form.noketua}
            onChange={(v) => set("noketua", v)}
            toOption={(k) => ({ value: k.noketua, label: `${k.nama} (${k.noketua})` })}
            placeholder="- Pilih Ketua Kelompok -"
          />
          {err("noketua")}
        </FieldGroup>
        <FieldGroup label="Status Anggota">
          <MasterSelect<StatusAnggota>
            endpoint="/status-anggota"
            value={form.kode_status}
            onChange={(v) => set("kode_status", v)}
            toOption={(s) => ({ value: s.kode, label: s.nama })}
            placeholder="- Pilih Status -"
          />
        </FieldGroup>
        <FieldGroup label="Tanggal Aktif">
          <Input type="date" value={form.tgl_aktif} onChange={(e) => set("tgl_aktif", e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Tanggal Nonaktif">
          <Input type="date" value={form.tgl_nonaktif} onChange={(e) => set("tgl_nonaktif", e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Keterangan">
          <Input value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)} />
        </FieldGroup>
      </Section>

      <Section title="Penanggung Jawab Keluarga">
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
        <Button type="button" variant="outline" onClick={clearForm}>
          Bersihkan
        </Button>
      </div>
    </form>
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

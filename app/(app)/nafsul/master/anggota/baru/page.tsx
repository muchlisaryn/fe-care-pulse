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
import { useT } from "@/lib/i18n";


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

/**
 * Status bawaan anggota baru. Labelnya ikut ditulis di sini supaya dropdown
 * Status Anggota tidak perlu menembak API saat halaman dibuka hanya untuk
 * menerjemahkan satu kode jadi teks — lihat `labelTerpilih` di MasterSelect.
 * Begitu dropdown-nya dibuka, label asli dari server yang dipakai.
 */
const STATUS_BAWAAN = { kode: "STS1", labelKey: "nafsulAnggotaForm.statusDefault" };

function emptyForm(): FormState {
  const f: FormState = {};
  FIELDS.forEach((k) => (f[k] = ""));
  // Anggota baru: default aktif sejak hari pendaftaran agar terhitung di Laporan.
  f.tgl_aktif = new Date().toISOString().slice(0, 10);
  f.kode_status = STATUS_BAWAAN.kode;
  return f;
}

export default function PendaftaranAnggotaPage() {
  const t = useT();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  /**
   * Pesan pemberitahuan di atas formulir. `varian` disimpan terpisah — warnanya
   * TIDAK boleh ditebak dari isi kalimat, karena kalimatnya ikut berganti bahasa.
   */
  const [flash, setFlash] = useState<{ varian: "ok" | "gagal"; pesan: string } | null>(null);
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
      setErrors({ noketua: [t("nafsulAnggotaForm.leaderRequired")] });
      setFlash({ varian: "gagal", pesan: t("nafsulAnggotaForm.checkFields") });

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
      setFlash({
        varian: "ok",
        pesan: t("nafsulAnggotaForm.savedOk", {
          name: created.nama,
          no: created.no_anggota ?? "-",
        }),
      });
      setLastCreated(created);
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(err.errors);
        setFlash({ varian: "gagal", pesan: t("nafsulAnggotaForm.checkFields") });
      } else {
        setFlash({ varian: "gagal", pesan: t("nafsulAnggotaForm.saveFailed") });
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
          {t("nafsulCommon.memberData")}
        </Link>
        <PageHeader
        className="mb-5"
          title={t("nafsulAnggotaForm.registerTitle")}
          subtitle={t("nafsulAnggotaForm.registerSubtitle")}
          action={
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              {t("nafsulMaster.importExcel")}
            </Button>
          }
        />
      </div>

      <ImportAnggotaModal open={importOpen} onClose={() => setImportOpen(false)} />

      {flash && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flash.varian === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-rose-300 bg-rose-50 text-rose-700"
          }`}
        >
          {flash.pesan}
          {lastCreated && (
            <Link
              href={`/nafsul/master/anggota/${lastCreated.id}/edit`}
              className="ml-2 font-medium underline"
            >
              {t("nafsulAnggota.editTitle")}
            </Link>
          )}
        </div>
      )}

      {/*
        Grid 3 kolom: jumlah field tiap section dijaga kelipatan 3 (dengan bantuan
        col-span) supaya tidak ada sel menggantung / lubang di tengah baris.
        Identitas — baris 1: nama; 2: kelamin + KTP + KK; 3: nikah + pendidikan + pekerjaan.
      */}
      <Section title={t("nafsulAnggotaForm.secIdentity")}>
        <FieldGroup label={t("nafsulAnggotaForm.fullName")} className="md:col-span-3" wajib>
          <Input value={form.nama} onChange={(e) => set("nama", e.target.value)} required />
          {err("nama")}
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.gender")}>
          <Select value={form.jenis_kelamin} onChange={(e) => set("jenis_kelamin", e.target.value)}>
            <option value="">-</option>
            <option value="L">{t("nafsulCommon.male")}</option>
            <option value="P">{t("nafsulCommon.female")}</option>
          </Select>
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.idCardNo")}>
          <Input
            value={form.noktp}
            onChange={(e) => set("noktp", e.target.value)}
          />
          {err("noktp")}
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.familyCardNo")}>
          <Input
            value={form.nokk}
            onChange={(e) => set("nokk", e.target.value)}
          />
          {err("nokk")}
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.maritalStatus")}>
          <Select value={form.status_nikah} onChange={(e) => set("status_nikah", e.target.value)}>
            <option value="">-</option>
            <option value="Belum Kawin">{t("nafsulAnggotaForm.maritalSingle")}</option>
            <option value="Kawin">{t("nafsulAnggotaForm.maritalMarried")}</option>
            <option value="Cerai Hidup">{t("nafsulAnggotaForm.maritalDivorced")}</option>
            <option value="Cerai Mati">{t("nafsulAnggotaForm.maritalWidowed")}</option>
          </Select>
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.education")}>
          <MasterSelect<Pendidikan>
            endpoint="/pendidikan"
            value={form.pendidikan_id}
            onChange={(v) => set("pendidikan_id", v)}
            toOption={(p) => ({ value: String(p.id), label: p.nama })}
            placeholder={t("nafsulAnggotaForm.selectEducation")}
          />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.occupation")}>
          <MasterSelect<Pekerjaan>
            endpoint="/pekerjaan"
            value={form.pekerjaan_id}
            onChange={(v) => set("pekerjaan_id", v)}
            toOption={(p) => ({ value: String(p.id), label: p.nama })}
            placeholder={t("nafsulAnggotaForm.selectOccupation")}
          />
        </FieldGroup>
      </Section>

      <Section title={t("nafsulAnggotaForm.secBirth")}>
        <FieldGroup label={t("nafsulAnggotaForm.birthCity")}>
          <MasterSelect<Kota>
            endpoint="/kota"
            value={form.kode_kota_lahir}
            onChange={(v) => set("kode_kota_lahir", v)}
            toOption={(k) => ({ value: k.kode, label: k.nama })}
            placeholder={t("nafsulAnggotaForm.selectCity")}
          />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.birthDate")}>
          <Input type="date" value={form.tgl_lahir} onChange={(e) => set("tgl_lahir", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.phone")}>
          <Input value={form.telepon} onChange={(e) => set("telepon", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.address")} className="md:col-span-3">
          <Textarea rows={2} value={form.alamat} onChange={(e) => set("alamat", e.target.value)} />
        </FieldGroup>
      </Section>

      <Section title={t("nafsulAnggotaForm.secMembership")}>
        <FieldGroup label={t("nafsulAnggotaForm.region")}>
          <MasterSelect<Wilayah>
            endpoint="/wilayah"
            value={form.kode_wilayah}
            onChange={(v) => set("kode_wilayah", v)}
            toOption={(w) => ({ value: w.kode, label: w.nama })}
            placeholder={t("nafsulAnggotaForm.selectRegion")}
          />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.groupLeader")} wajib>
          <MasterSelect<KetuaKelompok>
            endpoint="/ketua-kelompok"
            value={form.noketua}
            onChange={(v) => set("noketua", v)}
            toOption={(k) => ({ value: k.noketua, label: `${k.nama} (${k.noketua})` })}
            placeholder={t("nafsulAnggotaForm.selectLeader")}
          />
          {err("noketua")}
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.memberStatus")}>
          <MasterSelect<StatusAnggota>
            endpoint="/status-anggota"
            value={form.kode_status}
            onChange={(v) => set("kode_status", v)}
            toOption={(s) => ({ value: s.kode, label: s.nama })}
            placeholder={t("nafsulAnggotaForm.selectStatus")}
            labelTerpilih={t(STATUS_BAWAAN.labelKey)}
          />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.activeDate")}>
          <Input type="date" value={form.tgl_aktif} onChange={(e) => set("tgl_aktif", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.inactiveDate")}>
          <Input type="date" value={form.tgl_nonaktif} onChange={(e) => set("tgl_nonaktif", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.note")}>
          <Input value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)} />
        </FieldGroup>
      </Section>

      <Section title={t("nafsulAnggotaForm.secFamilyContact")}>
        <FieldGroup label={t("nafsulAnggotaForm.familyName")}>
          <Input value={form.nama_keluarga} onChange={(e) => set("nama_keluarga", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.relationship")}>
          <Input value={form.hubungan} onChange={(e) => set("hubungan", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.familyPhone")}>
          <Input value={form.telepon_keluarga} onChange={(e) => set("telepon_keluarga", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("nafsulAnggotaForm.familyAddress")} className="md:col-span-3">
          <Textarea rows={2} value={form.alamat_keluarga} onChange={(e) => set("alamat_keluarga", e.target.value)} />
        </FieldGroup>
      </Section>

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={submitting}
          className="bg-[#075489] hover:bg-[#075489]/90 text-white"
        >
          {submitting ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={clearForm}>
          {t("nafsulAnggotaForm.clear")}
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

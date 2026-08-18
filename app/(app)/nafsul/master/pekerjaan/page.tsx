"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";

export default function PekerjaanPage() {
  return (
    <MasterCrud
      endpoint="pekerjaan"
      title="Master Pekerjaan"
      subtitle="Daftar pilihan pekerjaan pada form anggota"
      pkField="id"
      fields={[{ name: "nama", label: "Nama Pekerjaan", required: true }]}
      columns={[{ name: "nama", label: "Nama Pekerjaan" }]}
      nomor
    />
  );
}

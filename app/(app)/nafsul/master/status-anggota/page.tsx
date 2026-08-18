"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";

export default function StatusAnggotaPage() {
  return (
    <MasterCrud
      endpoint="status-anggota"
      title="Status Anggota"
      subtitle="Master data status keanggotaan"
      pkField="kode"
      fields={[
        { name: "kode", label: "Kode", required: true, pk: true },
        { name: "nama", label: "Nama Status", required: true },
      ]}
      columns={[
        { name: "kode", label: "Kode" },
        { name: "nama", label: "Nama Status" },
      ]}
    />
  );
}

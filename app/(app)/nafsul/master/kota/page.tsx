"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";

export default function KotaPage() {
  return (
    <MasterCrud
      endpoint="kota"
      title="Kota"
      subtitle="Master data kota lahir"
      pkField="kode"
      fields={[
        { name: "kode", label: "Kode", required: true, pk: true },
        { name: "nama", label: "Nama Kota", required: true },
      ]}
      columns={[
        { name: "kode", label: "Kode" },
        { name: "nama", label: "Nama Kota" },
      ]}
    />
  );
}

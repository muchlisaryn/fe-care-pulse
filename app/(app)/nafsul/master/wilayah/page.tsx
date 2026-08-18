"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";

export default function WilayahPage() {
  return (
    <MasterCrud
      endpoint="wilayah"
      title="Wilayah"
      subtitle="Master data wilayah"
      pkField="kode"
      fields={[
        { name: "kode", label: "Kode", required: true, pk: true },
        { name: "nama", label: "Nama Wilayah", required: true },
      ]}
      columns={[
        { name: "kode", label: "Kode" },
        { name: "nama", label: "Nama Wilayah" },
      ]}
    />
  );
}

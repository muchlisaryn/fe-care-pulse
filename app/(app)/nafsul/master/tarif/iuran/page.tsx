"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { formatCurrency } from "@/lib/nafsul/format";

export default function TarifIuranPage() {
  return (
    <MasterCrud
      endpoint="tarif"
      title="Tarif Iuran Anggota"
      subtitle="Master data tarif iuran anggota"
      pkField="kode"
      filter={{ kategori: "iuran" }}
      defaults={{ kategori: "iuran" }}
      fields={[
        { name: "kode", label: "Kode Tarif", required: true, pk: true },
        { name: "nama", label: "Nama Tarif", required: true },
        { name: "harga", label: "Harga", type: "number", required: true },
      ]}
      columns={[
        { name: "kode", label: "Kode Tarif" },
        { name: "nama", label: "Nama Tarif" },
        {
          name: "harga",
          label: "Harga",
          render: (row) => formatCurrency(row.harga as string),
        },
      ]}
    />
  );
}

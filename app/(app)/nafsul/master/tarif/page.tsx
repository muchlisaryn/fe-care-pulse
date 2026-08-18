"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { formatCurrency } from "@/lib/nafsul/format";

export default function TarifPage() {
  return (
    <MasterCrud
      endpoint="tarif"
      title="Tarif"
      subtitle="Master data biaya & iuran"
      pkField="kode"
      fields={[
        { name: "kode", label: "Kode", required: true, pk: true },
        { name: "nama", label: "Nama Tarif", required: true },
        { name: "harga", label: "Harga", type: "number", required: true },
      ]}
      columns={[
        { name: "kode", label: "Kode" },
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

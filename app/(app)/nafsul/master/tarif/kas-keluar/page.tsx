"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { formatCurrency } from "@/lib/nafsul/format";

export default function TarifKasKeluarPage() {
  return (
    <MasterCrud
      endpoint="tarif"
      title="Tarif Kas Keluar"
      subtitle="Master data tarif kas keluar"
      pkField="kode"
      filter={{ kategori: "kas_keluar" }}
      defaults={{ kategori: "kas_keluar" }}
      fields={[
        { name: "kode", label: "Kode Kas", required: true, pk: true },
        { name: "keterangan", label: "Keterangan" },
        { name: "kode_tarif", label: "Kode Tarif" },
        { name: "nama", label: "Nama Tarif", required: true },
        { name: "harga", label: "Harga", type: "number", required: true },
      ]}
      columns={[
        { name: "kode", label: "Kode Kas" },
        { name: "kode_tarif", label: "Kode Tarif" },
        { name: "nama", label: "Nama Tarif" },
        {
          name: "harga",
          label: "Harga",
          render: (row) => formatCurrency(row.harga as string),
        },
        { name: "keterangan", label: "Keterangan" },
      ]}
    />
  );
}

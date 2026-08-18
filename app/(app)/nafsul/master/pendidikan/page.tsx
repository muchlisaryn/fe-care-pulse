"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";

export default function PendidikanPage() {
  return (
    <MasterCrud
      endpoint="pendidikan"
      title="Master Pendidikan"
      subtitle="Daftar pilihan pendidikan pada form anggota"
      pkField="id"
      fields={[{ name: "nama", label: "Nama Pendidikan", required: true }]}
      columns={[{ name: "nama", label: "Nama Pendidikan" }]}
      nomor
    />
  );
}

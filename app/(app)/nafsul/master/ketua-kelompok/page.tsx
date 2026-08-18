"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import ImportKetuaKelompokModal from "@/components/nafsul/ImportKetuaKelompokModal";

export default function KetuaKelompokPage() {
  return (
    <MasterCrud
      endpoint="ketua-kelompok"
      renderImport={(p) => <ImportKetuaKelompokModal {...p} />}
      title="Ketua Kelompok"
      subtitle="Master data ketua kelompok"
      pkField="noketua"
      fields={[
        { name: "nama", label: "Nama", required: true },
        {
          name: "jenis_kelamin",
          label: "Jenis Kelamin",
          type: "select",
          options: [
            { value: "L", label: "Laki-laki" },
            { value: "P", label: "Perempuan" },
          ],
        },
        { name: "telepon", label: "Telepon" },
        { name: "alamat", label: "Alamat" },
      ]}
      columns={[
        { name: "noketua", label: "No. Ketua" },
        { name: "nama", label: "Nama" },
        {
          name: "jenis_kelamin",
          label: "Jenis Kelamin",
          render: (row) =>
            row.jenis_kelamin === "L"
              ? "Laki-laki"
              : row.jenis_kelamin === "P"
                ? "Perempuan"
                : "-",
        },
        { name: "telepon", label: "Telepon" },
      ]}
    />
  );
}

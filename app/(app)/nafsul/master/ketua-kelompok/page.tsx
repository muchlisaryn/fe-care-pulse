"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { useT } from "@/lib/i18n";
import ImportKetuaKelompokModal from "@/components/nafsul/ImportKetuaKelompokModal";

export default function KetuaKelompokPage() {
  const t = useT();

  return (
    <MasterCrud
      endpoint="ketua-kelompok"
      renderImport={(p) => <ImportKetuaKelompokModal {...p} />}
      title={t("nafsulMaster.leaderTitle")}
      subtitle={t("nafsulMaster.leaderSubtitle")}
      pkField="noketua"
      fields={[
        { name: "nama", label: t("nafsulMaster.name"), required: true },
        {
          name: "jenis_kelamin",
          label: t("nafsulMaster.gender"),
          type: "select",
          options: [
            { value: "L", label: t("nafsulCommon.male") },
            { value: "P", label: t("nafsulCommon.female") },
          ],
        },
        { name: "telepon", label: t("nafsulMaster.phone") },
        { name: "alamat", label: t("nafsulMaster.address") },
      ]}
      columns={[
        { name: "noketua", label: t("nafsulMaster.leaderNo") },
        { name: "nama", label: t("nafsulMaster.name") },
        {
          name: "jenis_kelamin",
          label: t("nafsulMaster.gender"),
          render: (row) =>
            row.jenis_kelamin === "L"
              ? t("nafsulCommon.male")
              : row.jenis_kelamin === "P"
                ? t("nafsulCommon.female")
                : "-",
        },
        { name: "telepon", label: t("nafsulMaster.phone") },
      ]}
    />
  );
}

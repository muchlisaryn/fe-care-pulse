"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { useT } from "@/lib/i18n";

export default function StatusAnggotaPage() {
  const t = useT();

  return (
    <MasterCrud
      endpoint="status-anggota"
      title={t("nafsulMaster.statusTitle")}
      subtitle={t("nafsulMaster.statusSubtitle")}
      pkField="kode"
      fields={[
        { name: "kode", label: t("nafsulMaster.code"), required: true, pk: true },
        { name: "nama", label: t("nafsulMaster.statusName"), required: true },
      ]}
      columns={[
        { name: "kode", label: t("nafsulMaster.code") },
        { name: "nama", label: t("nafsulMaster.statusName") },
      ]}
    />
  );
}

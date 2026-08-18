"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { useT } from "@/lib/i18n";

export default function KotaPage() {
  const t = useT();

  return (
    <MasterCrud
      endpoint="kota"
      title={t("nafsulMaster.cityTitle")}
      subtitle={t("nafsulMaster.citySubtitle")}
      pkField="kode"
      fields={[
        { name: "kode", label: t("nafsulMaster.code"), required: true, pk: true },
        { name: "nama", label: t("nafsulMaster.cityName"), required: true },
      ]}
      columns={[
        { name: "kode", label: t("nafsulMaster.code") },
        { name: "nama", label: t("nafsulMaster.cityName") },
      ]}
    />
  );
}

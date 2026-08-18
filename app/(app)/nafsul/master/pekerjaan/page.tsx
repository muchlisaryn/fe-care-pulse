"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { useT } from "@/lib/i18n";

export default function PekerjaanPage() {
  const t = useT();

  return (
    <MasterCrud
      endpoint="pekerjaan"
      title={t("nafsulMaster.occupationTitle")}
      subtitle={t("nafsulMaster.occupationSubtitle")}
      pkField="id"
      fields={[{ name: "nama", label: t("nafsulMaster.occupationName"), required: true }]}
      columns={[{ name: "nama", label: t("nafsulMaster.occupationName") }]}
      nomor
    />
  );
}

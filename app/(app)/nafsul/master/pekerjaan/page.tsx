"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import ImportPekerjaanModal from "@/components/nafsul/ImportPekerjaanModal";
import { useT } from "@/lib/i18n";

export default function PekerjaanPage() {
  const t = useT();

  return (
    <MasterCrud
      endpoint="pekerjaan"
      renderImport={(p) => <ImportPekerjaanModal {...p} />}
      title={t("nafsulMaster.occupationTitle")}
      subtitle={t("nafsulMaster.occupationSubtitle")}
      pkField="id"
      fields={[{ name: "nama", label: t("nafsulMaster.occupationName"), required: true }]}
      columns={[{ name: "nama", label: t("nafsulMaster.occupationName") }]}
      nomor
    />
  );
}

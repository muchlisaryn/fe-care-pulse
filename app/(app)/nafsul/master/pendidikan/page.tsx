"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import ImportPendidikanModal from "@/components/nafsul/ImportPendidikanModal";
import { useT } from "@/lib/i18n";

export default function PendidikanPage() {
  const t = useT();

  return (
    <MasterCrud
      endpoint="pendidikan"
      renderImport={(p) => <ImportPendidikanModal {...p} />}
      title={t("nafsulMaster.educationTitle")}
      subtitle={t("nafsulMaster.educationSubtitle")}
      pkField="id"
      fields={[{ name: "nama", label: t("nafsulMaster.educationName"), required: true }]}
      columns={[{ name: "nama", label: t("nafsulMaster.educationName") }]}
      nomor
    />
  );
}

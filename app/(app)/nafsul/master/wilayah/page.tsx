"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import ImportWilayahModal from "@/components/nafsul/ImportWilayahModal";
import { useT } from "@/lib/i18n";

export default function WilayahPage() {
  const t = useT();

  return (
    <MasterCrud
      endpoint="wilayah"
      renderImport={(p) => <ImportWilayahModal {...p} />}
      title={t("nafsulMaster.regionTitle")}
      subtitle={t("nafsulMaster.regionSubtitle")}
      pkField="kode"
      fields={[
        { name: "kode", label: t("nafsulMaster.code"), required: true, pk: true },
        { name: "nama", label: t("nafsulMaster.regionName"), required: true },
      ]}
      columns={[
        { name: "kode", label: t("nafsulMaster.code") },
        { name: "nama", label: t("nafsulMaster.regionName") },
      ]}
    />
  );
}

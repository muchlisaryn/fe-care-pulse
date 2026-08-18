"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { localeOf, useLanguage } from "@/lib/i18n";
import { formatCurrency } from "@/lib/nafsul/format";

export default function TarifPage() {
  const { t, lang } = useLanguage();

  return (
    <MasterCrud
      endpoint="tarif"
      title={t("nafsulMaster.rateTitle")}
      subtitle={t("nafsulMaster.rateSubtitle")}
      pkField="kode"
      fields={[
        { name: "kode", label: t("nafsulMaster.code"), required: true, pk: true },
        { name: "nama", label: t("nafsulMaster.rateName"), required: true },
        { name: "harga", label: t("nafsulMaster.price"), type: "number", required: true },
      ]}
      columns={[
        { name: "kode", label: t("nafsulMaster.code") },
        { name: "nama", label: t("nafsulMaster.rateName") },
        {
          name: "harga",
          label: t("nafsulMaster.price"),
          render: (row) => formatCurrency(row.harga as string, localeOf(lang)),
        },
      ]}
    />
  );
}

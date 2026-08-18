"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { localeOf, useLanguage } from "@/lib/i18n";
import { formatCurrency } from "@/lib/nafsul/format";

export default function TarifIuranPage() {
  const { t, lang } = useLanguage();

  return (
    <MasterCrud
      endpoint="tarif"
      title={t("nafsulMaster.duesTitle")}
      subtitle={t("nafsulMaster.duesSubtitle")}
      pkField="kode"
      filter={{ kategori: "iuran" }}
      defaults={{ kategori: "iuran" }}
      fields={[
        { name: "kode", label: t("nafsulMaster.rateCode"), required: true, pk: true },
        { name: "nama", label: t("nafsulMaster.rateName"), required: true },
        { name: "harga", label: t("nafsulMaster.price"), type: "number", required: true },
      ]}
      columns={[
        { name: "kode", label: t("nafsulMaster.rateCode") },
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

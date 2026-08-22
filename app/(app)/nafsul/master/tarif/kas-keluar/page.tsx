"use client";

import MasterCrud from "@/components/nafsul/MasterCrud";
import { localeOf, useLanguage } from "@/lib/i18n";
import { formatCurrency } from "@/lib/nafsul/format";
import { feeTypeOptions, renderFeeType } from "@/lib/nafsul/feeType";

export default function TarifKasKeluarPage() {
  const { t, lang } = useLanguage();

  return (
    <MasterCrud
      endpoint="tarif"
      title={t("nafsulMaster.cashOutTitle")}
      subtitle={t("nafsulMaster.cashOutSubtitle")}
      pkField="kode"
      filter={{ kategori: "kas_keluar" }}
      defaults={{ kategori: "kas_keluar" }}
      fields={[
        { name: "kode", label: t("nafsulMaster.cashCode"), required: true, pk: true },
        { name: "keterangan", label: t("nafsulMaster.note") },
        { name: "kode_tarif", label: t("nafsulMaster.rateCode") },
        { name: "nama", label: t("nafsulMaster.rateName"), required: true },
        {
          name: "fee_type",
          label: t("nafsulMaster.feeType"),
          type: "select",
          options: feeTypeOptions(t),
        },
        { name: "harga", label: t("nafsulMaster.price"), type: "number", required: true },
      ]}
      columns={[
        { name: "kode", label: t("nafsulMaster.cashCode") },
        { name: "kode_tarif", label: t("nafsulMaster.rateCode") },
        { name: "nama", label: t("nafsulMaster.rateName") },
        {
          name: "fee_type",
          label: t("nafsulMaster.feeType"),
          render: (row) => renderFeeType(row.fee_type, t),
        },
        {
          name: "harga",
          label: t("nafsulMaster.price"),
          render: (row) => formatCurrency(row.harga as string, localeOf(lang)),
        },
        { name: "keterangan", label: t("nafsulMaster.note") },
      ]}
    />
  );
}

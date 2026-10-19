// About a sheet in labelled values: that new leads come in as New, who owns them when no Owner column is matched (the
// agency Owner), and how many columns are matched.
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";

export function SheetDetails({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet.details");
  return (
    <section className="flex flex-col gap-2" aria-labelledby="sheet-details">
      <h2 id="sheet-details" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <Details
        rows={[
          { label: t("stage"), value: undefined },
          {
            label: t("owner"),
            value:
              detail.defaultOwnerName === null
                ? t("ownerValueUnknown")
                : t("ownerValue", { name: detail.defaultOwnerName }),
          },
          {
            label: t("columns"),
            value: t("columnsValue", { matched: detail.columns.matched, total: detail.columns.total }),
          },
        ]}
      />
    </section>
  );
}

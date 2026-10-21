// How many of the sheet's columns are matched, with the way to match them again, and the quiet line about a column the
// sheet gained that nobody has matched (S15), which links to the same screen. While the alert above asks for the columns
// to be matched again, this section does not offer it a second time.
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { sheetMatchRoute } from "@/lib/routes";

export function SheetColumnsCard({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet.columnsCard");
  const { matched, total, newUnmatched } = detail.columns;
  const [only] = newUnmatched;
  const offered = detail.status !== "columns_missing";
  return (
    <section className="flex flex-col gap-1" aria-labelledby="sheet-columns">
      <h2 id="sheet-columns" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <p>{t("summary", { matched, total })}</p>
      {newUnmatched.length > 0 && (
        <p className="text-label text-muted-foreground">
          {newUnmatched.length === 1 && only !== undefined
            ? t("newColumn", { name: only })
            : t("newColumns", { count: newUnmatched.length })}{" "}
          {offered && (
            <TextLink href={sheetMatchRoute(detail.id)} inline>
              {t("matchAgain")}
            </TextLink>
          )}
        </p>
      )}
      {newUnmatched.length === 0 && offered && <TextLink href={sheetMatchRoute(detail.id)}>{t("matchAgain")}</TextLink>}
    </section>
  );
}

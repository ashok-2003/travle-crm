// What a sheet has done since it was connected (spec 6.5): the four counts the owner asked for, in mono, and the notes
// under them: old rows aren't counted, an edited row is a repeat enquiry, and a sheet past 20,000 rows is read in part.
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "@/lib/format";

const kinds = ["added", "mergedIntoExisting", "duplicates", "couldntBeAdded"] as const;

export function SheetCounts({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet.counts");
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sheet-counts">
      <h2 id="sheet-counts" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kinds.map((kind) => (
          <li key={kind}>
            <Card size="sm">
              <CardContent className="flex flex-col gap-1">
                <span className="numbers text-2xl font-semibold">{formatCount(detail.counts[kind])}</span>
                <span className="text-label text-muted-foreground">{t(kind)}</span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-label text-muted-foreground">{t("notes")}</p>
      {detail.rowsTruncated && <p className="text-label text-muted-foreground">{t("truncated")}</p>}
    </section>
  );
}

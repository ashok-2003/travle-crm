// What a Page has done since it was connected (spec 3.3): the four counts in mono, as labelled values, and the note under
// them. Leads from forms not brought in are not counted: they are not saved.
import type { MetaPageDetail } from "@travel-crm/contracts/meta-leads";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { formatCount } from "@/lib/format";

const kinds = ["added", "mergedIntoExisting", "duplicates", "couldntBeAdded"] as const;

export function PageCounts({ detail }: { detail: MetaPageDetail }) {
  const t = useTranslations("metaLeads.page.counts");
  return (
    <section className="flex flex-col gap-2" aria-labelledby="meta-counts">
      <h2 id="meta-counts" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <Details
        rows={kinds.map((kind) => ({
          label: t(kind),
          value: <span className="numbers">{formatCount(detail.counts[kind])}</span>,
        }))}
      />
      <p className="text-label text-muted-foreground">{t("notes")}</p>
    </section>
  );
}

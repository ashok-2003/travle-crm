// The dashboard's key figures (DESIGN.md "KPI / stat"): each a label, a mono value and an info hint saying how it is
// counted. Shares are of the period's new leads; "now" figures are today's, whatever the period.
import type { Dashboard } from "@travel-crm/contracts/insights";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/info-hint";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { waitWords } from "./duration";

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

export function KpiStrip({ totals }: { totals: Dashboard["totals"] }) {
  const t = useTranslations("dashboard.kpis");
  const tDuration = useTranslations("dashboard.duration");
  const figures = [
    { key: "newLeads", value: formatCount(totals.newLeads), hint: t("newLeads.hint") },
    {
      key: "contacted",
      value: t("contacted.value", { percent: percentOf(totals.contacted, totals.newLeads) }),
      hint: t("contacted.hint", { count: totals.contacted }),
    },
    {
      key: "firstReply",
      value:
        totals.medianFirstReplyMinutes === null
          ? t("firstReply.none")
          : waitWords(totals.medianFirstReplyMinutes, tDuration),
      hint: t("firstReply.hint"),
    },
    { key: "quotesSent", value: formatCount(totals.quotesSent), hint: t("quotesSent.hint") },
    { key: "won", value: formatCount(totals.won), hint: t("won.hint") },
    {
      key: "conversion",
      value: t("conversion.value", { percent: percentOf(totals.newLeadsWon, totals.newLeads) }),
      hint: t("conversion.hint"),
    },
    { key: "open", value: formatCount(totals.open), hint: t("open.hint") },
    { key: "overdue", value: formatCount(totals.overdue), hint: t("overdue.hint") },
  ] as const;
  return (
    <Card>
      <CardContent>
        <dl aria-label={t("label")} className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          {figures.map(({ key, value, hint }) => (
            <div key={key} className="flex flex-col gap-1">
              <dt className="flex items-center gap-1 text-label text-muted-foreground">
                {t(`${key}.label`)}
                <InfoHint term={t(`${key}.label`)}>{hint}</InfoHint>
              </dt>
              <dd className="font-mono text-number-lg font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

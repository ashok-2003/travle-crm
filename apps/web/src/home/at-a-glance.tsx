"use client";

// Home's key figures, as one strip like the dashboard's (DESIGN.md): only what Today doesn't show already: chats waiting for
// a reply, hot leads to call, and the money still to come from customers (for whoever holds the money permission). One row,
// phone and desktop alike; no icon per figure, an info hint on each, and no red for a normal count.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent } from "@/components/ui/card";
import { FigureCell, type Figure } from "@/dashboard/kpi-strip";
import { useTRPC } from "@/data/trpc";
import { useInboxSummary } from "@/inbox/use-sales-inbox";
import { formatCount } from "@/lib/format";
import { useHotLeads } from "@/sales/use-sales";
import { useTodaySummary } from "@/today/use-today";

/** Money to come: what accepted quotes still have to be paid. Asked only for whoever may see money. */
function useMoneyToCome(enabled: boolean) {
  const trpc = useTRPC();
  // Today in the agency's zone, from Today's own summary.
  const today = useTodaySummary().data?.day;
  const range = { from: `${(today ?? "2026-01-01").slice(0, 8)}01`, to: today ?? "2026-01-01" };
  return useQuery({
    ...trpc.quotes.moneySummary.queryOptions(range),
    enabled: enabled && today !== undefined,
  }).data?.outstandingPaise;
}

export function AtAGlance({ inbox, money }: { inbox: boolean; money: boolean }) {
  const t = useTranslations("home.glance");
  const waiting = useInboxSummary().data?.waiting;
  const hot = useHotLeads().data?.length;
  const toCome = useMoneyToCome(money);
  const figures: (Figure & { label: string })[] = [
    ...(inbox
      ? [{ key: "waiting", label: t("waiting"), value: formatCount(waiting ?? 0), hint: t("waitingHint") }]
      : []),
    { key: "hot", label: t("hot"), value: formatCount(hot ?? 0), hint: t("hotHint") },
    ...(money
      ? [{ key: "money", label: t("money"), value: toCome === undefined ? "–" : rupees(toCome), hint: t("moneyHint") }]
      : []),
  ];
  return (
    <Card aria-label={t("title")} role="region">
      <CardContent className={figures.length === 3 ? "grid grid-cols-3" : "grid grid-cols-2"}>
        {figures.map((figure, index) => (
          <FigureCell key={figure.key} figure={figure} label={figure.label} index={index} count={figures.length} />
        ))}
      </CardContent>
    </Card>
  );
}

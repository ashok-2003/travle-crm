"use client";

// The dashboard's money (step 3, P0, reports): over the dashboard's period, the quotes accepted and their worth and the
// payments received; and now, what accepted quotes still have to be paid and what of it is overdue, which opens the
// quotes with money to come. Shown only to whoever sees quotes, on a plan with them.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { TextLink } from "@/components/text-link";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";

function MoneyFigures({ from, to }: { from: string; to: string }) {
  const t = useTranslations("quotes.dashboard");
  const trpc = useTRPC();
  const summary = useQuery(trpc.quotes.moneySummary.queryOptions({ from, to }, { placeholderData: (shown) => shown }));
  if (summary.data === undefined) {
    return summary.isError ? (
      <LoadFailedAlert message={t("loadFailed")} error={summary.error} onRetry={() => void summary.refetch()} />
    ) : null;
  }
  const data = summary.data;
  const figures = [
    { key: "accepted", value: rupees(data.acceptedPaise), note: t("acceptedCount", { count: data.acceptedCount }) },
    { key: "received", value: rupees(data.receivedPaise), note: t("receivedNote") },
    { key: "outstanding", value: rupees(data.outstandingPaise), note: t("outstandingNote") },
    { key: "overdue", value: rupees(data.overduePaise), note: t("overdueCount", { count: data.overdueCount }) },
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {figures.map((figure) => (
        <div key={figure.key} className="flex flex-col gap-0.5">
          <dt className="text-label text-muted-foreground">{t(figure.key)}</dt>
          <dd className="numbers text-section font-semibold">{figure.value}</dd>
          <dd className="text-caption text-muted-foreground">{figure.note}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MoneyCard({ from, to }: { from: string; to: string }) {
  const t = useTranslations("quotes.dashboard");
  const modules = useSubscription().data?.modules;
  const shown = useHolds("quotes:view") && isOnPlan({ module: "quotes" }, modules);
  if (!shown) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MoneyFigures from={from} to={to} />
        <TextLink href={routes.quotes}>{t("openQuotes")}</TextLink>
      </CardContent>
    </Card>
  );
}

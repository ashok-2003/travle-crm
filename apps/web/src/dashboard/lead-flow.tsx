"use client";

// The lead flow on Reports (it was Home's dashboard): new leads by day, where the period's leads stand now, and how long
// they waited for a first reply, for the period Reports has picked. A failure keeps the rest of Reports working, with Try
// again. Sources, destinations and the team are Reports' own tables.
import type { DashboardRange } from "@travel-crm/contracts/insights";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/data/trpc";
import { ResponseTimesCard, StagesCard } from "./breakdowns";
import { LeadsPerDayChart } from "./leads-per-day-chart";

export function LeadFlow({ range }: { range: DashboardRange }) {
  const t = useTranslations("dashboard");
  const trpc = useTRPC();
  const dashboard = useQuery(trpc.insights.dashboard.queryOptions({ range }, { placeholderData: (shown) => shown }));
  const data = dashboard.data;
  if (data === undefined) {
    return dashboard.isError ? (
      <LoadFailedAlert message={t("loadFailed")} error={dashboard.error} onRetry={() => void dashboard.refetch()} />
    ) : (
      <LoadingRows rows={3} shape="twoLines" />
    );
  }
  if (data.totals.newLeads === 0) return <p className="text-muted-foreground">{t("empty")}</p>;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("perDay.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsPerDayChart perDay={data.perDay} />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <StagesCard byStage={data.byStage} />
        <ResponseTimesCard responseTimes={data.responseTimes} />
      </div>
    </div>
  );
}

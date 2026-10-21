"use client";

// The dashboard on home (release B): how the period's leads did, the person's own or, for a role that sees everyone's
// leads, the agency's with its team. The period (7, 30 or 90 days, or this month) is picked above everything, in the
// agency's zone; a failure keeps the rest of home working, with Try again.
import { dashboardRanges, type DashboardRange } from "@travel-crm/contracts/insights";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTRPC } from "@/data/trpc";
import { formatCalendarDay } from "@/lib/format";
import { DestinationsCard, ResponseTimesCard, SourcesCard, StagesCard } from "./breakdowns";
import { KpiStrip } from "./kpi-strip";
import { LeadsPerDayChart } from "./leads-per-day-chart";
import { TeamTable } from "./team-table";

const isRange = (value: string): value is DashboardRange => dashboardRanges.some((range) => range === value);

export function Dashboard() {
  const t = useTranslations("dashboard");
  const trpc = useTRPC();
  const [range, setRange] = useState<DashboardRange>("30d");
  const dashboard = useQuery(trpc.insights.dashboard.queryOptions({ range }, { placeholderData: (shown) => shown }));
  const data = dashboard.data;
  return (
    <section aria-labelledby="dashboard-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="dashboard-heading" className="text-section font-semibold">
            {data?.scope === "own" ? t("titleOwn") : t("title")}
          </h2>
          {data && (
            <p className="text-label text-muted-foreground">
              {t("period", { from: formatCalendarDay(data.from), to: formatCalendarDay(data.to) })}
            </p>
          )}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={t("range.label")}
          value={range}
          onValueChange={(chosen) => {
            if (isRange(chosen)) setRange(chosen);
          }}
          className="flex-wrap"
        >
          {dashboardRanges.map((choice) => (
            <ToggleGroupItem key={choice} value={choice}>
              {choice === range && <CheckIcon aria-hidden="true" />}
              {t(`range.${choice}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {data === undefined ? (
        dashboard.isError ? (
          <LoadFailedAlert message={t("loadFailed")} error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        ) : (
          <LoadingRows rows={6} shape="twoLines" />
        )
      ) : (
        <>
          <KpiStrip totals={data.totals} />
          {data.totals.newLeads === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t("perDay.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <LeadsPerDayChart perDay={data.perDay} />
                </CardContent>
              </Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <SourcesCard bySource={data.bySource} />
                <StagesCard byStage={data.byStage} />
                <ResponseTimesCard responseTimes={data.responseTimes} />
                <DestinationsCard topDestinations={data.topDestinations} />
              </div>
              {data.team.length > 0 && <TeamTable team={data.team} />}
            </>
          )}
        </>
      )}
    </section>
  );
}

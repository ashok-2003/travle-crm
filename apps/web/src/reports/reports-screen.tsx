"use client";

// /reports (sales execution): the agency's reports and analytics (or the member's own, for a role that sees only theirs).
// The period above everything; then Overview (the key figures against the period before, the funnel, six months), Sources
// (sources, destinations, lost reasons), Team (each person's performance, for a role that sees every lead) and Timing
// (when leads arrive).
import { dashboardRanges, type DashboardRange } from "@travel-crm/contracts/insights";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LeadFlow } from "@/dashboard/lead-flow";
import { formatCalendarDay } from "@/lib/format";
import { MoneyCard } from "@/quotes/money-card";
import { DestinationsTable, LostReasonsCard, SourcesTable } from "./breakdown-tables";
import { Funnel, KeyFigures } from "./overview-cards";
import { TeamReportTable } from "./team-report-table";
import { MonthsCard, TimingCard } from "./trend-charts";
import { useSalesReport } from "./use-reports";

const isRange = (value: string): value is DashboardRange => dashboardRanges.some((range) => range === value);

export function ReportsScreen() {
  const t = useTranslations("reports");
  const tRange = useTranslations("dashboard.range");
  const [range, setRange] = useState<DashboardRange>("30d");
  const report = useSalesReport(range);
  const data = report.data;
  return (
    <div className="flex max-w-[1400px] flex-col gap-6">
      <PageHeader title={t("title")} intro={data?.scope === "own" ? t("introOwn") : t("intro")} />
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={tRange("label")}
          value={range}
          onValueChange={(chosen) => {
            if (isRange(chosen)) setRange(chosen);
          }}
          className="flex-wrap"
        >
          {dashboardRanges.map((choice) => (
            <ToggleGroupItem key={choice} value={choice} className="min-h-11 px-4">
              {choice === range && <CheckIcon aria-hidden="true" />}
              {tRange(choice)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {data && (
          <p className="text-label text-muted-foreground">
            {t("period", { from: formatCalendarDay(data.from), to: formatCalendarDay(data.to) })}
          </p>
        )}
      </div>
      {data === undefined ? (
        report.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={report.error}
            retryLabel={t("retry")}
            onRetry={() => void report.refetch()}
          />
        ) : (
          <LoadingRows rows={6} shape="twoLines" label={t("loading")} />
        )
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="sources">{t("tabs.sources")}</TabsTrigger>
            {data.scope === "all" && <TabsTrigger value="team">{t("tabs.team")}</TabsTrigger>}
            <TabsTrigger value="timing">{t("tabs.timing")}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="flex flex-col gap-6 pt-4">
            <KeyFigures report={data} />
            {data.showsMoney && <MoneyCard from={data.from} to={data.to} />}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Funnel report={data} />
              <MonthsCard report={data} />
            </div>
            <LeadFlow range={range} />
          </TabsContent>
          <TabsContent value="sources" className="flex flex-col gap-6 pt-4">
            <SourcesTable report={data} />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <DestinationsTable report={data} />
              <LostReasonsCard report={data} />
            </div>
          </TabsContent>
          {data.scope === "all" && (
            <TabsContent value="team" className="pt-4">
              <TeamReportTable team={data.team} showsMoney={data.showsMoney} />
            </TabsContent>
          )}
          <TabsContent value="timing" className="pt-4">
            <TimingCard report={data} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

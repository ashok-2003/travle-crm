"use client";

// /reports/staff/<id> (sales execution): one staff member's performance over the period: their leads, conversion and
// first reply against the team's, quotes, wins, sales and money collected, the messages, notes and tasks they did each
// day, their open leads and missed follow-ups now, when they were last active, and what they did last (the audit log).
// A role that sees every lead opens anyone's; anyone else only their own.
import { dashboardRanges, type DashboardRange } from "@travel-crm/contracts/insights";
import { CheckIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useAuditWords } from "@/audit/audit-words";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { refusalOf } from "@/data/api-error";
import { waitWords } from "@/dashboard/duration";
import { formatCalendarDay, formatCount, formatDayTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { FigureTile } from "./figure-tile";
import { percentOf, useStaffReport } from "./use-reports";

const isRange = (value: string): value is DashboardRange => dashboardRanges.some((range) => range === value);

export function StaffReportScreen({ userId }: { userId: string }) {
  const t = useTranslations("reports.staff");
  const tRange = useTranslations("dashboard.range");
  const tDuration = useTranslations("dashboard.duration");
  const words = useAuditWords();
  const { timeZone } = useMe().organization;
  const [range, setRange] = useState<DashboardRange>("30d");
  const report = useStaffReport(userId, range);
  const data = report.data;
  const config = {
    messages: { label: t("series.messages"), color: "var(--color-people)" },
    notes: { label: t("series.notes"), color: "var(--color-status-attention-dot)" },
    tasksDone: { label: t("series.tasks"), color: "var(--color-action)" },
  } satisfies ChartConfig;

  if (data === undefined) {
    if (refusalOf(report.error)?.reason === "NOT_FOUND")
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    return report.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={report.error}
        retryLabel={t("retry")}
        onRetry={() => void report.refetch()}
      />
    ) : (
      <LoadingRows rows={6} shape="twoLines" label={t("loading")} />
    );
  }
  const person = data.person;
  const conversion = person.leads === 0 ? null : (person.won * 100) / person.leads;
  return (
    <div className="flex max-w-[1400px] flex-col gap-6">
      <BackLink href={routes.reports} label={t("back")} />
      <PageHeader
        title={person.name ?? t("formerStaff")}
        intro={
          data.lastActiveAt === null
            ? t("neverActive")
            : t("lastActive", { when: formatDayTime(new Date(data.lastActiveAt), { timeZone }) })
        }
      />
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
        <p className="text-label text-muted-foreground">
          {t("period", { from: formatCalendarDay(data.from), to: formatCalendarDay(data.to) })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("figuresTitle")}</CardTitle>
          <CardDescription>{t("figuresIntro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-6">
            <FigureTile
              label={t("sales")}
              value={rupees(person.salesPaise)}
              note={t("teamSales", { amount: rupees(data.teamAverage.salesPaise) })}
            />
            <FigureTile label={t("won")} value={formatCount(person.won)} note={t("ofLeads", { count: person.leads })} />
            <FigureTile
              label={t("conversion")}
              value={percentOf(person.won, person.leads)}
              now={conversion}
              before={data.teamAverage.conversionPercent}
              note={
                data.teamAverage.conversionPercent === null
                  ? undefined
                  : t("vsTeam", { value: `${String(Math.round(data.teamAverage.conversionPercent))}%` })
              }
            />
            <FigureTile
              label={t("firstReply")}
              value={
                person.medianFirstReplyMinutes === null ? "–" : waitWords(person.medianFirstReplyMinutes, tDuration)
              }
              now={person.medianFirstReplyMinutes}
              before={data.teamAverage.medianFirstReplyMinutes}
              lessIsBetter
              note={
                data.teamAverage.medianFirstReplyMinutes === null
                  ? undefined
                  : t("vsTeam", { value: waitWords(data.teamAverage.medianFirstReplyMinutes, tDuration) })
              }
            />
            <FigureTile label={t("collected")} value={rupees(person.collectedPaise)} />
            <FigureTile label={t("quotes")} value={formatCount(person.quotesSent)} />
            <FigureTile label={t("messages")} value={formatCount(person.messages)} />
            <FigureTile label={t("notes")} value={formatCount(person.notes)} />
            <FigureTile label={t("tasks")} value={formatCount(person.tasksDone)} />
            <FigureTile label={t("open")} value={formatCount(person.openLeads)} />
            <FigureTile
              label={t("overdue")}
              value={formatCount(person.overdue)}
              note={person.overdue > 0 ? t("overdueNote") : undefined}
            />
            <FigureTile label={t("lost")} value={formatCount(person.lost)} />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("dailyTitle")}</CardTitle>
            <CardDescription>{t("dailyIntro")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={config} className="aspect-auto h-64 w-full" role="img" aria-label={t("dailyTitle")}>
              <BarChart data={data.perDay} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(day: string) => formatCalendarDay(day)}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent labelFormatter={(day) => formatCalendarDay(String(day))} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="messages" stackId="work" fill="var(--color-messages)" isAnimationActive={false} />
                <Bar dataKey="notes" stackId="work" fill="var(--color-notes)" isAnimationActive={false} />
                <Bar
                  dataKey="tasksDone"
                  stackId="work"
                  fill="var(--color-tasksDone)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("activityTitle")}</CardTitle>
            <CardDescription>{t("activityIntro")}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <p className="text-muted-foreground">{t("noActivity")}</p>
            ) : (
              <ItemGroup>
                {data.activity.map((entry, index) => (
                  <Item key={`${entry.occurredAt}-${String(index)}`} size="sm">
                    <ItemContent>
                      <ItemTitle>{words.action(entry.action)}</ItemTitle>
                      <ItemDescription>{formatDayTime(new Date(entry.occurredAt), { timeZone })}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

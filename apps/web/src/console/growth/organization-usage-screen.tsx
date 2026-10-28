"use client";

// /console/usage/<organization> (the owner, 2026-10-28): how one organization uses the product: its AI this month (calls,
// tokens, cost, and at this pace), its last fortnight day by day (people active and minutes used), the pages it spends
// its time on, each member's time and sessions, and its sessions as they began (sign-ins, newest first).
import { BotIcon, CoinsIcon, IndianRupeeIcon, TrendingUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDay, formatCount, formatDayTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { consoleRoutes } from "../routes";
import { Figures, formatDuration } from "./figures";
import { useOrganizationUsage, useUsageOverview } from "./use-growth";
import { rupeesOf } from "./usage-screen";

export function OrganizationUsageScreen({ organizationId }: { organizationId: string }) {
  const t = useTranslations("consoleGrowth.organization");
  const tCommon = useTranslations("common");
  const usage = useOrganizationUsage(organizationId);
  const name = useUsageOverview().data?.items.find((row) => row.organizationId === organizationId)?.name;
  const data = usage.data;
  const when = (iso: string | null) =>
    iso === null ? t("never") : formatDayTime(new Date(iso), { timeZone: PLATFORM_TIME_ZONE });
  const config = {
    minutes: { label: t("series.minutes"), color: "var(--color-action)" },
    people: { label: t("series.people"), color: "var(--color-people)" },
  } satisfies ChartConfig;

  let content;
  if (data === undefined) {
    content = usage.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={usage.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void usage.refetch()}
      />
    ) : (
      <LoadingRows rows={5} shape="twoLines" label={t("loading")} />
    );
  } else {
    content = (
      <>
        <Figures
          label={t("aiLabel")}
          figures={[
            { key: "calls", icon: BotIcon, value: formatCount(data.ai.calls), label: t("figures.calls") },
            {
              key: "tokens",
              icon: CoinsIcon,
              value: formatCount(data.ai.inputTokens + data.ai.outputTokens),
              label: t("figures.tokens"),
            },
            { key: "cost", icon: IndianRupeeIcon, value: rupeesOf(data.ai.costPaise), label: t("figures.cost") },
            {
              key: "projected",
              icon: TrendingUpIcon,
              value: rupeesOf(data.ai.projectedPaise),
              label: t("figures.projected"),
            },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("daysTitle")}</h2>
            </CardTitle>
            <CardDescription>{t("daysDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={config} className="aspect-auto h-56 w-full" role="img" aria-label={t("daysTitle")}>
              <BarChart
                data={data.days.map((day) => ({ ...day, minutes: Math.round(day.seconds / 60) }))}
                margin={{ left: -16, right: 8, top: 8 }}
              >
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
                <Bar dataKey="minutes" fill="var(--color-minutes)" radius={4} isAnimationActive={false} />
                <Bar dataKey="people" fill="var(--color-people)" radius={4} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("pagesTitle")}</h2>
              </CardTitle>
              <CardDescription>{t("pagesDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.pages.length === 0 ? (
                <p className="text-muted-foreground">{t("nothingYet")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("columns.page")}</TableHead>
                      <TableHead className="text-right">{t("columns.visits")}</TableHead>
                      <TableHead className="text-right">{t("columns.time")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pages.map((page) => (
                      <TableRow key={page.path}>
                        <TableCell className="numbers">{page.path}</TableCell>
                        <TableCell className="numbers text-right">{formatCount(page.visits)}</TableCell>
                        <TableCell className="numbers text-right">{formatDuration(page.seconds)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("membersTitle")}</h2>
              </CardTitle>
              <CardDescription>{t("membersDescription", { count: data.members.length })}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.member")}</TableHead>
                    <TableHead>{t("columns.lastActive")}</TableHead>
                    <TableHead className="text-right">{t("columns.time")}</TableHead>
                    <TableHead className="text-right">{t("columns.sessions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.members.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell>{member.name}</TableCell>
                      <TableCell className="text-caption">{when(member.lastActiveAt)}</TableCell>
                      <TableCell className="numbers text-right">{formatDuration(member.seconds30d)}</TableCell>
                      <TableCell className="numbers text-right">{formatCount(member.sessions30d)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("sessionsTitle")}</h2>
            </CardTitle>
            <CardDescription>{t("sessionsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {data.sessions.length === 0 ? (
              <p className="text-muted-foreground">{t("nothingYet")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.member")}</TableHead>
                    <TableHead>{t("columns.started")}</TableHead>
                    <TableHead className="text-right">{t("columns.time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sessions.map((session) => (
                    <TableRow key={`${session.userId}-${session.startedAt}`}>
                      <TableCell>{session.name}</TableCell>
                      <TableCell className="text-caption">{when(session.startedAt)}</TableCell>
                      <TableCell className="numbers text-right">{formatDuration(session.seconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={consoleRoutes.usage} label={t("back")} />
      <PageHeader title={name ?? t("title")} intro={t("intro")} />
      {content}
    </div>
  );
}

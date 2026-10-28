"use client";

// /console/usage (the owner, 2026-10-28): how every organization uses the product: its members and leads, when it was
// last used, its time in the product this week and month, its sessions, and what its AI cost this month and will at
// this pace; the platform's figures above. Each row leads to the organization's own usage.
import { money } from "@travel-crm/domain/kernel";
import {
  ActivityIcon,
  BarChart3Icon,
  BuildingIcon,
  ClockIcon,
  IndianRupeeIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount, formatDayTime, formatRupees } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { consoleRoutes } from "../routes";
import { Figures, formatDuration } from "./figures";
import { useUsageOverview } from "./use-growth";

export const rupeesOf = (paise: number) => formatRupees(money(paise));

export function UsageScreen() {
  const t = useTranslations("consoleGrowth.usage");
  const tCommon = useTranslations("common");
  const usage = useUsageOverview();
  const data = usage.data;

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
  } else if (data.items.length === 0) {
    content = <EmptyState icon={BuildingIcon} message={t("empty")} />;
  } else {
    content = (
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.organization")}</TableHead>
                <TableHead className="text-right">{t("columns.members")}</TableHead>
                <TableHead className="text-right">{t("columns.leads")}</TableHead>
                <TableHead>{t("columns.lastActive")}</TableHead>
                <TableHead className="text-right">{t("columns.week")}</TableHead>
                <TableHead className="text-right">{t("columns.month")}</TableHead>
                <TableHead className="text-right">{t("columns.sessions")}</TableHead>
                <TableHead className="text-right">{t("columns.ai")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.organizationId}>
                  <TableCell>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="flex items-center gap-2">
                        <TextLink inline href={consoleRoutes.organizationUsage(row.organizationId)}>
                          {row.name}
                        </TextLink>
                        {row.vip && <StatusBadge tone="good">{t("vip")}</StatusBadge>}
                      </span>
                      <span className="numbers text-caption text-muted-foreground">{row.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="numbers text-right">{formatCount(row.members)}</TableCell>
                  <TableCell className="numbers text-right">{formatCount(row.leads)}</TableCell>
                  <TableCell className="text-caption">
                    {row.lastActiveAt === null
                      ? t("never")
                      : formatDayTime(new Date(row.lastActiveAt), { timeZone: PLATFORM_TIME_ZONE })}
                  </TableCell>
                  <TableCell className="numbers text-right">{formatDuration(row.seconds7d)}</TableCell>
                  <TableCell className="numbers text-right">{formatDuration(row.seconds30d)}</TableCell>
                  <TableCell className="numbers text-right">{formatCount(row.sessions30d)}</TableCell>
                  <TableCell className="text-right">
                    <span className="numbers block">{rupeesOf(row.aiCostPaise)}</span>
                    <span className="numbers block text-caption text-muted-foreground">
                      {t("projected", { amount: rupeesOf(row.aiProjectedPaise) })}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      {data !== undefined && !data.aiPriced && (
        <Alert>
          <SparklesIcon aria-hidden="true" />
          <AlertTitle>{t("noPricesTitle")}</AlertTitle>
          <AlertDescription>{t("noPricesDescription")}</AlertDescription>
        </Alert>
      )}
      {data !== undefined && (
        <Figures
          wide
          label={t("figuresLabel")}
          figures={[
            {
              key: "organizations",
              icon: BuildingIcon,
              value: formatCount(data.totals.organizations),
              label: t("figures.organizations"),
            },
            {
              key: "today",
              icon: ActivityIcon,
              value: formatCount(data.totals.activeToday),
              label: t("figures.activeToday"),
            },
            {
              key: "week",
              icon: BarChart3Icon,
              value: formatCount(data.totals.active7d),
              label: t("figures.active7d"),
            },
            { key: "time", icon: ClockIcon, value: formatDuration(data.totals.seconds7d), label: t("figures.time7d") },
            {
              key: "cost",
              icon: IndianRupeeIcon,
              value: rupeesOf(data.totals.aiCostPaise),
              label: t("figures.aiCost"),
            },
            {
              key: "projected",
              icon: TrendingUpIcon,
              value: rupeesOf(data.totals.aiProjectedPaise),
              label: t("figures.aiProjected"),
            },
          ]}
        />
      )}
      {content}
    </div>
  );
}

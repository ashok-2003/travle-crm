"use client";

// Home's leads card (spec 5): leads that came in during the period, by the stage they are in now. A compact card for
// each stage in its own tint (DESIGN.md "Stage breakdown (Home)"), each a way into the Leads list at that stage and
// period, and a donut in the stages' dot colours with the total in its middle, compact enough to share its row with
// the AI's insights from 1280px (owner, 2026-11-20). The total is a figure, not a link.
import { leadStage, type LeadStage } from "@travel-crm/contracts/crm";
import type { Period } from "@travel-crm/contracts/kernel";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Pie, PieChart } from "recharts";
import { InfoHint } from "@/components/info-hint";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { TextLink } from "@/components/text-link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { listFiltersHref } from "@/leads/list/list-filters";
import { useStageBreakdown } from "@/leads/use-stage-breakdown";
import { stageTones } from "@/leads/stage-badge";
import { viewScope, useMe } from "@/session/me-context";
import { useNavigationItems } from "@/shell/use-navigation-items";

/** The stages shown, in the order of the pipeline; Not a lead is counted by nobody here. */
const shown = leadStage.options.filter((stage): stage is Exclude<LeadStage, "not_a_lead"> => stage !== "not_a_lead");

/** Each stage's dot colour as the brand's variable, for the donut (never a literal). */
const dotColours: Record<Exclude<LeadStage, "not_a_lead">, string> = {
  new: "var(--brand-stage-new-dot)",
  contacted: "var(--brand-stage-contacted-dot)",
  quote_sent: "var(--brand-status-attention-dot)",
  booking_requested: "var(--brand-stage-booking-requested-dot)",
  won: "var(--brand-status-good-dot)",
  lost: "var(--brand-status-bad-dot)",
};

export function LeadsCard({ period }: { period: Period }) {
  const t = useTranslations("home.leads");
  const tStages = useTranslations("leads.stages");
  const headingId = useId();
  const me = useMe();
  const hasReports = useNavigationItems().some((item) => item.key === "reports");
  const breakdown = useStageBreakdown(period);
  const everyone = viewScope(me, "leads:view") === "all";
  const config = Object.fromEntries(
    shown.map((stage) => [stage, { label: tStages(stage), color: dotColours[stage] }]),
  ) satisfies ChartConfig;
  const hrefOf = (stage: LeadStage) =>
    listFiltersHref({
      ...(everyone && { view: "everyone" as const }),
      stage,
      ...(period !== "all" && { created: period }),
    });
  const data = breakdown.data;
  const segments = data === undefined ? [] : shown.filter((stage) => data.stages[stage] > 0);
  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          <h2 id={headingId}>{t("title")}</h2>
          <InfoHint term={t("title")}>{t("hint")}</InfoHint>
        </CardTitle>
        {hasReports && (
          <CardAction>
            <TextLink href={routes.reports}>{t("reports")}</TextLink>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {breakdown.isError ? (
          <LoadFailedAlert message={t("loadFailed")} error={breakdown.error} onRetry={() => void breakdown.refetch()} />
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <ul className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
              {shown.map((stage) => (
                <li key={stage}>
                  {data === undefined ? (
                    <Skeleton className="h-14 w-full" />
                  ) : (
                    <Link
                      href={hrefOf(stage)}
                      className={cn(
                        "flex h-full min-h-14 flex-col justify-between gap-0.5 rounded-lg px-3 py-2",
                        stageTones[stage].badge,
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 text-label font-medium">
                        <span
                          aria-hidden="true"
                          className={cn("size-1.5 shrink-0 rounded-full", stageTones[stage].dot)}
                        />
                        {tStages(stage)}
                      </span>
                      <span className="numbers text-number font-medium">{formatCount(data.stages[stage])}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {/* The total sits in the donut's middle, so the pair takes one narrow column. */}
            <div className="relative size-32 shrink-0 self-center">
              <ChartContainer config={config} className="aspect-square size-32" role="img" aria-label={t("chart")}>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="stage" />} />
                  {segments.length === 0 ? (
                    <Pie
                      data={[{ stage: "none", count: 1, fill: "var(--color-muted)" }]}
                      dataKey="count"
                      innerRadius={46}
                      outerRadius={62}
                      isAnimationActive={false}
                      stroke="none"
                    />
                  ) : (
                    <Pie
                      data={segments.map((stage) => ({
                        stage,
                        count: data?.stages[stage] ?? 0,
                        fill: `var(--color-${stage})`,
                      }))}
                      dataKey="count"
                      nameKey="stage"
                      innerRadius={46}
                      outerRadius={62}
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    />
                  )}
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {data === undefined ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <span className="numbers text-number-lg font-medium">{formatCount(data.total)}</span>
                )}
                <span className="text-caption text-muted-foreground">{t("total")}</span>
              </div>
            </div>
            {data !== undefined && (
              <table className="sr-only">
                <caption>{t("table")}</caption>
                <tbody>
                  {segments.map((stage) => (
                    <tr key={stage}>
                      <th scope="row">{tStages(stage)}</th>
                      <td>{formatCount(data.stages[stage])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

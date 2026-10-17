"use client";

// Home's nudge (spec 3.1, the mockup): how many things today and how many are overdue, then at most three of them,
// today.summary's top (the first overdue, the new lead waiting longest, the next due today), each leading to its lead
// with its urgency in colour, and Open Today, Home's main button. Never a long list on Home: Today holds that.
import type { TodayItem } from "@travel-crm/contracts/today";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatTime } from "@/lib/format";
import { elapsed } from "@/lib/relative-time";
import { leadRoute, routes } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { useMe } from "@/session/me-context";
import { todayItemId } from "./today-item";
import { useTodaySummary } from "./use-today";
import { WhenMark, type Urgency } from "./when-mark";

/** Home shows three things at most, whatever the api sends. */
const SHOWN = 3;

/** One thing: who (or a task's title), what to do, and its urgency: "Overdue", "12 min ago", "4:00 pm". */
function NudgeItem({ item }: { item: TodayItem }) {
  const t = useTranslations("today.nudge");
  const tNext = useTranslations("leads.next");
  const { timeZone } = useMe().organization;
  const now = useNow();
  const when = ((): { urgency: Urgency; text: string } => {
    if (item.kind === "new-lead") {
      const { unit, count } = elapsed(new Date(item.waitingSince), now);
      return { urgency: "waiting", text: t("ago", { elapsed: tNext(`elapsed.${unit}`, { count }) }) };
    }
    const due = new Date(item.task.dueAt);
    return due < now
      ? { urgency: "overdue", text: t("overdue") }
      : { urgency: "today", text: formatTime(due, { timeZone }) };
  })();
  const title = item.lead?.personName ?? (item.kind === "task" ? item.task.title : "");
  const about = item.kind === "new-lead" ? t("waiting") : item.lead === null ? null : item.task.title;
  return (
    <div role="listitem">
      <Item size="sm" asChild>
        <Link href={item.lead === null ? routes.today : leadRoute(item.lead.id)}>
          <ItemContent className="min-w-0">
            <ItemTitle className="script-leading">{title}</ItemTitle>
            {about !== null && <ItemDescription className="break-words script-leading">{about}</ItemDescription>}
          </ItemContent>
          <WhenMark urgency={when.urgency}>{when.text}</WhenMark>
        </Link>
      </Item>
    </div>
  );
}

export function TodayNudge() {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const summary = useTodaySummary();
  const headingId = useId();

  if (summary.data) {
    const { overdue, newLeads, dueToday } = summary.data.counts;
    const total = overdue + newLeads + dueToday;
    const top = summary.data.top.slice(0, SHOWN);
    return (
      <Card role="region" aria-labelledby={headingId}>
        <CardHeader>
          <CardTitle>
            <h2 id={headingId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {total === 0 ? t("nudge.nothing") : t("nudge.count", { count: total })}
              {overdue > 0 && <StatusBadge tone="bad">{t("overdueCount", { count: overdue })}</StatusBadge>}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {top.length > 0 && (
            <ItemGroup>
              {top.map((item, index) => (
                <Fragment key={todayItemId(item)}>
                  {index > 0 && <ItemSeparator />}
                  <NudgeItem item={item} />
                </Fragment>
              ))}
            </ItemGroup>
          )}
          <Button asChild className="self-start">
            <Link href={routes.today}>{t("nudge.open")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (summary.isError) {
    return (
      <ErrorState
        message={t("nudge.loadFailed")}
        error={summary.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void summary.refetch()}
      />
    );
  }
  return <LoadingRows rows={3} />;
}

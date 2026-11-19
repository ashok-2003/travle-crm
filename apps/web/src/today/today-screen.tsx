"use client";

// My tasks (web revamp, spec 6; the address stays /today): the signed-in person's own work, whatever their scope. The
// header says the agency's day and how many things there are, red when some are overdue, with Add a task as the screen's
// action; under it the follow-ups line (follow-ups live on their own screen); then tabs with their counts (web revamp
// part 2): Overdue, Due today, New leads, AI needs you, Payments due and Trips leaving soon, each shown while it holds
// something and the first of them open, each a table of its own.
import { myTasksTotal, type TodaySummary } from "@travel-crm/contracts/today";
import { parseCalendarDate, startOfDayIn } from "@travel-crm/domain/kernel";
import { CalendarCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useNeedsMe } from "@/ai/use-needs-me";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FollowUpsLine } from "@/follow-ups/follow-ups-line";
import { AwaySwitch } from "@/leads/away-switch";
import { TabCount } from "@/components/tab-count";
import { formatDay, formatWeekday } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { AddTaskDialog } from "./add-task-dialog";
import { AiNeedsYouSection } from "./ai-needs-you-section";
import { TodaySection, type MyTasksSection } from "./today-section";
import { useTodaySummary } from "./use-today";

type Tab = MyTasksSection | "ai";

/** The tabs in their order, and the count each one shows (AI needs you counts what the AI asks, not the payments). */
const tabs: readonly Tab[] = ["overdue", "due-today", "new-leads", "ai", "payments-due", "trip-details"];
const countOf = {
  overdue: "overdue",
  "due-today": "dueToday",
  "new-leads": "newLeads",
  "payments-due": "paymentsDue",
  "trip-details": "tripDetails",
} as const;

/**
 * "Fri 16 Oct · 8 to do", and "2 overdue" in red when some are. The day is the agency's (the api's), shown by the
 * shared formatWeekday and formatDay from its first moment in the agency's zone.
 */
function DayLine({ summary, extra }: { summary: TodaySummary; extra: number }) {
  const t = useTranslations("today");
  const { timeZone } = useMe().organization;
  const start = startOfDayIn(parseCalendarDate(summary.day), timeZone);
  const { overdue } = summary.counts;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {t("intro", {
          weekday: formatWeekday(start, { timeZone }),
          day: formatDay(start, { timeZone }),
          count: myTasksTotal(summary.counts) + extra,
        })}
      </span>
      {overdue > 0 && <StatusBadge tone="bad">{t("overdueCount", { count: overdue })}</StatusBadge>}
    </span>
  );
}

export function TodayScreen() {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const summary = useTodaySummary();
  const needs = useNeedsMe();
  const [chosen, setChosen] = useState<Tab | null>(null);

  const body = () => {
    if (summary.data) {
      const { counts } = summary.data;
      const countIn = (tab: Tab) => (tab === "ai" ? needs.count : counts[countOf[tab]]);
      const aiShown = needs.count + counts.paymentsToCheck > 0 || needs.isError;
      const shown = tabs.filter((tab) => (tab === "ai" ? aiShown : countIn(tab) > 0));
      const active = chosen !== null && shown.includes(chosen) ? chosen : shown[0];
      return (
        <div className="flex flex-col gap-6">
          <FollowUpsLine />
          {active === undefined ? (
            !needs.isPending && <EmptyState icon={CalendarCheckIcon} message={t("nothing")} />
          ) : (
            <Tabs
              value={active}
              onValueChange={(value) => {
                setChosen(tabs.find((tab) => tab === value) ?? null);
              }}
            >
              {/* Every panel stays mounted (its query, its pages) and the others hidden, so a switch is instant. */}
              <TabsList
                variant="solid"
                aria-label={t("sectionsLabel")}
                className="max-w-full justify-start overflow-x-auto"
              >
                {shown.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    {t(`sections.${tab === "ai" ? "aiNeedsYou" : tab}`)} <TabCount count={countIn(tab)} />
                  </TabsTrigger>
                ))}
              </TabsList>
              {shown.map((tab) => (
                <TabsContent key={tab} value={tab} forceMount hidden={tab !== active}>
                  {tab === "ai" ? (
                    <AiNeedsYouSection needs={needs} paymentsToCheck={counts.paymentsToCheck} />
                  ) : (
                    <TodaySection section={tab} />
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      );
    }
    if (summary.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={summary.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void summary.refetch()}
        />
      );
    }
    return <LoadingRows rows={4} shape="twoLines" />;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={summary.data && <DayLine summary={summary.data} extra={needs.count} />}
        action={<AddTaskDialog />}
      />
      {/* For someone who takes new leads in turn: away for a while, back at once. Nothing for anyone else. */}
      <AwaySwitch />
      {body()}
    </div>
  );
}

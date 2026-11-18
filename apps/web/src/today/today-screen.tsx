"use client";

// My tasks (web revamp, spec 6; the address stays /today): the signed-in person's own work, whatever their scope. The
// header says the agency's day and how many things there are, red when some are overdue, with Add a task as the screen's
// action; under it the follow-ups line (follow-ups live on their own screen); then Overdue, Due today, New leads to
// contact, AI needs you, Payments due and Trips leaving soon, each shown while it holds something.
import { myTasksTotal, type TodaySummary } from "@travel-crm/contracts/today";
import { parseCalendarDate, startOfDayIn } from "@travel-crm/domain/kernel";
import { CalendarCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useNeedsMe } from "@/ai/use-needs-me";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { FollowUpsLine } from "@/follow-ups/follow-ups-line";
import { AwaySwitch } from "@/leads/away-switch";
import { formatDay, formatWeekday } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { AddTaskDialog } from "./add-task-dialog";
import { AiNeedsYouSection } from "./ai-needs-you-section";
import { TodaySection, type MyTasksSection } from "./today-section";
import { useTodaySummary } from "./use-today";

interface Counted {
  name: MyTasksSection;
  count: "overdue" | "dueToday" | "newLeads" | "paymentsDue" | "tripDetails";
}

const sections: readonly Counted[] = [
  { name: "overdue", count: "overdue" },
  { name: "due-today", count: "dueToday" },
  { name: "new-leads", count: "newLeads" },
];

// Still here, after AI needs you, until the Bookings redesign gives them a new home.
const lastSections: readonly Counted[] = [
  { name: "payments-due", count: "paymentsDue" },
  { name: "trip-details", count: "tripDetails" },
];

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

  const body = () => {
    if (summary.data) {
      const { counts } = summary.data;
      const shown = sections.filter((section) => counts[section.count] > 0);
      const shownLast = lastSections.filter((section) => counts[section.count] > 0);
      const aiThings = needs.count + counts.paymentsToCheck;
      const nothing =
        shown.length === 0 && shownLast.length === 0 && aiThings === 0 && !needs.isPending && !needs.isError;
      // Sections stand further apart than the things inside them, so a section's title never reads as one more row.
      return (
        <div className="flex flex-col gap-10">
          <FollowUpsLine />
          {nothing && <EmptyState icon={CalendarCheckIcon} message={t("nothing")} />}
          {shown.map((section) => (
            <TodaySection key={section.name} section={section.name} count={counts[section.count]} />
          ))}
          {(aiThings > 0 || needs.isError) && (
            <AiNeedsYouSection needs={needs} paymentsToCheck={counts.paymentsToCheck} />
          )}
          {shownLast.map((section) => (
            <TodaySection key={section.name} section={section.name} count={counts[section.count]} />
          ))}
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
    <div className="flex max-w-[960px] flex-col gap-6">
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

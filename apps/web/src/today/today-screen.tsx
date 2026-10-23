"use client";

// Today (spec 3.5): the signed-in person's own day, whatever their scope (R35). The header says the agency's day and
// how many things it holds, red when some are overdue, with Add a task as the screen's action; then Overdue, New leads
// not contacted yet and Due today, each shown while it holds something. A quiet line says what later releases add.
import type { TodaySectionName, TodaySummary } from "@travel-crm/contracts/today";
import { parseCalendarDate, startOfDayIn } from "@travel-crm/domain/kernel";
import { CalendarCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AwaySwitch } from "@/leads/away-switch";
import { formatDay, formatWeekday } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { AddTaskDialog } from "./add-task-dialog";
import { TodaySection } from "./today-section";
import { useTodaySummary } from "./use-today";

const sections: readonly { name: TodaySectionName; count: keyof TodaySummary["counts"] }[] = [
  { name: "overdue", count: "overdue" },
  { name: "new-leads", count: "newLeads" },
  { name: "due-today", count: "dueToday" },
];

/**
 * "Fri 16 Oct · 8 things", and "2 overdue" in red when some are. The day is the agency's (the api's), shown by the
 * shared formatWeekday and formatDay from its first moment in the agency's zone.
 */
function DayLine({ summary }: { summary: TodaySummary }) {
  const t = useTranslations("today");
  const { timeZone } = useMe().organization;
  const start = startOfDayIn(parseCalendarDate(summary.day), timeZone);
  const { overdue, newLeads, dueToday } = summary.counts;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {t("intro", {
          weekday: formatWeekday(start, { timeZone }),
          day: formatDay(start, { timeZone }),
          count: overdue + newLeads + dueToday,
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

  const body = () => {
    if (summary.data) {
      const { counts } = summary.data;
      const shown = sections.filter((section) => counts[section.count] > 0);
      // Sections stand further apart than the things inside them, so a section's title never reads as one more row.
      return (
        <div className="flex flex-col gap-10">
          {shown.length === 0 ? (
            <EmptyState icon={CalendarCheckIcon} message={t("nothing")} />
          ) : (
            shown.map((section) => (
              <TodaySection key={section.name} section={section.name} count={counts[section.count]} />
            ))
          )}
          <p className="text-label text-muted-foreground">{t("later")}</p>
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
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={summary.data && <DayLine summary={summary.data} />}
        action={<AddTaskDialog />}
      />
      {/* For someone who takes new leads in turn: away for a while, back at once. Nothing for anyone else. */}
      <AwaySwitch />
      {body()}
    </div>
  );
}

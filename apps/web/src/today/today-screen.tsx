"use client";

// Today (spec 3.5): the signed-in person's own day, whatever their scope (R35). The header says the agency's day and
// how many things it holds, red when some are overdue, with Add a task as the screen's action; then Overdue, New leads
// waiting for a reply and Due today, each shown while it holds something. A quiet line says what later releases add.
import type { TodaySectionName, TodaySummary } from "@travel-crm/contracts/today";
import { CalendarCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AddTaskDialog } from "./add-task-dialog";
import { TodaySection } from "./today-section";
import { useTodaySummary } from "./use-today";

const sections: readonly { name: TodaySectionName; count: keyof TodaySummary["counts"] }[] = [
  { name: "overdue", count: "overdue" },
  { name: "new-leads", count: "newLeads" },
  { name: "due-today", count: "dueToday" },
];

/** A day with no time, read as UTC midnight so formatting never moves it: "Fri" and "16 Oct". */
const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Fri 16 Oct · 8 things", and "2 overdue" in red when some are. */
function DayLine({ summary }: { summary: TodaySummary }) {
  const t = useTranslations("today");
  const date = new Date(`${summary.day}T00:00:00Z`);
  const { overdue, newLeads, dueToday } = summary.counts;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {t("intro", {
          weekday: weekday.format(date),
          day: dayMonth.format(date),
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
      return (
        <>
          {shown.length === 0 ? (
            <EmptyState icon={CalendarCheckIcon} message={t("nothing")} />
          ) : (
            shown.map((section) => (
              <TodaySection key={section.name} section={section.name} count={counts[section.count]} />
            ))
          )}
          <p className="text-label text-muted-foreground">{t("later")}</p>
        </>
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
      {body()}
    </div>
  );
}

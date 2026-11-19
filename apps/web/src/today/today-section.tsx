"use client";

// One of My tasks' tabs (web revamp part 2): its things as a table (section-columns.tsx), a page at a time, the next one
// loading from Show more after the rows; New leads leads back to the Leads list. Each has its own skeleton and its own
// error with Try again, so one tab failing leaves the others working.
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ForwardLink } from "@/components/text-link";
import { WorkTable } from "@/components/work-table";
import { listFiltersHref } from "@/leads/list/list-filters";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useSectionColumns } from "./section-columns";
import { todayItemId, useTodaySection } from "./use-today";

export type MyTasksSection = "overdue" | "due-today" | "new-leads" | "payments-due" | "trip-details";

export function TodaySection({ section }: { section: MyTasksSection }) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const wide = useWideScreen();
  const pages = useTodaySection(section);
  const table = useSectionColumns(section);

  const body = () => {
    if (pages.items) {
      return (
        <WorkTable
          label={t(`sections.${section}`)}
          rows={pages.items}
          rowKey={todayItemId}
          {...table}
          more={t(`more.${section}`)}
          after={<ShowMoreButton pages={pages} label={t(`more.${section}`)} />}
        />
      );
    }
    if (pages.isError) {
      return (
        <ErrorState
          message={t("sectionLoadFailed")}
          error={pages.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void pages.refetch()}
        />
      );
    }
    return <LoadingRows rows={3} shape={wide ? "table" : "twoLines"} columns={table.columns.length + 1} />;
  };

  return (
    <div className="flex flex-col gap-3">
      {section === "new-leads" && <ForwardLink href={listFiltersHref({ stage: "new" })} label={t("allNewLeads")} />}
      {body()}
    </div>
  );
}

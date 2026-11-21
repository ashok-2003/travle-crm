"use client";

// One of My tasks' tabs (web revamp part 2): its things as a table (section-columns.tsx), a page at a time, the next one
// loading from Show more after the rows; New leads leads back to the Leads list on Show: Not contacted yet. Each has its
// own skeleton and its own error with Try again, so one tab failing leaves the others working.
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ForwardLink } from "@/components/text-link";
import { useTableFits, WorkTable } from "@/components/work-table";
import { listFiltersHref } from "@/leads/list/list-filters";
import { useSectionColumns } from "./section-columns";
import { todayItemId, useTodaySection, type MyTasksSection } from "./use-today";

export function TodaySection({ section }: { section: MyTasksSection }) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const wide = useTableFits();
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
      {/* The member's own New leads nobody has contacted yet, by the section's own rule, so the list matches its count. */}
      {section === "new-leads" && (
        <ForwardLink href={listFiltersHref({ show: "uncontacted" })} label={t("allNewLeads")} />
      )}
      {body()}
    </div>
  );
}

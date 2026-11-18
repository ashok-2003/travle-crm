"use client";

// One of My tasks' sections: its heading with the day's count, then its first five things; View all shows the rest in
// place, or, for new leads, opens the Leads list on New. Each has its own skeleton and its own error with Try again, so
// one section failing leaves the others working.
import { useTranslations } from "next-intl";
import { Fragment, useId, useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { listFiltersHref } from "@/leads/list/list-filters";
import { formatCount } from "@/lib/format";
import { TodayItem, todayItemId } from "./today-item";
import { useTodaySection } from "./use-today";

export const ROWS_SHOWN = 5;

export type MyTasksSection = "overdue" | "due-today" | "new-leads";

export function TodaySection({ section, count }: { section: MyTasksSection; count: number }) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const headingId = useId();
  const pages = useTodaySection(section);
  const [showingAll, setShowingAll] = useState(false);
  const more = count > ROWS_SHOWN;

  const body = () => {
    if (pages.items) {
      const items = showingAll ? pages.items : pages.items.slice(0, ROWS_SHOWN);
      return (
        <>
          <ItemGroup>
            {items.map((item, index) => (
              <Fragment key={todayItemId(item)}>
                {index > 0 && <ItemSeparator />}
                <TodayItem item={item} />
              </Fragment>
            ))}
          </ItemGroup>
          {showingAll && <ShowMoreButton pages={pages} label={t(`more.${section}`)} />}
        </>
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
    return <LoadingRows rows={Math.min(count, 3)} shape="twoLines" />;
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-section font-semibold">
          {t(`sections.${section}`)}
        </h2>
        <span className="numbers text-label text-muted-foreground">{formatCount(count)}</span>
      </div>
      {body()}
      {more &&
        (section === "new-leads" ? (
          <TextLink href={listFiltersHref({ stage: "new" })}>{t("viewAll")}</TextLink>
        ) : (
          !showingAll && (
            <Button
              variant="link"
              className="min-h-11 self-start px-0"
              onClick={() => {
                setShowingAll(true);
              }}
            >
              {t("viewAll")}
            </Button>
          )
        ))}
    </section>
  );
}

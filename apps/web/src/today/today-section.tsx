"use client";

// One of My tasks' sections, as a card that scrolls inside itself: its heading with the day's count, then all its
// things, the next page loading from a button at the foot of the scroll. Each has its own skeleton and its own error
// with Try again, so one section failing leaves the others working.
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ScrollingSection } from "@/components/scrolling-section";
import { ShowMoreButton } from "@/components/show-more-button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { TodayItem, todayItemId } from "./today-item";
import { useTodaySection } from "./use-today";

export type MyTasksSection = "overdue" | "due-today" | "new-leads" | "payments-due" | "trip-details";

export function TodaySection({
  section,
  count,
  defaultOpen,
}: {
  section: MyTasksSection;
  count: number;
  /** On a phone: whether the section starts open. */
  defaultOpen: boolean;
}) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const pages = useTodaySection(section);

  const body = () => {
    if (pages.items) {
      return (
        <>
          <ItemGroup className="gap-0">
            {pages.items.map((item, index) => (
              <Fragment key={todayItemId(item)}>
                {index > 0 && <ItemSeparator className="my-0" />}
                <TodayItem item={item} />
              </Fragment>
            ))}
          </ItemGroup>
          <ShowMoreButton pages={pages} label={t(`more.${section}`)} />
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
    <ScrollingSection title={t(`sections.${section}`)} count={count} defaultOpen={defaultOpen}>
      {body()}
    </ScrollingSection>
  );
}

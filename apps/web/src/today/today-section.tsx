"use client";

// One of Today's sections (spec 3.5): its heading with the day's count, then its things a page at a time (20, R35)
// with Show more, as a divided list; its own skeleton and its own error with Try again, so one section failing leaves
// the others working.
import type { TodaySectionName } from "@travel-crm/contracts/today";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { formatCount } from "@/lib/format";
import { TodayItem, todayItemId } from "./today-item";
import { useTodaySection } from "./use-today";

export function TodaySection({ section, count }: { section: TodaySectionName; count: number }) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const headingId = useId();
  const pages = useTodaySection(section);

  const body = () => {
    if (pages.items) {
      return (
        <>
          <ItemGroup>
            {pages.items.map((item, index) => (
              <Fragment key={todayItemId(item)}>
                {index > 0 && <ItemSeparator />}
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
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-section font-semibold">
          {t(`sections.${section}`)}
        </h2>
        <span className="numbers text-label text-muted-foreground">{formatCount(count)}</span>
      </div>
      {body()}
    </section>
  );
}

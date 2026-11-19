"use client";

// "Departures leaving soon" (spec 5): the departures Today shows, with their seats sold. Left out when none leave soon.
import { Fragment } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { departureRoute, routes } from "@/lib/routes";
import { useTodaySection } from "@/today/use-today";
import { HomeCard, rowClasses } from "./home-card";

/** Home shows the next five; Departures lists the rest. */
const ROWS_SHOWN = 5;

export function DeparturesCard() {
  const t = useTranslations("home.departures");
  const section = useTodaySection("departures");
  if (section.isError) {
    return <LoadFailedAlert message={t("loadFailed")} error={section.error} onRetry={() => void section.refetch()} />;
  }
  const departures = (section.items ?? [])
    .flatMap((item) => (item.kind === "departure" ? [item] : []))
    .slice(0, ROWS_SHOWN);
  if (departures.length === 0) return null;
  return (
    <HomeCard title={t("title")} tint="good" viewAll={routes.departures}>
      <ItemGroup className={rowClasses.group}>
        {departures.map((departure, index) => (
          <Fragment key={departure.departureId}>
            {index > 0 && <ItemSeparator className={rowClasses.separator} />}
            <div role="listitem">
              <Item size="sm" asChild className={rowClasses.item}>
                <Link href={departureRoute(departure.departureId)}>
                  <ItemContent className={rowClasses.content}>
                    <ItemTitle className="script-leading shrink-0">{departure.title}</ItemTitle>
                    <ItemDescription className={rowClasses.about}>
                      {formatCalendarDay(departure.startDate)}
                      {" · "}
                      {t("seats", { sold: departure.sold, total: departure.seatsTotal })}
                    </ItemDescription>
                  </ItemContent>
                </Link>
              </Item>
            </div>
          </Fragment>
        ))}
      </ItemGroup>
    </HomeCard>
  );
}

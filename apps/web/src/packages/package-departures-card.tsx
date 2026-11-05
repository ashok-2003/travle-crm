"use client";

// A group package's next departures (group packages): the batches linked to it, each with its first day, its name and the
// seats left, and a link to it. A departure is added on the Departures page.
import { useTranslations } from "next-intl";
import { SectionCard } from "@/bookings/section-card";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useDepartureList } from "@/departures/use-departures";
import { formatCalendarDay } from "@/lib/format";
import { departureRoute, routes } from "@/lib/routes";

const SHOWN = 5;

export function PackageDeparturesCard({ packageId }: { packageId: string }) {
  const t = useTranslations("packages.packageDepartures");
  const list = useDepartureList("upcoming", true, packageId);
  return (
    <SectionCard title={t("title")}>
      <p className="text-muted-foreground">{t("intro")}</p>
      {list.data === undefined ? (
        list.isError ? (
          <LoadFailedAlert message={t("loadFailed")} error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )
      ) : list.data.length === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <Table>
          <TableBody>
            {list.data.slice(0, SHOWN).map((departure) => (
              <TableRow key={departure.id}>
                <TableCell>
                  <TextLink inline href={departureRoute(departure.id)}>
                    {departure.title}
                  </TextLink>
                  <p className="text-caption text-muted-foreground">{formatCalendarDay(departure.startDate)}</p>
                </TableCell>
                <TableCell className="numbers text-right">
                  {departure.free === 0
                    ? t("full")
                    : t("seatsLeft", { free: departure.free, total: departure.seatsTotal })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div>
        <TextLink href={routes.departures}>{t("all")}</TextLink>
      </div>
    </SectionCard>
  );
}

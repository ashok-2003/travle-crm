"use client";

// A group package's next departures (group packages): the batches linked to it, each with its first day, its name and the
// seats left, and a link to it. A departure of the package is added here (the form starts from the package) by whoever may
// create departures; the weekly days make the rest.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/bookings/section-card";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { DepartureFormDialog } from "@/departures/departure-form-dialog";
import { useDepartureList } from "@/departures/use-departures";
import { formatCalendarDay } from "@/lib/format";
import { departureRoute, routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";

const SHOWN = 5;

export function PackageDeparturesCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.packageDepartures");
  const mayCreate = useHolds("departures:create");
  const list = useDepartureList("upcoming", true, detail.id);
  return (
    <SectionCard title={t("title")} anchor="departures">
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
      <div className="flex flex-wrap items-center gap-4">
        {mayCreate && (
          <DepartureFormDialog
            departure={null}
            forPackage={{
              id: detail.id,
              name: detail.name,
              destination:
                detail.destinationId === null ? null : { id: detail.destinationId, name: detail.destinationName ?? "" },
              nights: detail.nights,
              seatsPerDeparture: detail.seatsPerDeparture,
            }}
            trigger={{ label: t("add") }}
          />
        )}
        <TextLink href={routes.departures}>{t("all")}</TextLink>
      </div>
    </SectionCard>
  );
}

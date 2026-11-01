"use client";

// /departures (release 7a): the batches by date, with chips for Upcoming, Past and Cancelled. Each row shows its days, its
// name, how many seats are sold and held of the total, and its state in words. Adding one needs departures:create.
import type { DepartureFilter, DepartureSummary } from "@travel-crm/contracts/departures";
import { BusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCalendarDay } from "@/lib/format";
import { departureRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { DepartureFormDialog } from "./departure-form-dialog";
import { DepartureStateBadge } from "./departure-state";
import { useDepartureList } from "./use-departures";

const filters: readonly DepartureFilter[] = ["upcoming", "past", "cancelled"];

function DepartureRow({ departure }: { departure: DepartureSummary }) {
  const t = useTranslations("departures.list");
  return (
    <TableRow>
      <TableCell>
        <TextLink inline href={departureRoute(departure.id)}>
          {departure.title}
        </TextLink>
        <p className="text-caption text-muted-foreground">
          {t("dates", { from: formatCalendarDay(departure.startDate), to: formatCalendarDay(departure.endDate) })}
          {departure.destinationName === null ? "" : ` · ${departure.destinationName}`}
        </p>
      </TableCell>
      <TableCell className="numbers">
        {t("seats", { used: departure.sold + departure.held, total: departure.seatsTotal })}
        <p className="text-caption font-normal text-muted-foreground">
          {t("seatsHeld", { sold: departure.sold, held: departure.held })}
        </p>
      </TableCell>
      <TableCell>
        <DepartureStateBadge state={departure.state} />
      </TableCell>
    </TableRow>
  );
}

export function DeparturesScreen() {
  const t = useTranslations("departures.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const mayCreate = useHolds("departures:create");
  const [filter, setFilter] = useState<DepartureFilter>("upcoming");
  const list = useDepartureList(filter);
  const body = () => {
    if (list.data === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={3} label={t("loading")} />
      );
    }
    if (list.data.length === 0) {
      return <EmptyState icon={BusIcon} message={t(filter === "upcoming" ? "empty" : "noneHere")} />;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.departure")}</TableHead>
            <TableHead>{t("columns.seats")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data.map((departure) => (
            <DepartureRow key={departure.id} departure={departure} />
          ))}
        </TableBody>
      </Table>
    );
  };
  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        action={
          mayCreate && (
            <DepartureFormDialog
              departure={null}
              trigger={{ label: t("new"), variant: "default" }}
              onSaved={(id) => {
                router.push(departureRoute(id));
              }}
            />
          )
        }
      />
      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={(value) => {
          if (value !== "") setFilter(value as DepartureFilter);
        }}
        aria-label={t("filterLabel")}
        className="flex-wrap"
      >
        {filters.map((one) => (
          <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
            {t(`filters.${one}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {body()}
    </div>
  );
}

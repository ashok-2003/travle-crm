"use client";

// /departures/<id> (release 7a): one batch. Its days, price and state first with the seats sold, held and free in a line,
// what needs attention (overbooked, cancelled), then Seats (the bookings, the holds, the waitlist), Rooming (hotels, rooms,
// who sleeps where) and Costs (for whoever keeps the accounts) as tabs.
import { SearchXIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { rupees } from "@/components/forms/money-field";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { refusalOf } from "@/data/api-error";
import { formatCalendarDay } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";
import { CancelDepartureDialog } from "./cancel-departure-dialog";
import { CostsTab } from "./costs-tab";
import { DepartureFormDialog } from "./departure-form-dialog";
import { DepartureStateBadge } from "./departure-state";
import { RoomingTab } from "./rooming-tab";
import { SeatsTab } from "./seats-tab";
import { useDeparture, useDepartureChanges } from "./use-departures";

function SeatStrip({ sold, held, free, total }: { sold: number; held: number; free: number; total: number }) {
  const t = useTranslations("departures.page");
  const figure = (label: string, value: number, className?: string) => (
    <div className="flex flex-col">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn("numbers text-section font-semibold", className)}>{value}</dd>
    </div>
  );
  return (
    <dl className="grid max-w-md grid-cols-4 gap-3">
      {figure(t("total"), total)}
      {figure(t("sold"), sold)}
      {figure(t("held"), held)}
      {figure(t("free"), free)}
    </dl>
  );
}

export function DepartureScreen({ departureId }: { departureId: string }) {
  const t = useTranslations("departures.page");
  const tCommon = useTranslations("common");
  const departure = useDeparture(departureId);
  const mayEdit = useHolds("departures:edit");
  const seesAccounts = useHolds("accounts:view");
  const modules = useSubscription().data?.modules;
  const showCosts = seesAccounts && isOnPlan({ module: "accounts" }, modules);
  const changes = useDepartureChanges();
  const body = (): ReactNode => {
    if (departure.data) {
      const data = departure.data;
      const cancelled = data.status === "cancelled";
      return (
        <>
          <BackLink href={routes.departures} label={t("backToDepartures")} />
          <PageHeader
            title={data.title}
            intro={
              <>
                {t("intro", { from: formatCalendarDay(data.startDate), to: formatCalendarDay(data.endDate) })}
                {data.destinationName === null ? "" : ` · ${data.destinationName}`}
                {data.pricePaise === null ? "" : ` · ${t("pricePerPerson", { price: rupees(data.pricePaise) })}`}{" "}
                <DepartureStateBadge state={data.state} />
              </>
            }
            action={
              mayEdit &&
              !cancelled && (
                <div className="flex flex-wrap gap-2">
                  <DepartureFormDialog departure={data} trigger={{ label: t("edit") }} />
                  <Button
                    variant="outline"
                    disabled={changes.setStatus.isPending}
                    onClick={() => {
                      changes.setStatus.mutate({
                        departureId: data.id,
                        status: data.status === "closed" ? "open" : "closed",
                      });
                    }}
                  >
                    {data.status === "closed" ? t("reopen") : t("close")}
                  </Button>
                  <CancelDepartureDialog departureId={data.id} />
                </div>
              )
            }
          />
          <RefusalAlert error={changes.setStatus.error} />
          <SeatStrip sold={data.sold} held={data.held} free={data.free} total={data.seatsTotal} />
          {data.overbookedBy > 0 && (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertDescription>{t("overbooked", { count: data.overbookedBy })}</AlertDescription>
            </Alert>
          )}
          {cancelled && (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertDescription>
                {t("cancelledBanner", { reason: data.cancelledReason ?? "" })}
                {data.bookings.length > 0 && ` ${t("cancelledBookings", { count: data.bookings.length })}`}
              </AlertDescription>
            </Alert>
          )}
          <Tabs defaultValue="seats">
            <TabsList aria-label={t("tabs.label")}>
              <TabsTrigger value="seats">{t("tabs.seats")}</TabsTrigger>
              <TabsTrigger value="rooming">{t("tabs.rooming")}</TabsTrigger>
              {showCosts && <TabsTrigger value="costs">{t("tabs.costs")}</TabsTrigger>}
            </TabsList>
            <TabsContent value="seats" className="pt-4">
              <SeatsTab departure={data} />
            </TabsContent>
            <TabsContent value="rooming" className="pt-4">
              <RoomingTab departure={data} />
            </TabsContent>
            {showCosts && (
              <TabsContent value="costs" className="pt-4">
                <CostsTab departureId={data.id} />
              </TabsContent>
            )}
          </Tabs>
        </>
      );
    }
    if (refusalOf(departure.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (departure.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={departure.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void departure.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  };
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      {departure.data === undefined && <BackLink href={routes.departures} label={t("backToDepartures")} />}
      {body()}
    </div>
  );
}

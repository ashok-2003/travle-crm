"use client";

// What a tapped day of the price calendar offers: add a departure on a day with none, open or cancel one, reopen a
// cancelled one. Days that are not ahead (today and before) offer nothing: the api refuses changes to them. Each change
// shows only to whoever holds its call's permission (adding: departures:create; cancelling and reopening:
// departures:edit), and the way to a departure to whoever may see departures.
import type { DepartureSummary } from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { CancelDepartureDialog } from "@/departures/cancel-departure-dialog";
import { useDepartureChanges } from "@/departures/use-departures";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { departureRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function CalendarDayActions({
  packageId,
  day,
  departure,
  ahead,
}: {
  packageId: string;
  day: string;
  /** The departure that starts on this day, if any. */
  departure: DepartureSummary | null;
  ahead: boolean;
}) {
  const t = useTranslations("packages.calendar");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const describedBy = access.allowed ? undefined : hintId;
  const mayAdd = useHolds("departures:create");
  const mayChange = useHolds("departures:edit");
  const mayView = useHolds("departures:view");
  const { addPackageDates, reopen } = useDepartureChanges();
  if (!ahead) return null;
  const sending = addPackageDates.isPending || reopen.isPending;
  return (
    <div className="flex flex-col items-start gap-2">
      {departure === null && mayAdd && (
        <Button
          disabled={!access.allowed || sending}
          aria-describedby={describedBy}
          onClick={() => {
            addPackageDates.mutate(
              { packageId, from: day, to: day, weekdays: [] },
              {
                // The calendar can miss a day's departure (it lists a limited number), so say what really happened.
                onSuccess: (result) => {
                  if (result.added.length > 0) toast.success(t("added"));
                  else toast.info(t(result.cancelled.length > 0 ? "cancelledThere" : "alreadyThere"));
                },
              },
            );
          }}
        >
          {t("addDeparture")}
        </Button>
      )}
      {departure !== null && departure.status !== "cancelled" && (
        <>
          {mayView && <TextLink href={departureRoute(departure.id)}>{t("viewDeparture")}</TextLink>}
          {mayChange && <CancelDepartureDialog departureId={departure.id} />}
        </>
      )}
      {departure?.status === "cancelled" && mayChange && (
        <Button
          disabled={!access.allowed || sending}
          aria-describedby={describedBy}
          onClick={() => {
            reopen.mutate(
              { departureId: departure.id },
              {
                onSuccess: () => {
                  toast.success(t("reopened"));
                },
              },
            );
          }}
        >
          {t("reopen")}
        </Button>
      )}
      <WriteHint id={hintId} hint={access.hint} />
      <RefusalAlert error={addPackageDates.error ?? reopen.error} />
    </div>
  );
}

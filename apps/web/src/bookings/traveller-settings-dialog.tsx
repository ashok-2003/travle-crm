"use client";

// What each traveller fills in and how many travellers there are: settings of the booking, not its work, so they sit behind the
// Travellers card's "⋯" menu. Each change is sent as it is made.
import { travellerLevels, type BookingDetail, type TravellerLevel } from "@travel-crm/contracts/bookings";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { OpenState } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWriteAccess } from "@/subscription/write-access";
import { useBookingChanges } from "./use-bookings";

export function TravellerSettingsDialog({
  booking,
  held,
  returnFocusTo,
}: {
  booking: BookingDetail;
  held: OpenState;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("bookings.travellers");
  const tCommon = useTranslations("common");
  const access = useWriteAccess("change");
  const { setLevel, setTravellerCount } = useBookingChanges();
  const count = booking.travellers.length;
  const busy = setLevel.isPending || setTravellerCount.isPending;
  const off = busy || !access.allowed;
  return (
    <ResponsiveDialog
      open={held.open}
      onOpenChange={held.setOpen}
      busy={busy}
      title={t("settings")}
      description={t("settingsDescription")}
      returnFocusTo={returnFocusTo}
      cancel={false}
      footer={
        <Button
          disabled={busy}
          onClick={() => {
            held.setOpen(false);
          }}
        >
          {tCommon("close")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="traveller-level">{t("level")}</FieldLabel>
          <Select
            value={booking.level}
            disabled={off}
            onValueChange={(level) => {
              setLevel.mutate({ bookingId: booking.id, level: level as TravellerLevel });
            }}
          >
            <SelectTrigger id="traveller-level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {travellerLevels.map((one) => (
                <SelectItem key={one} value={one}>
                  {t(`levels.${one}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center gap-2" role="group" aria-label={t("count")}>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("fewer")}
            disabled={off || count <= 1}
            onClick={() => {
              setTravellerCount.mutate({ bookingId: booking.id, count: count - 1 });
            }}
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <span className="numbers min-w-8 text-center" aria-live="polite">
            {count}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("more")}
            disabled={off || count >= 500}
            onClick={() => {
              setTravellerCount.mutate({ bookingId: booking.id, count: count + 1 });
            }}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>
        <RefusalAlert error={setLevel.error ?? setTravellerCount.error} />
      </div>
    </ResponsiveDialog>
  );
}

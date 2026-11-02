"use client";

// A booking's travellers (release 6): "3 of 4 complete", what each fills in (Basic, Detailed, International), how many there
// are, and each traveller with a way to fill or fix their row. Travellers fill their own rows from the trip page until the
// cut-off; staff may at any time. An ID number is never shown here: a traveller with one on file says so.
import { travellerLevels, type BookingDetail, type TravellerLevel } from "@travel-crm/contracts/bookings";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./section-card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCalendarDay } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { TravellerDialog } from "./traveller-dialog";
import { useBookingChanges } from "./use-bookings";

export function TravellersCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.travellers");
  const mayEdit = useHolds("bookings:edit") && booking.status !== "cancelled";
  const access = useWriteAccess("change");
  const { setLevel, setTravellerCount } = useBookingChanges();
  const count = booking.travellers.length;
  const busy = setLevel.isPending || setTravellerCount.isPending || !access.allowed;
  return (
    <SectionCard title={t("heading")}>
      <p>
        <span className="numbers font-semibold">
          {t("progress", { done: booking.travellersComplete, total: booking.travellersTotal })}
        </span>
        {booking.detailsCutoffOn !== null && (
          <span className="text-muted-foreground">
            {" "}
            · {t("cutoff", { day: formatCalendarDay(booking.detailsCutoffOn) })}
          </span>
        )}
      </p>
      {mayEdit && (
        <div className="flex flex-wrap items-end gap-4">
          <Field className="max-w-64">
            <FieldLabel htmlFor="traveller-level">{t("level")}</FieldLabel>
            <Select
              value={booking.level}
              disabled={busy}
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
              disabled={busy || count <= 1}
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
              disabled={busy || count >= 500}
              onClick={() => {
                setTravellerCount.mutate({ bookingId: booking.id, count: count + 1 });
              }}
            >
              <PlusIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
      <RefusalAlert error={setLevel.error ?? setTravellerCount.error} />
      {count === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <ItemGroup>
          {booking.travellers.map((traveller, index) => (
            <Item key={traveller.id} size="sm" role="listitem">
              <ItemContent>
                <ItemTitle>{traveller.name === "" ? t("unnamed", { number: index + 1 }) : traveller.name}</ItemTitle>
                <ItemDescription>
                  {traveller.complete ? t("complete") : t("missing")}
                  {traveller.hasIdentity ? ` · ${t("idOnFile")}` : ""}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <StatusBadge tone={traveller.complete ? "good" : "attention"}>
                  {traveller.complete ? t("badge.complete") : t("badge.missing")}
                </StatusBadge>
                {mayEdit && (
                  <TravellerDialog
                    traveller={traveller}
                    level={booking.level}
                    number={index + 1}
                    onDeparture={booking.departure !== null}
                  />
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </SectionCard>
  );
}

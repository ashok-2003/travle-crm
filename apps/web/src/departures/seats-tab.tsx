"use client";

// A departure's Seats tab (release 7a): the bookings on it (with "3 of 4 details" and a link to each), the seats held for
// leads (with Make quote and Release, and the time they end, red when it is near), and the waitlist. A hold taken with
// departures:create (the Sales role); Make quote needs quotes:create.
import type { DepartureDetail, DepartureHold, WaitlistEntry } from "@travel-crm/contracts/departures";
import { HOLD_ENDING_SOON_HOURS } from "@travel-crm/contracts/departures";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { bookingRoute, leadRoute, quoteRoute } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { useHolds, useMe } from "@/session/me-context";
import { SectionCard } from "@/bookings/section-card";
import { HoldDialog } from "./hold-dialog";
import { useDepartureChanges } from "./use-departures";
import { WaitlistDialog } from "./waitlist-dialog";

function HoldRow({
  hold,
  onRelease,
  mayHold,
  mayQuote,
}: {
  hold: DepartureHold;
  onRelease: () => void;
  mayHold: boolean;
  mayQuote: boolean;
}) {
  const t = useTranslations("departures.seats.holds");
  const { timeZone } = useMe().organization;
  const changes = useDepartureChanges();
  const router = useRouter();
  const now = useNow();
  const ends = new Date(hold.expiresAt);
  const soon = ends.getTime() - now.getTime() <= HOLD_ENDING_SOON_HOURS * 60 * 60 * 1000;
  const when = formatDayTime(ends, { timeZone, now });
  return (
    <Item size="sm" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle>
          <TextLink inline href={leadRoute(hold.leadId)}>
            {hold.customerName}
          </TextLink>
        </ItemTitle>
        <ItemDescription>
          {[t("seats", { count: hold.seats }), hold.note].filter((part) => part !== "").join(" · ")}{" "}
          {soon ? <StatusBadge tone="bad">{t("endingSoon", { time: when })}</StatusBadge> : t("until", { time: when })}
        </ItemDescription>
      </ItemContent>
      {mayHold && (
        <ItemActions>
          {mayQuote && (
            <Button
              variant="outline"
              aria-label={t("makeQuoteFor", { name: hold.customerName })}
              disabled={changes.makeQuote.isPending}
              onClick={() => {
                changes.makeQuote.mutate(
                  { holdId: hold.id },
                  {
                    onSuccess: ({ quoteId }) => {
                      toast.success(t("quoteMade"));
                      router.push(quoteRoute(quoteId));
                    },
                  },
                );
              }}
            >
              {t("makeQuote")}
            </Button>
          )}
          <Button variant="ghost" aria-label={t("releaseFor", { name: hold.customerName })} onClick={onRelease}>
            {t("release")}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

function WaitlistRow({ entry, mayHold }: { entry: WaitlistEntry; mayHold: boolean }) {
  const t = useTranslations("departures.seats.waitlist");
  const tHolds = useTranslations("departures.seats.holds");
  const changes = useDepartureChanges();
  return (
    <Item size="sm" className="items-start">
      <ItemContent>
        <ItemTitle>
          <TextLink inline href={leadRoute(entry.leadId)}>
            {entry.customerName}
          </TextLink>
        </ItemTitle>
        <ItemDescription>{tHolds("seats", { count: entry.seats })}</ItemDescription>
      </ItemContent>
      {mayHold && (
        <ItemActions>
          <Button
            variant="ghost"
            aria-label={t("removeNamed", { name: entry.customerName })}
            disabled={changes.removeFromWaitlist.isPending}
            onClick={() => {
              changes.removeFromWaitlist.mutate(
                { waitlistId: entry.id },
                { onSuccess: () => toast.success(t("removed")) },
              );
            }}
          >
            {t("remove")}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

export function SeatsTab({ departure }: { departure: DepartureDetail }) {
  const t = useTranslations("departures.seats");
  const mayHold = useHolds("departures:create");
  const mayQuote = useHolds("quotes:create");
  const changes = useDepartureChanges();
  const [releasing, setReleasing] = useState<string | null>(null);
  const open = departure.status === "open";
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title={t("bookings.title")}>
        {departure.bookings.length === 0 ? (
          <p className="text-muted-foreground">{t("bookings.none")}</p>
        ) : (
          <ItemGroup>
            {departure.bookings.map((booking) => (
              <Item key={booking.bookingId} size="sm" className="items-start">
                <ItemContent className="min-w-0">
                  <ItemTitle>
                    <TextLink inline href={bookingRoute(booking.bookingId)}>
                      {booking.customerName}
                    </TextLink>
                  </ItemTitle>
                  <ItemDescription>
                    <span className="numbers">{booking.number}</span> · {t("bookings.heads", { count: booking.heads })}{" "}
                    · {t("bookings.details", { done: booking.travellersComplete, total: booking.heads })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <StatusBadge tone={booking.status === "confirmed" ? "good" : "attention"}>
                    {t(`bookings.status.${booking.status}`)}
                  </StatusBadge>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </SectionCard>
      <SectionCard title={t("holds.title")}>
        <RefusalAlert error={changes.makeQuote.error ?? changes.releaseHold.error} />
        {departure.holds.length === 0 ? (
          <p className="text-muted-foreground">{t("holds.none")}</p>
        ) : (
          <ItemGroup>
            {departure.holds.map((hold) => (
              <HoldRow
                key={hold.id}
                hold={hold}
                mayHold={mayHold}
                mayQuote={mayQuote}
                onRelease={() => {
                  setReleasing(hold.id);
                }}
              />
            ))}
          </ItemGroup>
        )}
        {mayHold && open && (
          <div>
            <HoldDialog departure={departure} />
          </div>
        )}
      </SectionCard>
      <SectionCard title={t("waitlist.title")}>
        {departure.waitlist.length === 0 ? (
          <p className="text-muted-foreground">{t("waitlist.none")}</p>
        ) : (
          <ItemGroup>
            {departure.waitlist.map((entry) => (
              <WaitlistRow key={entry.id} entry={entry} mayHold={mayHold} />
            ))}
          </ItemGroup>
        )}
        {mayHold && open && (
          <div>
            <WaitlistDialog departure={departure} />
          </div>
        )}
      </SectionCard>
      <ConfirmDialog
        open={releasing !== null}
        onOpenChange={(next) => {
          if (!next) setReleasing(null);
        }}
        title={t("holds.releaseTitle")}
        description={t("holds.releaseDescription")}
        action={t("holds.release")}
        request={changes.releaseHold}
        onConfirm={() => {
          if (releasing === null) return;
          changes.releaseHold.mutate(
            { holdId: releasing },
            {
              onSuccess: () => {
                toast.success(t("holds.released"));
                setReleasing(null);
              },
            },
          );
        }}
      />
    </div>
  );
}

"use client";

// A booking's reminders (release 6): the three messages the traveller is due (the balance before each payment, their details
// and the packing list, where to report), each sent, left to do by hand, skipped or still to come; whether the traveller agreed
// to trip updates on WhatsApp (without it, or without a template, a reminder becomes a task for the lead's owner); and a way to
// pause them. A booking carried over from before bookings kept its payment reminders in Sales automation.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatDay } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useBookingChanges } from "./use-bookings";

const tones: Record<BookingDetail["reminders"][number]["status"], StatusTone> = {
  scheduled: "neutral",
  sent: "good",
  by_hand: "attention",
  skipped: "neutral",
};

export function RemindersCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.reminders");
  const { timeZone } = useMe().organization;
  const mayEdit = useHolds("bookings:edit") && booking.status !== "cancelled";
  const access = useWriteAccess("change");
  const { pauseReminders, recordTripUpdates } = useBookingChanges();
  const live = booking.status === "confirmed";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!booking.sendsReminders && <p className="text-muted-foreground">{t("carriedOver")}</p>}
        <p className="text-muted-foreground">{booking.tripUpdatesAgreed ? t("agreed") : t("notAgreed")}</p>
        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            {!booking.tripUpdatesAgreed && (
              <Button
                variant="outline"
                disabled={recordTripUpdates.isPending || !access.allowed}
                onClick={() => {
                  recordTripUpdates.mutate({ bookingId: booking.id });
                }}
              >
                {t("recordAgreed")}
              </Button>
            )}
            {live && booking.sendsReminders && (
              <Button
                variant="outline"
                disabled={pauseReminders.isPending || !access.allowed}
                onClick={() => {
                  pauseReminders.mutate({ bookingId: booking.id, paused: !booking.remindersPaused });
                }}
              >
                {booking.remindersPaused ? t("resume") : t("pause")}
              </Button>
            )}
          </div>
        )}
        {booking.remindersPaused && <p className="font-semibold">{t("paused")}</p>}
        <RefusalAlert error={pauseReminders.error ?? recordTripUpdates.error} />
        {booking.reminders.length === 0 ? (
          <p className="text-muted-foreground">{live ? t("none") : t("afterConfirm")}</p>
        ) : (
          <ItemGroup>
            {booking.reminders.map((reminder) => (
              <Item key={reminder.id} size="sm" role="listitem">
                <ItemContent>
                  <ItemTitle>{t(`kinds.${reminder.kind}`)}</ItemTitle>
                  <ItemDescription>
                    {reminder.sentAt === null
                      ? t("on", { day: formatDay(new Date(reminder.sendAt), { timeZone }) })
                      : t("sentOn", { day: formatDay(new Date(reminder.sentAt), { timeZone }) })}
                    {reminder.note === null ? "" : ` · ${t(`notes.${reminder.note as "paid"}`)}`}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <StatusBadge tone={tones[reminder.status]}>{t(`status.${reminder.status}`)}</StatusBadge>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

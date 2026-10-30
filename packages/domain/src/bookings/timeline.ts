// A booking's steps on its lead's timeline (release 6): one slim entry per step, pointing at the booking.
import type { BookingEvent } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { recordLeadEvent } from "../crm/index.js";
import type { Actor } from "../kernel/index.js";

export async function recordBookingEvent(
  tx: OrgTx,
  actor: Actor,
  entry: { leadId: string; bookingId: string; event: BookingEvent; occurredAt?: Date },
): Promise<void> {
  await recordLeadEvent(tx, actor, {
    leadId: entry.leadId,
    kind: "booking-event",
    record: { recordType: "booking", recordId: entry.bookingId },
    bookingEvent: entry.event,
    ...(entry.occurredAt === undefined ? {} : { occurredAt: entry.occurredAt }),
  });
}

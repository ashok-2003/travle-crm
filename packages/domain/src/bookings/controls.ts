// Small staff controls on a booking: pausing its reminders (and resuming them), and recording that the traveller agreed to
// trip updates on WhatsApp when staff made the booking (a traveller who accepted on the link gave it there).
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { tripUpdatesAgreed } from "./reminders.js";
import { assertOpen, findBookingForChange } from "./rows.js";

const STAFF_WORDING = "Agreed to trip updates on WhatsApp; recorded by staff.";

export async function setRemindersPaused(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string; paused: boolean },
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertOpen(booking);
  if ((booking.remindersPausedAt !== null) === input.paused) return;
  await tx.booking.update({ where: { id: booking.id }, data: { remindersPausedAt: input.paused ? now : null } });
  const about = { entityType: "booking", entityId: booking.id };
  if (input.paused) await recordAudit(tx, access, { action: "booking.reminders-paused", ...about });
  else await recordAudit(tx, access, { action: "booking.reminders-resumed", ...about });
}

export async function recordTripUpdatesConsentByStaff(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string },
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  if (await tripUpdatesAgreed(tx, booking.lead.personId)) return;
  await tx.personConsent.create({
    data: {
      personId: booking.lead.personId,
      purpose: "trip_updates",
      action: "granted",
      wording: STAFF_WORDING,
      wordingVersion: 1,
      source: "staff",
      recordedAt: now,
      recordedBy: access.userId,
    },
  });
  await recordAudit(tx, access, {
    action: "booking.trip-updates-agreed",
    entityType: "booking",
    entityId: booking.id,
    after: { purpose: "trip_updates", source: "staff" },
  });
}

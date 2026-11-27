// A booking's own travel date (bookings revamp): staff set or change it. The end date moves by the trip's length, the details
// cut-off and the default balance day follow because they are read from the start, the unsent reminders are made again
// (sent ones stay sent), and the payments due stay as they are (staff change them with "Change payments due").
import type { SetTravelDateInput } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { lastDayOf } from "./create-booking.js";
import { rebuildReminders } from "./reminders.js";
import { assertOpen, asDate, dayOf, findBookingForChange } from "./rows.js";

export async function setTravelDate(
  tx: OrgTx,
  access: MemberAccess,
  input: SetTravelDateInput,
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertOpen(booking);
  // A completed booking stays completed (nothing reopens it), so a new date would leave a finished booking with a future trip.
  if (booking.status === "completed") {
    throw new DomainError("CONFLICT", "BOOKING_NOT_OPEN", "A completed booking's travel date can't change");
  }
  // A booking on a departure follows it: change the departure instead.
  if (booking.departureId !== null) {
    throw new DomainError("CONFLICT", "BOOKING_ON_DEPARTURE", "This booking follows its departure's date");
  }
  const before = {
    startDate: booking.startDate === null ? null : dayOf(booking.startDate),
    endDate: booking.endDate === null ? null : dayOf(booking.endDate),
  };
  if (before.startDate === input.startDate) return;
  const endDate = lastDayOf(asDate(input.startDate), booking.quote.days);
  await tx.booking.update({
    where: { id: booking.id },
    data: { startDate: asDate(input.startDate), endDate: endDate === null ? null : asDate(endDate) },
  });
  // A requested booking has no reminders yet: confirming makes them from this date.
  if (booking.status === "confirmed") await rebuildReminders(tx, booking.id, now);
  await recordAudit(tx, access, {
    action: "booking.travel-date-changed",
    entityType: "booking",
    entityId: booking.id,
    before,
    after: { startDate: input.startDate, endDate },
  });
}

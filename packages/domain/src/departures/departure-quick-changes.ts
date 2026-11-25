// Two narrow changes to a departure, for the trip page's calendar: its seats on their own, and its own prices on their own.
import type { SetDeparturePricesInput, SetDepartureSeatsInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { auditColumns, auditView } from "./departure-changes.js";
import { findDepartureForChange, priceColumnsOf, seatsSoldAndHeld } from "./rows.js";
import { announceSeatsFreed } from "./waitlist.js";

/** The seats, never below the heads already sold or held (a lower number would overbook it by hand). */
export async function setDepartureSeats(
  tx: OrgTx,
  access: MemberAccess,
  input: SetDepartureSeatsInput,
  now: Date = new Date(),
): Promise<void> {
  const before = await findDepartureForChange(tx, input.departureId);
  const found = (await seatsSoldAndHeld(tx, [before.id], now)).get(before.id) ?? { sold: 0, held: 0 };
  if (input.seatsTotal < found.sold + found.held) {
    throw new DomainError("CONFLICT", "SEATS_BELOW_BOOKED", "There are more seats sold or held than this number");
  }
  const after = await tx.departure.update({
    where: { id: before.id },
    data: { seatsTotal: input.seatsTotal },
    select: auditColumns,
  });
  await recordAudit(tx, access, {
    action: "departure.changed",
    entityType: "departure",
    entityId: before.id,
    before: auditView(before),
    after: auditView(after),
  });
  if (after.seatsTotal > before.seatsTotal) await announceSeatsFreed(tx, before.id);
}

/** The departure's own prices; all null clears them, so the season's apply again. */
export async function setDeparturePrices(
  tx: OrgTx,
  access: MemberAccess,
  input: SetDeparturePricesInput,
): Promise<void> {
  const before = await findDepartureForChange(tx, input.departureId);
  const own = priceColumnsOf(input.prices);
  const after = await tx.departure.update({
    where: { id: before.id },
    // As a full change does: a linked departure shows its own lowest adult price or none.
    data: { ...own.columns, pricePaise: before.templateId !== null ? own.lowest : (own.lowest ?? before.pricePaise) },
    select: auditColumns,
  });
  await recordAudit(tx, access, {
    action: "departure.changed",
    entityType: "departure",
    entityId: before.id,
    before: auditView(before),
    after: auditView(after),
  });
}

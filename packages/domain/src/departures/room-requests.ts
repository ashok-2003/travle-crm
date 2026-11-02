// Room requests set together (release ai3): staff ticked what the AI read from a traveller's notes, or chose by hand. Each
// is the traveller's `room_request`, the same field the trip page and the traveller's dialog set; the rooming list then
// drafts its rooms exactly as before. A traveller no longer on the departure is refused, and every change is audited.
import type { SetRoomRequestsInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { rosterOf } from "./rooming-rows.js";
import { findDepartureForChange } from "./rows.js";

/** Sets the requests; returns the travellers whose request actually changed. */
export async function setRoomRequests(
  tx: OrgTx,
  access: MemberAccess,
  input: Pick<SetRoomRequestsInput, "departureId" | "changes">,
  now: Date,
): Promise<{ changed: number }> {
  const departure = await findDepartureForChange(tx, input.departureId);
  const roster = new Map((await rosterOf(tx, departure.id)).map((traveller) => [traveller.id, traveller]));
  const wanted = new Map(input.changes.map((change) => [change.travellerId, change.roomRequest]));
  const different = [...wanted].filter(([travellerId, request]) => {
    const traveller = roster.get(travellerId);
    if (traveller === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such traveller");
    return traveller.roomRequest !== request;
  });
  for (const [travellerId, roomRequest] of different) {
    await tx.bookingTraveller.update({ where: { id: travellerId }, data: { roomRequest, updatedAt: now } });
  }
  if (different.length > 0) {
    await recordAudit(tx, access, {
      action: "departure.room-requests-set",
      entityType: "departure",
      entityId: departure.id,
      after: { travellers: different.map(([travellerId, roomRequest]) => ({ travellerId, roomRequest })) },
    });
  }
  return { changed: different.length };
}

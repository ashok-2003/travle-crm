// The booking a checked reply asks for, from the grounded turn's lookup: the package, departure, rooms and total the
// customer was told, taken by the agents' shared booking (quote, hold, AI booking). Any refusal throws so the turn rolls
// back and nothing is sent.
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../../kernel/index.js";
import { takeAgentBooking } from "../agent-booking.js";
import type { ActDeps, ActInput } from "./act-types.js";
import { bookingPackage } from "./actions.js";
import { roomsFor } from "./rooms.js";

const refuse = (message: string) => new DomainError("CONFLICT", "AI_ACTION_REFUSED", message);

/** Makes the quote, holds the seats and takes the booking. Returns the AI booking's id. */
export async function takeGroundedBooking(
  tx: OrgTx,
  deps: ActDeps,
  input: ActInput,
  leadId: string | null,
): Promise<string> {
  const one = bookingPackage(input.lookup);
  const departure = one?.chosenDeparture ?? null;
  const travellers = input.lookup.travellers;
  if (leadId === null || one === null || departure === null || travellers === null || one.total === null) {
    throw refuse("A booking needs a lead, a priced departure and the travellers");
  }
  const booked = await takeAgentBooking(tx, deps, {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    token: input.token,
    leadId,
    pkg: { id: one.id, title: one.title },
    departure: { id: departure.id, startsOn: departure.startsOn },
    // The rooms the lookup totalled: the quote must come to the total the customer was told.
    rooms: roomsFor(input.facts, one.offered),
    travellers,
    toldTotalPaise: one.total,
    expectedPaise: BigInt(one.advancePerPersonPaise ?? 0) * BigInt(travellers),
    today: input.lookup.today,
    now: input.now,
  });
  return booked.bookingId;
}

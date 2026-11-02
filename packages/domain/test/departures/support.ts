// Setup for the departures tests: an agency with a salesperson, a manager and an operations person, departures, and bookings
// made from quotes put on them, as the listener makes them.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { createBookingFromQuote } from "../../src/bookings/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aQuote, openWorld, type World } from "../bookings/support.js";

export { openWorld, type World };

export const now = new Date("2026-10-29T06:30:00Z");

export interface DepartureSeed {
  title?: string;
  startDate?: string;
  endDate?: string;
  seatsTotal?: number;
  pricePaise?: bigint | null;
  status?: string;
}

export const aDeparture = (tx: OrgTx, seed: DepartureSeed = {}) =>
  tx.departure.create({
    data: {
      title: seed.title ?? "Kedarnath batch",
      startDate: new Date(`${seed.startDate ?? "2026-11-03"}T00:00:00Z`),
      endDate: new Date(`${seed.endDate ?? "2026-11-08"}T00:00:00Z`),
      seatsTotal: seed.seatsTotal ?? 20,
      pricePaise: seed.pricePaise ?? null,
      ...(seed.status === undefined ? {} : { status: seed.status }),
    },
    select: { id: true },
  });

/** An operations person: sees every booking and runs departures. */
export const operations = (world: World): MemberAccess =>
  memberWithStarterRole("operations", { organizationId: world.organizationId, userId: randomUUID() });

/** An accepted quote for `adults` heads put on the departure, and the booking made from it. */
export async function aBookingOn(
  world: World,
  departureId: string,
  seed: { adults?: number; children?: number; confirmed?: boolean; subtotalPaise?: number; leadId?: string } = {},
) {
  const { quote, lead } = await world.inOrg((tx) =>
    aQuote(tx, {
      ownerUserId: world.seller.userId,
      adults: seed.adults ?? 2,
      children: seed.children ?? 0,
      ...(seed.subtotalPaise === undefined ? {} : { totalPaise: seed.subtotalPaise }),
    }),
  );
  await world.inOrg((tx) =>
    tx.quote.update({
      where: { id: quote.id },
      data: { departureId, ...(seed.leadId === undefined ? {} : { leadId: seed.leadId }) },
    }),
  );
  const bookingId = await world.inOrg((tx) =>
    createBookingFromQuote(
      tx,
      { organizationId: world.organizationId, quoteId: quote.id, confirmed: seed.confirmed ?? false },
      now,
    ),
  );
  if (bookingId === null) throw new Error("The booking was not made");
  return { bookingId, quoteId: quote.id, leadId: seed.leadId ?? lead.id };
}

/** A lead owned by the world's salesperson. */
export async function aSellersLead(world: World) {
  const { aLead } = await import("../crm/support/records.js");
  return world.inOrg((tx) => aLead(tx, { ownerUserId: world.seller.userId }));
}

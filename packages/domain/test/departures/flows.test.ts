// The rest of a departure's life (release 7a): the waitlist and the notice when seats free up, a quote put on a departure (its
// dates are the departure's), a departure's profit with a cost of its own, what Today shows, and a customer's erasure.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { cancelBooking } from "../../src/bookings/index.js";
import {
  addToWaitlist,
  createHold,
  departureMoneyOf,
  departuresStartingSoon,
  getDeparture,
  makeQuoteFromHold,
  releaseHold,
  removeFromWaitlist,
  seatsFreedListener,
  setQuoteDeparture,
} from "../../src/departures/index.js";
import { addTripCost } from "../../src/finance/index.js";
import { runListenerJob } from "../../src/jobs/index.js";
import { parseCalendarDate, systemActor } from "../../src/kernel/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import { getQuote, updateQuote } from "../../src/quotes/index.js";
import { aQuote } from "../bookings/support.js";
import { aBookingOn, aDeparture, aSellersLead, now, openWorld, type World } from "./support.js";

const context = { supplierStateCode: "27", now };

describe("a departure's waitlist, quotes, money and Today", () => {
  let world: World;
  let platformDb: PlatformDatabase;
  beforeAll(async () => {
    world = await openWorld("Departure flows");
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await world.close();
  });

  /** Runs the waitlist listener on every "seats freed" event published for this departure. */
  async function listenTo(departureId: string) {
    const published = await world.inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "departure.seats-freed" } }));
    const events = published.filter((event) => (event.payload as { departureId?: string }).departureId === departureId);
    const listener = seatsFreedListener();
    for (const event of events) {
      await runListenerJob({
        db: world.db,
        listener,
        data: { organizationId: world.organizationId, eventId: event.id, eventType: event.type },
      });
    }
    return events;
  }

  it("tells the owner of the first lead waiting whose party fits, once, when seats free up", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 4 }));
    const { bookingId } = await aBookingOn(world, departure.id, { adults: 4 });
    const big = await aSellersLead(world);
    const small = await aSellersLead(world);
    await world.inOrg((tx) => addToWaitlist(tx, world.seller, { departureId: departure.id, leadId: big.id, seats: 6 }));
    await world.inOrg((tx) =>
      addToWaitlist(tx, world.seller, { departureId: departure.id, leadId: small.id, seats: 2 }),
    );
    // Adding the same lead again changes the seats instead of a second row.
    await world.inOrg((tx) =>
      addToWaitlist(tx, world.seller, { departureId: departure.id, leadId: small.id, seats: 3 }),
    );
    expect((await world.inOrg((tx) => getDeparture(tx, departure.id, now))).waitlist.map((row) => row.seats)).toEqual([
      6, 3,
    ]);
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "Plans changed" }, now));
    const events = await listenTo(departure.id);
    expect(events.length).toBeGreaterThan(0);
    // Run again: the same events tell nobody twice.
    await listenTo(departure.id);
    const told = await world.inOrg((tx) =>
      tx.notification.findMany({ where: { kind: "departure.seats-free", link: `/leads/${small.id}` } }),
    );
    expect(told).toHaveLength(1);
    const notTold = await world.inOrg((tx) => tx.notification.count({ where: { link: `/leads/${big.id}` } }));
    expect(notTold).toBe(0);
  });

  it("publishes nothing about freed seats when nobody waits, and lets staff take someone off the waitlist", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 3 }));
    const lead = await aSellersLead(world);
    const hold = await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 3, note: "" }, now),
    );
    await world.inOrg((tx) => releaseHold(tx, world.seller, hold.id, now));
    const events = await world.inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "departure.seats-freed" } }));
    expect(events.some((event) => (event.payload as { departureId?: string }).departureId === departure.id)).toBe(
      false,
    );
    await world.inOrg((tx) =>
      addToWaitlist(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 1 }),
    );
    const entry = (await world.inOrg((tx) => getDeparture(tx, departure.id, now))).waitlist[0];
    await world.inOrg((tx) => removeFromWaitlist(tx, world.seller, entry?.id ?? ""));
    expect((await world.inOrg((tx) => getDeparture(tx, departure.id, now))).waitlist).toEqual([]);
  });

  it("makes a draft quote from a hold with the departure's dates and price, and keeps those dates when it is edited", async () => {
    const departure = await world.inOrg((tx) =>
      aDeparture(tx, { pricePaise: 1_250_000n, startDate: "2026-11-10", endDate: "2026-11-14" }),
    );
    const lead = await aSellersLead(world);
    const hold = await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 3, note: "" }, now),
    );
    const { quoteId } = await world.inOrg((tx) => makeQuoteFromHold(tx, world.seller, hold.id, context));
    const quote = await world.inOrg((tx) => getQuote(tx, world.seller, quoteId));
    expect(quote).toMatchObject({
      startDate: "2026-11-10",
      adults: 3,
      status: "draft",
      departure: { id: departure.id, startDate: "2026-11-10" },
    });
    expect(quote.items).toMatchObject([{ quantity: 3, unitPricePaise: 1_250_000 }]);
    const edited = await world.inOrg((tx) =>
      updateQuote(tx, world.seller, { ...quote, quoteId, startDate: "2026-12-25" }, context),
    );
    expect(edited.startDate).toBe("2026-11-10");
    // A hold past its time can't start a quote.
    const later = { ...context, now: new Date("2026-11-05T00:00:00Z") };
    await expect(world.inOrg((tx) => makeQuoteFromHold(tx, world.seller, hold.id, later))).rejects.toMatchObject({
      reason: "SEAT_HOLD_EXPIRED",
    });
  });

  it("puts a draft quote on a departure and takes it off again, but moves nothing once the quote is sent", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { startDate: "2026-12-02", endDate: "2026-12-06" }));
    const { quote } = await world.inOrg((tx) =>
      aQuote(tx, { ownerUserId: world.seller.userId, status: "sent", startDate: "2026-12-20" }),
    );
    await expect(
      world.inOrg((tx) => setQuoteDeparture(tx, world.seller, { quoteId: quote.id, departureId: departure.id })),
    ).rejects.toMatchObject({ reason: "QUOTE_FROZEN" });
    const draft = await world.inOrg(async (tx) => {
      const seed = await aQuote(tx, { ownerUserId: world.seller.userId, status: "sent" });
      await tx.quote.update({ where: { id: seed.quote.id }, data: { status: "draft" } });
      return seed.quote;
    });
    await world.inOrg((tx) => setQuoteDeparture(tx, world.seller, { quoteId: draft.id, departureId: departure.id }));
    expect(await world.inOrg((tx) => getQuote(tx, world.seller, draft.id))).toMatchObject({
      startDate: "2026-12-02",
      departure: { id: departure.id },
    });
    await world.inOrg((tx) => setQuoteDeparture(tx, world.seller, { quoteId: draft.id, departureId: null }));
    expect((await world.inOrg((tx) => getQuote(tx, world.seller, draft.id))).departure).toBeNull();
  });

  it("works out a departure's profit from its bookings' price and its own costs", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 10 }));
    const first = await aBookingOn(world, departure.id, { adults: 2, subtotalPaise: 400_000_00 });
    await aBookingOn(world, departure.id, { adults: 2, subtotalPaise: 100_000_00 });
    await world.inOrg((tx) =>
      addTripCost(tx, world.accounts, {
        quoteId: first.quoteId,
        departureId: null,
        supplierId: null,
        category: "transport",
        supplier: "Cab",
        amountPaise: 50_000_00,
        dueOn: null,
        paidOn: null,
        note: "",
      }),
    );
    await world.inOrg((tx) =>
      addTripCost(tx, world.accounts, {
        quoteId: null,
        departureId: departure.id,
        supplierId: null,
        category: "hotel",
        supplier: "Hotel block",
        amountPaise: 120_000_00,
        dueOn: "2026-11-01",
        paidOn: null,
        note: "",
      }),
    );
    const money = await world.inOrg((tx) => departureMoneyOf(tx, departure.id));
    expect(money).toMatchObject({
      revenuePaise: 500_000_00,
      bookingCostPaise: 50_000_00,
      departureCostPaise: 120_000_00,
      profitPaise: 330_000_00,
      marginBasisPoints: 6600,
    });
    expect(money.costs).toMatchObject([{ supplier: "Hotel block", amountPaise: 120_000_00 }]);
  });

  it("lists departures starting within two weeks with what needs a look", async () => {
    const departure = await world.inOrg((tx) =>
      aDeparture(tx, { title: "Chardham batch", seatsTotal: 2, startDate: "2026-11-02", endDate: "2026-11-06" }),
    );
    await aBookingOn(world, departure.id, { adults: 2 });
    await aBookingOn(world, departure.id, { adults: 1 });
    const lead = await aSellersLead(world);
    const outside = await world.inOrg((tx) =>
      aDeparture(tx, { title: "Far away", startDate: "2027-03-01", endDate: "2027-03-05" }),
    );
    const items = await world.inOrg((tx) => departuresStartingSoon(tx, parseCalendarDate("2026-10-29"), now));
    expect(items.find((item) => item.departureId === outside.id)).toBeUndefined();
    expect(items.find((item) => item.departureId === departure.id)).toMatchObject({
      sold: 3,
      seatsTotal: 2,
      reasons: ["details-incomplete", "rooming-not-drafted", "overbooked"],
    });
    expect(lead.id).toBeTruthy();
    const holdDeparture = await world.inOrg((tx) =>
      aDeparture(tx, { title: "Hold batch", startDate: "2026-11-05", endDate: "2026-11-08" }),
    );
    const holder = await aSellersLead(world);
    await world.inOrg((tx) =>
      createHold(
        tx,
        world.seller,
        { departureId: holdDeparture.id, leadId: holder.id, seats: 1, hours: 2, note: "" },
        now,
      ),
    );
    const again = await world.inOrg((tx) => departuresStartingSoon(tx, parseCalendarDate("2026-10-29"), now));
    expect(again.find((item) => item.departureId === holdDeparture.id)?.reasons).toEqual(["holds-ending"]);
  });

  it("deletes a customer's holds, waitlist places and room words when they are erased, and keeps the departure", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 10 }));
    const { bookingId, leadId } = await aBookingOn(world, departure.id, { adults: 1 });
    const traveller = await world.inOrg((tx) => tx.bookingTraveller.findFirstOrThrow({ where: { bookingId } }));
    await world.inOrg((tx) =>
      tx.bookingTraveller.update({
        where: { id: traveller.id },
        data: { roomRequest: "ground_floor", roomNote: "bad knee" },
      }),
    );
    await world.inOrg((tx) => addToWaitlist(tx, world.seller, { departureId: departure.id, leadId, seats: 1 }));
    await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId, seats: 1, note: "for his wife" }, now),
    );
    const person = await world.inOrg((tx) =>
      tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { personId: true } }),
    );
    const erased = await platformDb.transaction((tx) =>
      eraseCustomerParts(
        tx,
        systemActor(world.organizationId),
        { organizationId: world.organizationId, personId: person.personId },
        now,
      ),
    );
    expect(erased).toMatchObject({ departureHoldsDeleted: 1, waitlistEntriesDeleted: 1 });
    expect(
      await world.inOrg((tx) => tx.bookingTraveller.findUniqueOrThrow({ where: { id: traveller.id } })),
    ).toMatchObject({
      roomRequest: "none",
      roomNote: "",
    });
    expect(await world.inOrg((tx) => tx.departureWaitlist.count({ where: { leadId } }))).toBe(0);
    expect(await world.inOrg((tx) => tx.departure.count({ where: { id: departure.id } }))).toBe(1);
  });
});

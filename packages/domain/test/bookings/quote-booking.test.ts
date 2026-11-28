// A booked quote's detail names its booking (id and number) so its page can point there; an unbooked quote names none.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getQuote } from "../../src/quotes/index.js";
import { aBooking, aQuote, openWorld, type World } from "./support.js";

describe("a quote's booking", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Quote booking");
  });
  afterAll(async () => {
    await world.close();
  });

  it("is named on the booked quote and absent on one with no booking", async () => {
    const { bookingId, quoteId } = await aBooking(world);
    const booked = await world.inOrg((tx) => getQuote(tx, world.seller, quoteId));
    const number = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
    expect(booked.booking).toEqual({ id: bookingId, number: number.number });
    const { quote } = await world.inOrg((tx) => aQuote(tx, { ownerUserId: world.seller.userId, status: "sent" }));
    expect((await world.inOrg((tx) => getQuote(tx, world.seller, quote.id))).booking).toBeNull();
  });
});

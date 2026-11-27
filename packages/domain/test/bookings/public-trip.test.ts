// The trip as its traveller sees it at /p/<token>: whether the agency's UPI QR may be drawn (only once its UPI id is
// verified, as on the quote's page), and the agency's own day, which says when a payment due is overdue.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicTripOf } from "../../src/bookings/index.js";
import { aBooking, openWorld, type World } from "./support.js";

describe("the trip page's data", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Public trip");
  });
  afterAll(async () => {
    await world.close();
  });

  // 01:30 on 30 Oct in India, still 29 Oct in UTC.
  const now = new Date("2026-10-29T20:00:00Z");

  it("draws the UPI QR only once the agency verified this UPI id", async () => {
    const { quoteId } = await aBooking(world, { confirmed: true });
    await world.inOrg((tx) => tx.quoteSettings.create({ data: { upiId: "agency@bank" } }));
    const unverified = await world.inOrg((tx) => publicTripOf(tx, quoteId, now));
    expect(unverified).toMatchObject({ upiId: "agency@bank", upiVerified: false });
    expect(unverified?.payLink).toMatch(/^upi:\/\/pay\?pa=agency%40bank/);

    await world.inOrg((tx) =>
      tx.quoteSettings.updateMany({
        data: { upiVerifiedAt: now, upiVerifiedBy: randomUUID(), upiVerifiedUpiId: "old@bank" },
      }),
    );
    expect((await world.inOrg((tx) => publicTripOf(tx, quoteId, now)))?.upiVerified).toBe(false);

    await world.inOrg((tx) => tx.quoteSettings.updateMany({ data: { upiVerifiedUpiId: "agency@bank" } }));
    expect((await world.inOrg((tx) => publicTripOf(tx, quoteId, now)))?.upiVerified).toBe(true);
  });

  it("gives the agency's own day, in its time zone, to tell a payment due before it as overdue", async () => {
    const { quoteId } = await aBooking(world, { confirmed: true });
    expect((await world.inOrg((tx) => publicTripOf(tx, quoteId, now)))?.today).toBe("2026-10-30");
  });
});

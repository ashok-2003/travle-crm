// What a quote behind an AI booking reads while the customer has not paid: waiting while the seats are held, hold expired
// once they lapse; never once the booking is confirmed or the quote accepted or declined; never for a staff-made quote.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentWaitsOf } from "../../src/ai/index.js";
import { aLead } from "../crm/support/records.js";
import { aDeparture } from "../departures/support.js";
import { openWorld, type World } from "../bookings/support.js";

const now = new Date("2026-11-10T06:00:00Z");

describe("a quote waiting for payment", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("PaymentWait");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aBooked(
    options: { quote?: "draft" | "accepted" | "declined"; booking?: string; hold?: "live" | "lapsed" | "none" } = {},
  ) {
    return world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "booking_requested" });
      const departure = await aDeparture(tx);
      const quote = await tx.quote.create({
        data: {
          leadId: lead.id,
          title: "Spiti",
          status: options.quote ?? "draft",
          departureId: departure.id,
          subtotalPaise: 1n,
          totalPaise: 1n,
        },
        select: { id: true },
      });
      if ((options.hold ?? "live") !== "none") {
        await tx.departureHold.create({
          data: {
            departureId: departure.id,
            leadId: lead.id,
            seats: 2,
            status: options.hold === "lapsed" ? "expired" : "active",
            ...(options.hold === "lapsed" ? { endedAt: new Date("2026-11-09T00:00:00Z") } : {}),
            expiresAt: new Date(options.hold === "lapsed" ? "2026-11-09T00:00:00Z" : "2026-11-12T00:00:00Z"),
          },
        });
      }
      await tx.aiBooking.create({
        data: {
          leadId: lead.id,
          conversationId: crypto.randomUUID(),
          summary: "Spiti",
          quoteId: quote.id,
          status: options.booking ?? "awaiting_payment",
        },
      });
      return quote.id;
    });
  }
  const waitOf = (id: string) => world.inOrg(async (tx) => (await paymentWaitsOf(tx, [id], now)).get(id) ?? null);

  it("waits while the seats are held", async () => {
    expect(await waitOf(await aBooked())).toBe("waiting");
    expect(await waitOf(await aBooked({ booking: "proof_received" }))).toBe("waiting");
  });

  it("reads hold expired once the hold lapsed", async () => {
    expect(await waitOf(await aBooked({ hold: "lapsed" }))).toBe("hold_expired");
    expect(await waitOf(await aBooked({ hold: "none" }))).toBe("hold_expired");
  });

  it("never waits once confirmed, cancelled, accepted or declined", async () => {
    expect(await waitOf(await aBooked({ booking: "confirmed" }))).toBeNull();
    expect(await waitOf(await aBooked({ booking: "cancelled" }))).toBeNull();
    expect(await waitOf(await aBooked({ quote: "accepted" }))).toBeNull();
    expect(await waitOf(await aBooked({ quote: "declined" }))).toBeNull();
  });

  it("is null for a staff-made quote", async () => {
    const id = await world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      return (
        await tx.quote.create({
          data: { leadId: lead.id, title: "Goa", subtotalPaise: 1n, totalPaise: 1n },
          select: { id: true },
        })
      ).id;
    });
    expect(await waitOf(id)).toBeNull();
  });
});

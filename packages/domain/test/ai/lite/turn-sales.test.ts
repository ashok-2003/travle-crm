// The lite turn carries a sale to a booking where the setup or the lead could stand in its way: a customer whose earlier
// trip is over, a month a person typed on the lead, and a trek that sells one room type (with or without a child's bed).
import type { RoomType } from "@travel-crm/contracts/quotes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatRupees } from "../../../src/kernel/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liteAgency } from "./support/lite-agency.js";
import { at, greeting, outbound, says, understood, withFacts, written, type Agency } from "./support/turn-script.js";

const kedarnath = { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false };
const fourteenth = { day: "2026-11-14", month: null, proof: "14 nov", changed: false };
const twoPeople = { count: 2, proof: "2 people", changed: false };

/** "book it": the pickup and the full name, the last details a booking needs. */
async function booksIt(on: Agency, seconds: number): Promise<string> {
  const token = await says(on, "book it, joining from Delhi, Riya Sharma", seconds);
  on.model.answer(
    understood([["wants_to_book", "book it"]], {
      details: {
        pickup_city: { words: "Delhi", proof: "joining from Delhi", changed: false },
        name: { full: "Riya Sharma", proof: "Riya Sharma" },
      },
    }),
  );
  expect(await on.turn(at(seconds + 30), { token })).toBe("replied");
  return token;
}

describe("the lite turn reaches a booking", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("a returning customer whose trip is over is answered, not handed over", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      const past = await tx.departure.create({
        data: {
          title: "Batch",
          startDate: new Date("2025-11-14T00:00:00Z"),
          endDate: new Date("2025-11-18T00:00:00Z"),
          seatsTotal: 12,
          templateId: on.packageId,
        },
        select: { id: true },
      });
      const earlier = await aLead(tx, { personId: on.chat.personId ?? "", stage: "won" });
      const quoteOf = (title: string) =>
        tx.quote.create({
          data: {
            leadId: earlier.id,
            title,
            status: "accepted",
            subtotalPaise: 1_399_800n,
            totalPaise: 1_399_800n,
            departureId: past.id,
          },
          select: { id: true },
        });
      const travelled = await quoteOf("Kedarnath Yatra 4N");
      await tx.booking.create({
        data: { quoteId: travelled.id, leadId: earlier.id, number: "BK-2025-0001", status: "completed" },
      });
      const booked = await quoteOf("Kedarnath Yatra 4N, again");
      await tx.aiBooking.create({
        data: {
          leadId: earlier.id,
          conversationId: on.chat.id,
          summary: "Kedarnath for 2",
          status: "confirmed",
          quoteId: booked.id,
        },
      });
    });
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("replied");
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
  });

  it("a month a person typed on the lead takes the customer's day, and books on it", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.lead.update({
        where: { id: on.leadId },
        data: { travelKind: "month", travelMonth: new Date("2026-11-01T00:00:00Z") },
      }),
    );
    await withFacts(on, { packageId: on.packageId, lastMove: "greet" });
    const token = await says(on, "price for kedarnath on 14 nov, 2 people, double?", 30);
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: {
          package: kedarnath,
          date: fourteenth,
          adults: twoPeople,
          room: { type: "double", proof: "double", changed: false },
        },
      }),
      written("Which city will you join us from?"),
    );
    expect(await on.turn(at(60), { token })).toBe("replied");
    expect((await outbound(on))[0]?.body).toContain(formatRupees(1_399_800));
    await booksIt(on, 90);
    const booking = await on.inOrg((tx) =>
      tx.aiBooking.findFirstOrThrow({ select: { quote: { select: { departureId: true } } } }),
    );
    expect(booking.quote?.departureId).toBe(on.departures[0]?.id);
    // The person's month stays on the lead.
    const lead = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    expect(lead.travelKind).toBe("month");
  });

  const treks: { rooms: RoomType[]; said: string; room: RoomType | null }[] = [
    { rooms: ["triple"], said: "2 people", room: null },
    { rooms: ["triple"], said: "2 people, double", room: "double" },
    { rooms: ["triple", "child_bed"], said: "2 people", room: null },
  ];
  it.each(treks)("a trek selling $rooms prices and books $said", async ({ rooms, said, room }) => {
    const on = await liteAgency(test, { roomTypes: rooms });
    await withFacts(on, { packageId: on.packageId, lastMove: "greet" });
    const token = await says(on, `price for kedarnath on 14 nov, ${said}?`, 30);
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: {
          package: kedarnath,
          date: fourteenth,
          adults: twoPeople,
          room: room === null ? null : { type: room, proof: room, changed: false },
        },
      }),
      written("Which city will you join us from?"),
    );
    expect(await on.turn(at(60), { token })).toBe("replied");
    const reply = (await outbound(on))[0]?.body ?? "";
    expect(reply).toContain(formatRupees(1_199_800));
    expect(reply).toContain(formatRupees(400_000));
    await booksIt(on, 90);
    expect(await on.inOrg((tx) => tx.departureHold.count())).toBe(1);
    const booking = await on.inOrg((tx) =>
      tx.aiBooking.findFirstOrThrow({ select: { quote: { select: { totalPaise: true } } } }),
    );
    expect(booking.quote?.totalPaise).toBe(1_199_800n);
  });
});

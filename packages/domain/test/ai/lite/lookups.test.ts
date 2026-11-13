// The lite agent's read lookups against the real database: what a package says, its open dates, and its price.
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import type { RoomType } from "@travel-crm/contracts/quotes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { datesAndSeats, packageDetails, priceOf } from "../../../src/ai/lite/lookups/package-reads.js";
import { runLookups, situationOf, type LookupContext } from "../../../src/ai/lite/lookups/situation.js";
import type { LookupRequest } from "../../../src/ai/lite/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteToday } from "./support/lite-agency.js";

const none = { words: null, package: null, month: null, topic: null };
const request = (changes: Partial<LookupRequest> & Pick<LookupRequest, "tool">): LookupRequest => ({
  ...none,
  ...changes,
});

describe("the lite lookups", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world() {
    const on = await liteAgency(test);
    const facts = (changes: Partial<LiteFacts> = {}): LiteFacts => ({
      ...liteFacts.parse({ agent: "lite" }),
      packageId: on.packageId,
      ...changes,
    });
    const index = [
      {
        id: on.packageId,
        title: "Kedarnath Yatra 4N",
        place: "Kedarnath",
        destinationId: null,
        nights: 4,
        startCity: "Delhi",
      },
    ];
    const context = (changes: Partial<LiteFacts> = {}): LookupContext => ({
      index,
      answers: { cancellation: "Cancel 15 days before for a 50% refund." },
      facts: facts(changes),
      today: liteToday,
      now: testNow,
    });
    return { on, facts, context };
  }

  it("details drop typed amounts and payment text", async () => {
    const { on } = await world();
    await on.inOrg((tx) =>
      tx.quoteTemplate.update({
        where: { id: on.packageId },
        data: { inclusions: "Meals. ₹500 extra for AC. UPI x@y" },
      }),
    );
    const details = await on.inOrg((tx) => packageDetails(tx, on.packageId));
    expect(details?.inclusions).toContain("Meals.");
    expect(details?.inclusions).not.toContain("₹500");
    expect(details?.inclusions).not.toContain("x@y");
  });

  it("details keep an @ that stands between words, and drop a handle", async () => {
    const { on } = await world();
    await on.inOrg((tx) =>
      tx.quoteTemplate.update({
        where: { id: on.packageId },
        data: { notes: "Meet at Gate @ ISBT, or write to trips@sharma.example" },
      }),
    );
    const details = await on.inOrg((tx) => packageDetails(tx, on.packageId));
    expect(details?.notes).toContain("Gate @ ISBT");
    expect(details?.notes).not.toContain("sharma.example");
    expect(details?.pickups).toEqual(["Delhi - Kashmiri Gate, 9 pm", "Haridwar - Railway station, 5 am"]);
  });

  it("dates with seats", async () => {
    const { on } = await world();
    const ask = (seats: number) =>
      on.inOrg((tx) => datesAndSeats(tx, on.packageId, { month: "2026-11", seats, today: liteToday, now: testNow }));
    expect((await ask(2)).map((one) => [one.startsOn, one.freeSeats])).toEqual([
      ["2026-11-14", 12],
      ["2026-11-21", 4],
    ]);
    expect((await ask(5)).map((one) => one.startsOn)).toEqual(["2026-11-14"]);
  });

  it("dates leave out the seats held for others", async () => {
    const { on } = await world();
    const [, small] = on.departures;
    await on.inOrg(async (tx) => {
      const other = await aLead(tx, { stage: "new" });
      await tx.departureHold.create({
        data: {
          departureId: small?.id ?? "",
          leadId: other.id,
          seats: 3,
          status: "active",
          expiresAt: new Date(testNow.getTime() + 3_600_000),
        },
      });
    });
    const ask = (seats: number) =>
      on.inOrg((tx) => datesAndSeats(tx, on.packageId, { month: "2026-11", seats, today: liteToday, now: testNow }));
    expect((await ask(1)).map((one) => [one.startsOn, one.freeSeats])).toEqual([
      ["2026-11-14", 12],
      ["2026-11-21", 1],
    ]);
    expect((await ask(2)).map((one) => one.startsOn)).toEqual(["2026-11-14"]);
  });

  it("a full price", async () => {
    const { on, facts } = await world();
    const base = { adults: 2, roomType: "double" as const, departureId: on.departures[0]?.id ?? null };
    const price = await on.inOrg((tx) => priceOf(tx, on.packageId, facts(base), liteToday, testNow));
    expect(price).toMatchObject({ perPersonPaise: 699_900, totalPaise: 1_399_800, advancePaise: 400_000 });
    const withChild = await on.inOrg((tx) =>
      priceOf(tx, on.packageId, facts({ ...base, children: { count: 1, ages: [8] } }), liteToday, testNow),
    );
    expect(withChild?.rooms).toEqual([
      { roomType: "double", people: 2 },
      { roomType: "child_bed", people: 1 },
    ]);
    expect(withChild?.advancePaise).toBe(600_000);
    expect(withChild?.totalPaise).toBe(2 * 699_900 + 399_900);
  });

  const childRooms: { offered: RoomType[]; rooms: { roomType: RoomType; people: number }[]; total: number }[] = [
    {
      offered: ["double", "child_bed"],
      rooms: [
        { roomType: "double", people: 2 },
        { roomType: "child_bed", people: 1 },
      ],
      total: 2 * 699_900 + 399_900,
    },
    {
      offered: ["double", "child_no_bed"],
      rooms: [
        { roomType: "double", people: 2 },
        { roomType: "child_no_bed", people: 1 },
      ],
      total: 2 * 699_900 + 299_900,
    },
    { offered: ["triple"], rooms: [{ roomType: "triple", people: 3 }], total: 3 * 599_900 },
  ];
  it.each(childRooms)("a child takes $offered: $rooms", async ({ offered, rooms, total }) => {
    const { on, facts } = await world();
    await on.inOrg(async (tx) => {
      await tx.quoteTemplate.update({ where: { id: on.packageId }, data: { roomTypes: offered } });
      await tx.packageSeason.updateMany({ data: { priceChildNoBedPaise: 299_900n } });
    });
    const child = { adults: 2, children: { count: 1, ages: [8] }, departureId: on.departures[0]?.id ?? null };
    const price = await on.inOrg((tx) =>
      priceOf(tx, on.packageId, facts({ ...child, roomType: offered[0] ?? null }), liteToday, testNow),
    );
    expect(price).toMatchObject({ rooms, totalPaise: total, travellers: 3, advancePaise: 600_000 });
  });

  it("a package deleted since the index was read has no price, and its lookup says so", async () => {
    const { on, context } = await world();
    await on.inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id: on.packageId }, data: { deletedAt: new Date(), deletedBy: null } }),
    );
    expect(await on.inOrg((tx) => priceOf(tx, on.packageId, context().facts, liteToday, testNow))).toBeNull();
    const [looked] = await on.inOrg((tx) =>
      runLookups(tx, context(), [request({ tool: "price", package: "Kedarnath Yatra 4N" })]),
    );
    expect(looked?.result).toEqual({ tool: "price", error: "unknown_package" });
    const situation = await on.inOrg((tx) => situationOf(tx, context(), []));
    expect(situation).toMatchObject({ package: null, price: null });
  });

  it("three in triple are priced; two in triple do not fill a room, so only a per person price is given", async () => {
    const { on, facts } = await world();
    const base = { roomType: "triple" as const, departureId: on.departures[0]?.id ?? null };
    const three = await on.inOrg((tx) => priceOf(tx, on.packageId, facts({ ...base, adults: 3 }), liteToday, testNow));
    expect(three).toMatchObject({ perPersonPaise: 599_900, totalPaise: 1_799_700, advancePaise: 600_000 });
    const two = await on.inOrg((tx) => priceOf(tx, on.packageId, facts({ ...base, adults: 2 }), liteToday, testNow));
    expect(two).toMatchObject({ perPersonPaise: 599_900, totalPaise: null, advancePaise: null });
  });

  it("only a from price without a departure or a room", async () => {
    const { on, facts } = await world();
    const noDeparture = await on.inOrg((tx) =>
      priceOf(tx, on.packageId, facts({ adults: 2, roomType: "triple" }), liteToday, testNow),
    );
    expect(noDeparture).toMatchObject({ fromPaise: 599_900, totalPaise: null });
    const noRoom = await on.inOrg((tx) =>
      priceOf(tx, on.packageId, facts({ adults: 2, departureId: on.departures[0]?.id ?? null }), liteToday, testNow),
    );
    expect(noRoom?.totalPaise).toBeNull();
    expect(noRoom?.roomType).toBeNull();
  });

  it("lookups are checked", async () => {
    const { on, context } = await world();
    const run = (requests: LookupRequest[]) => on.inOrg((tx) => runLookups(tx, context(), requests));
    const errorOf = async (one: LookupRequest) => {
      const [looked] = await run([one]);
      return looked?.result;
    };
    expect(await errorOf(request({ tool: "price", package: "Kedarkantha Yatra" }))).toEqual({
      tool: "price",
      error: "unknown_package",
    });
    expect(
      await errorOf(request({ tool: "dates_and_seats", package: "kedarnath yatra 4n", month: "2026-09" })),
    ).toEqual({
      tool: "dates_and_seats",
      error: "bad_month",
    });
    expect(await errorOf(request({ tool: "agency_answer" }))).toEqual({
      tool: "agency_answer",
      error: "missing_input",
    });
    expect(await errorOf(request({ tool: "agency_answer", topic: "cancellation" }))).toEqual({
      tool: "agency_answer",
      topic: "cancellation",
      answer: "Cancel 15 days before for a 50% refund.",
    });
    const five = (["children", "safety", "refunds", "cancellation", "id_documents"] as const).map((topic) =>
      request({ tool: "agency_answer", topic }),
    );
    expect(await run(five)).toHaveLength(4);
    const again = request({ tool: "agency_answer", topic: "children" });
    expect(await run([again, again])).toHaveLength(1);
  });

  it("the situation holds the package, its rooms and departures, and the price", async () => {
    const { on, context } = await world();
    const situation = await on.inOrg((tx) => situationOf(tx, context({ adults: 2 }), []));
    expect(situation.package).toMatchObject({ id: on.packageId, adultRooms: ["double", "triple"] });
    expect(situation.package?.departures.map((one) => one.startsOn)).toEqual([
      parseCalendarDate("2026-11-14"),
      parseCalendarDate("2026-11-21"),
    ]);
    expect(situation.price?.fromPaise).toBe(599_900);
  });
});

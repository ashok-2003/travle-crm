// What a lite turn costs in round trips to the database, which a distant database turns into seconds: preparing a turn
// and booking read the trips on offer in a few batched queries, so an agency with ten packages pays what one with one does.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiChatResumedListener, aiCustomerWroteListener, aiReplyHandlers } from "../../../src/ai/index.js";
import { prepareLiteTurn } from "../../../src/ai/lite/prepare.js";
import type { ListenerContext } from "../../../src/jobs/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { countingDatabase } from "./support/counting-db.js";
import { liteAgency, liteTurnAt } from "./support/lite-agency.js";
import { at, says, understood, withFacts, written, type Agency } from "./support/turn-script.js";

const day = (text: string) => new Date(`${text}T00:00:00Z`);
const allowed: Entitlements = {
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};

const dependenciesOf = (test: TestInbox, on: Agency) => ({
  db: test.db,
  ai: on.model,
  subscriptions: { entitlementsOf: () => Promise.resolve(allowed) },
  agencyName: () => Promise.resolve("Sharma Holidays"),
  files: test.files,
  managers: () => Promise.resolve([]),
});

/** `count` more group packages the AI may sell, each with a season and two departures, like the fixture's own. */
async function morePackages(on: Agency, count: number): Promise<void> {
  await on.inOrg(async (tx) => {
    for (let index = 0; index < count; index += 1) {
      const destination = await tx.destination.create({
        data: { name: `Place ${String(index)}` },
        select: { id: true },
      });
      const template = await tx.quoteTemplate.create({
        data: {
          name: `Trek ${String(index)}`,
          title: `Trek ${String(index)} 3N`,
          kind: "group",
          destinationId: destination.id,
          nights: 3,
          startCity: "Delhi",
          roomTypes: ["double", "triple"],
          advancePerPersonPaise: 200_000n,
          pricesIncludeGst: true,
          aiSellable: true,
        },
        select: { id: true },
      });
      await tx.packageSeason.create({
        data: {
          templateId: template.id,
          label: "Winter",
          startsOn: day("2026-11-01"),
          endsOn: day("2026-12-31"),
          priceDoublePaise: 699_900n,
          priceTriplePaise: 599_900n,
        },
      });
      for (const startsOn of ["2026-11-14", "2026-11-21"]) {
        await tx.departure.create({
          data: {
            title: "Batch",
            startDate: day(startsOn),
            endDate: day(startsOn),
            seatsTotal: 12,
            templateId: template.id,
          },
        });
      }
    }
  });
}

/** The queries one prepare sends, for an agency selling the fixture's package and `more` others. */
async function prepareCost(test: TestInbox, more: number): Promise<number> {
  const on = await liteAgency(test);
  await morePackages(on, more);
  const counting = countingDatabase(test.db);
  const prepared = await prepareLiteTurn(
    { ...dependenciesOf(test, on), db: counting.db },
    { organizationId: on.organizationId, conversationId: on.chat.id, kind: "reply", token: on.message.id },
    liteTurnAt,
  );
  expect(typeof prepared === "string" ? prepared : prepared.index.length).toBe(more + 1);
  return counting.count();
}

/**
 * The queries one booking turn sends (the price told the turn before), with `more` other packages for sale: in all, in
 * its act transaction (the last it opens), and how many transactions it opens.
 */
async function bookCost(test: TestInbox, more: number): Promise<{ turn: number; act: number; transactions: number }> {
  const on = await liteAgency(test);
  await morePackages(on, more);
  await withFacts(on, { packageId: on.packageId, lastMove: "greet" });
  const priced = await says(on, "price for kedarnath on 14 nov, 2 people, double?", 30);
  on.model.answer(
    understood([["price_question", "price for kedarnath"]], {
      details: {
        package: { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false },
        date: { day: "2026-11-14", month: null, proof: "14 nov", changed: false },
        adults: { count: 2, proof: "2 people", changed: false },
        room: { type: "double", proof: "double", changed: false },
      },
    }),
    written("Which city will you join us from?"),
  );
  expect(await on.turn(at(60), { token: priced })).toBe("replied");
  const token = await says(on, "book it, joining from Delhi, Riya Sharma", 90);
  on.model.answer(
    understood([["wants_to_book", "book it"]], {
      details: {
        pickup_city: { words: "Delhi", proof: "joining from Delhi", changed: false },
        name: { full: "Riya Sharma", proof: "Riya Sharma" },
      },
    }),
  );
  const counting = countingDatabase(test.db);
  expect(await on.turn(at(120), { token, db: counting.db })).toBe("replied");
  expect(await on.inOrg((tx) => tx.aiBooking.count())).toBe(1);
  const transactions = counting.transactions();
  return { turn: counting.count(), act: transactions.at(-1) ?? 0, transactions: transactions.length };
}

describe("what a lite turn costs the database", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("preparing a turn costs the same with ten packages as with one", async () => {
    const one = await prepareCost(test, 0);
    const ten = await prepareCost(test, 9);
    expect({ one, ten }).toEqual({ one, ten: one });
  });

  it("a lite agency's turns wait on a queue of their own, three at once", async () => {
    const on = await liteAgency(test);
    const before = test.queue.sent.length;
    const context: ListenerContext = { actor: systemActor(on.organizationId), forOrg: (work) => on.inOrg(work) };
    const event = { id: randomUUID(), organizationId: on.organizationId, occurredAt: testNow };
    const subscriptions = { entitlementsOf: () => Promise.resolve(allowed) };
    await aiCustomerWroteListener({ queue: test.queue, subscriptions }).handle(
      {
        ...event,
        type: "whatsapp.customer-wrote",
        payload: { conversationId: on.chat.id, messageId: on.message.id, firstEver: false },
      },
      context,
    );
    await aiChatResumedListener({ queue: test.queue, subscriptions }).handle(
      { ...event, type: "ai.chat-resumed", payload: { conversationId: on.chat.id } },
      context,
    );
    expect(test.queue.sent.slice(before).map((job) => job.queue)).toEqual(["ai.lite-reply", "ai.lite-reply"]);
    const handlers = aiReplyHandlers({ ...dependenciesOf(test, on), logger: on.logger });
    expect(handlers.map((one) => [one.queue, one.concurrency])).toEqual([
      ["ai.reply", 10],
      ["ai.lite-reply", 3],
    ]);
  });

  it("a booking turn costs the same with ten packages as with one", async () => {
    const one = await bookCost(test, 0);
    const ten = await bookCost(test, 9);
    expect({ one, ten }).toEqual({ one, ten: one });
  });
});

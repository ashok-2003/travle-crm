// Try it for a lite agency: the lite turn as a dry run on a chat of one customer line. It shows what the customer would
// get and what code would do, and sends, holds, books and writes nothing but the month's usage.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { liteDryRun } from "../../../src/ai/index.js";
import { fixedText } from "../../../src/ai/lite/fixed-texts.js";
import { formatRupees } from "../../../src/kernel/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency } from "./support/lite-agency.js";
import { calls, understood, withFacts, written, type Agency } from "./support/turn-script.js";

describe("Try it for the lite agent", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const tryIt = (on: Agency, question: string) =>
    liteDryRun(
      { db: test.db, ai: on.model, agencyName: () => Promise.resolve("Sharma Holidays") },
      memberOf(on.organizationId, "org-owner"),
      { messages: [{ from: "customer", text: question }], state: null },
      testNow,
    );

  /** Every table the live turn would write, counted: a dry run leaves them all as they were. */
  const rows = (on: Agency) =>
    on.inOrg(async (tx) => ({
      messages: await tx.whatsappMessage.count(),
      holds: await tx.departureHold.count(),
      bookings: await tx.aiBooking.count(),
      notes: await tx.leadNote.count(),
      timeline: await tx.leadTimelineEntry.count(),
      fields: await tx.leadAiField.count(),
      insights: await tx.leadAiInsight.count(),
      tasks: await tx.task.count(),
      chats: await tx.aiChat.findMany({ select: { facts: true, summary: true } }),
      lead: await tx.lead.findMany(),
    }));

  it("a price question shows code's price", async () => {
    const on = await liteAgency(test);
    const before = await rows(on);
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: { package: { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false } },
      }),
      written("Which city will you join us from?"),
    );
    const shown = await tryIt(on, "price for kedarnath?");
    expect(shown.answer).toContain(formatRupees(599_900));
    expect(shown.answer).toContain("Which city will you join us from?");
    expect(shown.handoff).toBe(false);
    expect(shown.dryRun.blocked).toBeNull();
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
    expect(await calls(on)).toBe(2);
    expect(await rows(on)).toEqual(before);
  });

  it("a discount shows the hand-over", async () => {
    const on = await liteAgency(test);
    const before = await rows(on);
    on.model.answer(understood([["discount", "discount"]]));
    const shown = await tryIt(on, "any discount?");
    expect(shown.handoff).toBe(true);
    expect(shown.answer).toBe(fixedText("hand_over", "english", {}).text);
    expect(shown.reason).toBe("Asked for a discount or a better price.");
    expect(await calls(on)).toBe(1);
    expect(await rows(on)).toEqual(before);
  });

  it("a typed price twice hands over with the hand-over line, as the live turn sends it", async () => {
    const on = await liteAgency(test);
    const before = await rows(on);
    const typed = written("It costs ₹5,999 only. Which city will you join us from?");
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: { package: { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false } },
      }),
      typed,
      typed,
    );
    const shown = await tryIt(on, "price for kedarnath?");
    expect(shown).toMatchObject({
      answer: fixedText("hand_over", "english", {}).text,
      handoff: true,
      reason: "The AI couldn't write a safe reply.",
      dryRun: { blocked: null },
    });
    expect(shown.trace).toMatchObject({
      handOver: "check_failed",
      why: "write:amount",
      writes: [
        { answer: typed, refused: "amount" },
        { answer: typed, refused: "amount" },
      ],
    });
    expect(await calls(on)).toBe(3);
    expect(await rows(on)).toEqual(before);
  });

  it("a package newly picked with files shows the files and a note", async () => {
    const on = await liteAgency(test);
    on.model.answer(
      understood([["package_question", "kedarnath"]], {
        details: { package: { name: "Kedarnath Yatra 4N", proof: "kedarnath", changed: false } },
      }),
      written("It is a group yatra. Which city will you join us from?"),
    );
    const shown = await tryIt(on, "tell me about kedarnath");
    expect(shown.dryRun.actions).toEqual(expect.arrayContaining(["files", "note"]));
  });

  it("a booking shows the hold and the payment lines, and holds nothing", async () => {
    const on = await liteAgency(test);
    const before = await rows(on);
    on.model.answer(
      understood([["wants_to_book", "book kedarnath"]], {
        details: {
          package: { name: "Kedarnath Yatra 4N", proof: "book kedarnath", changed: false },
          date: { day: "2026-11-14", month: null, proof: "14 nov", changed: false },
          adults: { count: 2, proof: "for 2", changed: false },
          room: { type: "double", proof: "double", changed: false },
          pickup_city: { words: "Delhi", proof: "from Delhi", changed: false },
          name: { full: "Riya Sharma", proof: "Riya Sharma" },
        },
      }),
    );
    const shown = await tryIt(on, "book kedarnath 14 nov for 2, double, from Delhi, Riya Sharma");
    expect(shown.dryRun.actions).toContain("book");
    expect(shown.answer).toContain(formatRupees(400_000));
    expect(shown.answer).toContain("UPI: sharma@okbank");
    expect(await rows(on)).toEqual(before);
  });

  it("Try it runs the lite dry run before setup is finished", async () => {
    const on = await liteAgency(test, { ready: false });
    await withFacts(on, { packageId: on.packageId });
    on.model.answer(understood([["discount", "discount"]]));
    await tryIt(on, "any discount?");
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
  });
});

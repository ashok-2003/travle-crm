// Try it on the one agent: a test chat answered on the agency's own data through the tool agent, with nothing sent, held
// or kept but the month's AI calls, and traced as the one agent's own Try it turn.
import type { TestAiLine } from "@travel-crm/contracts/ai";
import { withTracing } from "@travel-crm/integrations/ai";
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { createMemoryTracing } from "@travel-crm/integrations/tracing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT_IN_NATURAL_PROMPT, oneTryItTurn, type NaturalPrompt } from "../../../src/ai/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { naturalAgency } from "../natural/support/natural-agency.js";

// Mon 16 Nov 2026, noon in Kolkata.
const NOW = new Date("2026-11-16T06:30:00Z");
const CHAT_ID = "019a8f2e-7c41-7a10-9b2e-3d4c5b6a7f80";
const terms = { trip_id: "T1", date: "2026-12-19", adults: 2, room: "triple" };

describe("Try it on the one agent", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world() {
    const agency = await naturalAgency(test);
    const tracing = createMemoryTracing();
    const member = memberOf(agency.organizationId, "org-owner");
    const deps = {
      db: test.db,
      ai: withTracing(agency.model, tracing),
      toolAgent: createMemoryToolAgent(),
      agencyName: () => Promise.resolve("Case Trips"),
      tracing,
    };
    const tryIt = (
      messages: readonly TestAiLine[],
      state: Parameters<typeof oneTryItTurn>[2]["state"] = null,
      prompt: NaturalPrompt = BUILT_IN_NATURAL_PROMPT,
    ) => oneTryItTurn(deps, member, { messages, state, prompt, chatId: CHAT_ID }, NOW);
    const rows = () =>
      test.db.forOrg(agency.organizationId, async (tx) => ({
        messages: await tx.whatsappMessage.count(),
        holds: await tx.departureHold.count(),
        bookings: await tx.aiBooking.count(),
        tasks: await tx.task.count(),
        leads: await tx.lead.count(),
      }));
    return { ...agency, tracing, tryIt, rows };
  }

  it("answers a test chat on the one agent with nothing sent, held or kept", async () => {
    const on = await world();
    const before = await on.rows();
    on.model.answer(
      { toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] },
      { text: "Kedarkantha ₹9,499 per person se shuru hai. Kab ka plan hai?" },
    );
    const answer = await on.tryIt([{ from: "customer", text: "Kedarkantha ka rate?" }]);
    expect(answer).toMatchObject({
      outcome: "replied",
      messages: ["Kedarkantha ₹9,499 per person se shuru hai. Kab ka plan hai?"],
      trace: { fallback: null },
    });
    expect(on.model.requests[0]).toMatchObject({ feature: "sales_agent" });
    expect(await on.rows()).toEqual(before);
  });

  it("describes a b2b hand-over and a hold with no name", async () => {
    const on = await world();
    // The model writes its words beside the action, then has nothing to add once the action is staged.
    on.model.answer(
      {
        text: "Main team ko bata deti hoon, woh yahin reply karenge.",
        toolCalls: [
          { name: "hand_over", arguments: { reason: "b2b", summary: "A travel agent wants a rate for 20." } },
        ],
      },
      { text: "" },
    );
    expect(await on.tryIt([{ from: "customer", text: "Hum travel agent hain, 20 seats chahiye" }])).toMatchObject({
      outcome: "handed_off",
      actions: [{ tool: "hand_over", reason: "b2b" }],
    });

    const held = await world();
    const words = "Sat 19 Dec, 2 log, triple sharing: total ₹18,998. Advance ₹6,000 abhi. Hold kar dun?";
    held.model.answer({ text: words, toolCalls: [{ name: "offer_booking", arguments: terms }] }, { text: "" });
    const first = await held.tryIt([{ from: "customer", text: "Kedarkantha 19 Dec, 2 log" }]);
    held.model.answer(
      {
        text: "Seats hold kar rahi hoon, ₹6,000 advance QR par bhej dijiye.",
        toolCalls: [{ name: "book", arguments: terms }],
      },
      { text: "" },
    );
    const second = await held.tryIt(
      [{ from: "customer", text: "Kedarkantha 19 Dec, 2 log" }, ...first.history, { from: "customer", text: "haan" }],
      first.state,
    );
    expect(second.actions).toEqual([expect.objectContaining({ tool: "book", seats: 2 })]);
    expect(await held.rows()).toMatchObject({ holds: 0, bookings: 0 });
  });

  it("traces it as the one agent's Try it, on the latest prompt", async () => {
    const on = await world();
    const latest: NaturalPrompt = {
      version: "langfuse:whatsapp-agent/real-agent@3",
      text: BUILT_IN_NATURAL_PROMPT.text,
      source: { name: "whatsapp-agent/real-agent", version: 3, label: "latest" },
    };
    on.model.answer({ text: "Hi! Kaunsa trek dekh rahe hain?" });
    await on.tryIt([{ from: "customer", text: "Hi" }], null, latest);
    const [turn] = on.tracing.turns;
    expect(on.tracing.turns).toHaveLength(1);
    expect(turn?.start).toMatchObject({
      name: "whatsapp-agent.one.try-it",
      sessionId: `try-it:${CHAT_ID}`,
      tags: ["whatsapp-agent", "one", "try-it"],
      prompt: { name: "whatsapp-agent/real-agent", version: 3 },
      metadata: { agent: "one", tryIt: true, promptLabel: "latest" },
    });
  });
});

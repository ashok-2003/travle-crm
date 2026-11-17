// Try it on the natural agent: the posted chat and the state a turn handed back, strict at every level, and the answer
// with its actions described, the next state and the lines to add to the chat.
import { describe, expect, it } from "vitest";
import { naturalDryAction, naturalTestAnswer, naturalTestInput } from "../../src/ai/natural-try-it.js";

const packageId = "0192f3a0-0000-7000-8000-000000000001";
const departureId = "0192f3a0-0000-7000-8000-000000000002";

const state = {
  facts: {
    agent: "natural",
    leadId: null,
    sentTripIds: [packageId],
    sentFileIds: [],
    offer: {
      packageId,
      startsOn: "2026-12-19",
      adults: 2,
      childrenAges: [],
      room: "triple",
      payInFull: false,
      departureId,
      totalPaise: 1_899_800,
      advancePaise: 600_000,
      at: "2026-11-16T06:30:00.000Z",
    },
    told: [],
    bookingId: null,
    lastTurnAt: "2026-11-16T06:30:00.000Z",
  },
  lead: {
    packageId,
    day: "2026-12-19",
    month: null,
    adults: 2,
    childrenAges: [],
    pickupCity: null,
    room: "triple",
    name: null,
    stage: "quote_sent",
    notes: [],
    tasks: [{ kind: "question", text: "Asked about oxygen on the summit day." }],
    booking: null,
  },
};
const input = {
  messages: [
    { from: "customer", text: "Kedarkantha 19 Dec, 2 log" },
    { from: "agent", text: "Sat 19 Dec: total ₹18,998, advance ₹6,000. Pura naam?" },
    { from: "customer", text: "haan, Rohan Mehta" },
  ],
  state,
};

describe("Try it on the natural agent", () => {
  it("takes the chat and the state the last turn handed back", () => {
    expect(naturalTestInput.parse(input).state?.facts.offer?.totalPaise).toBe(1_899_800);
    expect(naturalTestInput.parse({ ...input, state: null }).state).toBeNull();
  });

  it("takes the test chat's id, its trace's session, when the client sends one, and only an id", () => {
    const chatId = "0192f3a0-0000-7000-8000-0000000000ff";
    expect(naturalTestInput.parse({ ...input, chatId }).chatId).toBe(chatId);
    expect(naturalTestInput.parse(input).chatId).toBeUndefined();
    expect(naturalTestInput.safeParse({ ...input, chatId: "+91 98765 43210" }).success).toBe(false);
  });

  it("refuses a model, a temperature or a prompt choice: the agency tests the live agent", () => {
    for (const extra of [{ model: "flash" }, { temperature: "0.4" }, { prompt: "draft" }]) {
      expect(naturalTestInput.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });

  it("refuses unknown keys in a posted state", () => {
    const withExtraKey = { ...input, state: { ...state, summary: "" } };
    expect(naturalTestInput.safeParse(withExtraKey).success).toBe(false);
  });

  it("refuses unknown keys deep in the state: the facts, the offer, a told total, the lead, a task, the booking", () => {
    const told = { ...state.facts.offer, totalPaise: 1_899_800 };
    const posted = [
      { ...state, facts: { ...state.facts, extra: 1 } },
      { ...state, facts: { ...state.facts, offer: { ...state.facts.offer, extra: 1 } } },
      { ...state, facts: { ...state.facts, told: [{ ...told, extra: 1 }] } },
      { ...state, lead: { ...state.lead, extra: 1 } },
      { ...state, lead: { ...state.lead, tasks: [{ kind: "question", text: "x", extra: 1 }] } },
      {
        ...state,
        lead: { ...state.lead, booking: { packageId, startsOn: "2026-12-19", advancePaise: 600_000, extra: 1 } },
      },
    ];
    for (const one of posted) expect(naturalTestInput.safeParse({ ...input, state: one }).success).toBe(false);
  });

  it("refuses a chat that ends with the agent's line", () => {
    const endsWithUs = { ...input, messages: input.messages.slice(0, 2) };
    expect(naturalTestInput.safeParse(endsWithUs).success).toBe(false);
  });

  it("describes each action by its tool, with the trip's title, the day and the money", () => {
    expect(
      naturalDryAction.parse({
        tool: "book",
        trip: "Kedarkantha Trek",
        date: "2026-12-19",
        seats: 2,
        advancePaise: 600_000,
      }),
    ).toEqual({ tool: "book", trip: "Kedarkantha Trek", date: "2026-12-19", seats: 2, advancePaise: 600_000 });
    expect(naturalDryAction.safeParse({ tool: "book", trip: "Kedarkantha Trek", date: "19 Dec" }).success).toBe(false);
    expect(naturalDryAction.safeParse({ tool: "update_lead", fields: ["budget"] }).success).toBe(false);
  });

  it("answers at most two messages, the payment lines, the next state, the chat's new lines and the trace", () => {
    const answer = {
      messages: ["Ho gaya, Rohan ji.", "₹6,000 advance QR par bhej dijiye."],
      payment: ["UPI: casetrips@okbank"],
      actions: [{ tool: "book", trip: "Kedarkantha Trek", date: "2026-12-19", seats: 2, advancePaise: 600_000 }],
      outcome: "replied",
      state,
      history: [
        { from: "agent", text: "Ho gaya, Rohan ji." },
        { from: "agent", text: "[held: 2 seats on Sat 19 Dec; payment details sent]" },
      ],
      trace: {
        agent: "natural",
        promptVersion: "built-in-1",
        promptLabel: null,
        outcome: "replied",
        fallback: null,
        restarted: null,
        durationMs: 900,
        calls: [],
        guards: [],
        staged: [],
        flags: [],
      },
    };
    expect(naturalTestAnswer.parse(answer).payment).toEqual(["UPI: casetrips@okbank"]);
    expect(naturalTestAnswer.safeParse({ ...answer, messages: ["a", "b", "c"] }).success).toBe(false);
    // The Langfuse label the prompt was read at; null is the built-in text.
    const fromDraft = {
      ...answer.trace,
      promptVersion: "langfuse:whatsapp-agent/natural-system@7",
      promptLabel: "draft",
    };
    expect(naturalTestAnswer.parse({ ...answer, trace: fromDraft }).trace.promptLabel).toBe("draft");
  });
});

// A dry turn's answer (Try it): a turn that ended giving way to a newer line still answers, as a model failure, never
// with an error.
import { naturalFacts, type DryLead } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { dryAnswerOf } from "../../../src/ai/natural/dry-answer.js";
import { startNaturalTrace } from "../../../src/ai/natural/trace.js";
import { BUILT_IN_ONE_PROMPT } from "../../../src/ai/one/prompt.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

// Mon 16 Nov 2026, noon in Kolkata.
const NOW = new Date("2026-11-16T06:30:00Z");

describe("a dry turn's answer", () => {
  it("answers a turn that gave way to a newer line as a model failure, never with an error", () => {
    // A dry turn has no newer line to give way to; were it to end so, Try it still gets an answer.
    const lead: DryLead = {
      packageId: null,
      day: null,
      month: null,
      adults: null,
      childrenAges: [],
      pickupCity: null,
      room: null,
      name: null,
      stage: "new",
      notes: [],
      tasks: [],
      booking: null,
    };
    const state = { facts: naturalFacts.parse({ agent: "natural" }), lead };
    const read = {
      now: NOW,
      today: parseCalendarDate("2026-11-16"),
      sheets: [],
      paymentLines: null,
      state,
      newText: "Kedarkantha ka rate?",
    };
    const trace = startNaturalTrace(BUILT_IN_ONE_PROMPT, NOW.getTime());
    expect(dryAnswerOf({ end: "superseded" }, read, trace, NOW.getTime())).toMatchObject({
      outcome: "fallback",
      messages: [],
      actions: [{ tool: "create_task", kind: "question" }],
      trace: { outcome: "fallback", fallback: "model_failed:superseded" },
    });
  });
});

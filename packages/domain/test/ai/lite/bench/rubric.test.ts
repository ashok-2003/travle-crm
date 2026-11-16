// The bench's rubric, pure: what it marks on a finished chat, from the trace of each turn and the chat's end.
import type { LiteCase } from "@travel-crm/contracts/ai";
import { liteCase, liteFacts } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import {
  benchChecks,
  heldItems,
  inventedSpans,
  type BenchEnd,
  type BenchTurn,
} from "../../../../src/ai/bench/rubric.js";

const turn = (changes: Partial<BenchTurn> = {}): BenchTurn => ({
  customer: ["hi"],
  outcome: "replied",
  move: "greet",
  reason: null,
  why: null,
  intents: [],
  asked: null,
  heldBefore: [],
  text: null,
  filled: [],
  wrote: false,
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  ms: 0,
  ...changes,
});
const end = (changes: Partial<BenchEnd> = {}): BenchEnd => ({
  sent: ["x"],
  actions: { payment: false, files: false, booking: false, handOver: false },
  flagged: false,
  knows: [],
  ...changes,
});
const caseOf = (expected: Record<string, unknown>): LiteCase =>
  liteCase.parse({ name: "c", chat: [{ from: "customer", text: "hi" }], expect: { sent: true, ...expected } });
const verdict = (checks: { name: string; pass: boolean }[], name: string) =>
  checks.find((check) => check.name === name);

describe("the bench rubric", () => {
  it("an amount code didn't write is invented", () => {
    const text = "Total ₹12,000 for you";
    expect(inventedSpans(text, [])).toHaveLength(1);
    expect(inventedSpans(text, [{ start: 6, end: 13 }])).toEqual([]);
    const checks = benchChecks(caseOf({}), [turn({ text, wrote: true })], end());
    expect(verdict(checks, "turn 1 invented")?.pass).toBe(false);
    const filled = benchChecks(caseOf({}), [turn({ text, wrote: true, filled: [{ start: 6, end: 13 }] })], end());
    expect(verdict(filled, "turn 1 invented")?.pass).toBe(true);
  });

  it("a seat count the model typed is invented", () => {
    expect(inventedSpans("only 3 seats left", [])).toHaveLength(1);
    expect(inventedSpans("only 3 seats left", [{ start: 5, end: 12 }])).toEqual([]);
  });

  it("a seat count the agent's own write check refuses is invented here too", () => {
    for (const typed of ["sirf do seats bachi hain", "teen seat bache", "३ सीट बची", "only 3 seats", "बस दो सीटें"]) {
      expect(inventedSpans(typed, []), typed).not.toEqual([]);
    }
    expect(inventedSpans("sirf do seats bachi hain", [{ start: 5, end: 13 }])).toEqual([]);
  });

  it("a hand-over's words are always the fixed line, so it has no money_fixed mark", () => {
    const checks = benchChecks(
      caseOf({}),
      [turn({ move: "hand_over", wrote: true, text: "A person will reply" })],
      end(),
    );
    expect(verdict(checks, "turn 1 money_fixed")).toBeUndefined();
  });

  it("a booking the Write model worded fails money_fixed", () => {
    const worded = benchChecks(caseOf({}), [turn({ move: "book", wrote: true, text: "Booked" })], end());
    expect(verdict(worded, "turn 1 money_fixed")?.pass).toBe(false);
    const fixed = benchChecks(caseOf({}), [turn({ move: "book", wrote: false, text: "Booked" })], end());
    expect(verdict(fixed, "turn 1 money_fixed")?.pass).toBe(true);
  });

  it("the same model reply twice fails repeat, the same fixed line twice does not", () => {
    const model = [turn({ text: "Hello there", wrote: true }), turn({ text: " hello THERE ", wrote: true })];
    expect(verdict(benchChecks(caseOf({}), model, end()), "repeat")?.pass).toBe(false);
    const fixed = [turn({ text: "One moment", wrote: false }), turn({ text: "One moment", wrote: false })];
    expect(verdict(benchChecks(caseOf({}), fixed, end()), "repeat")?.pass).toBe(true);
  });

  it("asking for what the chat held fails repeat", () => {
    const asking = [turn({ asked: "when", heldBefore: ["when"] })];
    expect(verdict(benchChecks(caseOf({}), asking, end()), "repeat")?.pass).toBe(false);
  });

  it("the last move, the hand-over reason and knows are checked only when the case names them", () => {
    const quiet = benchChecks(caseOf({}), [turn()], end());
    expect(quiet.map((check) => check.name)).toEqual(["sent", "repeat"]);
    const named = benchChecks(
      caseOf({ move: "hand_over", handOver: "discount", knows: ["when"] }),
      [turn({ move: "hand_over", reason: "discount" })],
      end({ actions: { payment: false, files: false, booking: false, handOver: true }, knows: ["when"] }),
    );
    expect(named.filter((check) => !check.pass)).toEqual([]);
    expect(named.map((check) => check.name)).toEqual(expect.arrayContaining(["move", "handOver", "knows when"]));
    const wrong = benchChecks(
      caseOf({ move: "greet", handOver: "discount", knows: ["when"] }),
      [turn({ move: "hand_over", reason: "loop" })],
      end(),
    );
    expect(wrong.filter((check) => !check.pass).map((check) => check.name)).toEqual(["move", "handOver", "knows when"]);
  });

  it("includes, excludes, actions and flagged read the end of the chat", () => {
    const checks = benchChecks(
      caseOf({ includes: ["Manali"], excludes: ["50%"], actions: { files: true }, flagged: true }),
      [turn()],
      end({
        sent: ["Try MANALI"],
        actions: { payment: false, files: true, booking: false, handOver: false },
        flagged: true,
      }),
    );
    expect(checks.filter((check) => !check.pass)).toEqual([]);
    expect(checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(["includes 1", "excludes 1", "actions files", "flagged"]),
    );
  });

  it("heldItems reads the facts", () => {
    const facts = liteFacts.parse({ agent: "lite", adults: 2, departureId: "0192f3a0-0000-7000-8000-000000000001" });
    expect(heldItems(facts)).toEqual(["when", "people"]);
    const more = liteFacts.parse({
      agent: "lite",
      name: "Asha Rao",
      children: { count: 2, ages: [4] },
      roomType: "double",
    });
    expect(heldItems(more)).toEqual(["name", "room", "full_name"]);
  });
});

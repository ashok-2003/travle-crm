// The one agent's tools: natural's fourteen with book on the terms alone, b2b hand-overs, its trace and its test input.
import { describe, expect, it } from "vitest";
import { naturalTestAnswer, naturalDryAction } from "../../src/ai/natural-try-it.js";
import { parseToolArguments } from "../../src/ai/natural-tools.js";
import { naturalTrace } from "../../src/ai/natural-trace.js";
import { oneToolSchemas, parseOneToolArguments } from "../../src/ai/one-tools.js";
import { oneTestInput } from "../../src/ai/one-try-it.js";
import { z } from "zod";

const labels = ["T1", "T2"];
const handOver = { reason: "b2b", summary: "A travel agent asking for net rates." };
const book = { trip_id: "T1", date: "2026-12-19", adults: 2 };
const input = {
  messages: [{ from: "customer", text: "Kedarkantha 19 Dec, 2 log" }],
  state: null,
  model: "live",
  temperature: "default",
};
const trace = {
  agent: "one",
  promptVersion: "langfuse:whatsapp-agent/real-agent@3",
  promptLabel: "production",
  outcome: "replied",
  fallback: null,
  restarted: null,
  durationMs: 900,
  calls: [],
  guards: [],
  staged: [],
  flags: [],
};

describe("the one agent's tool schemas", () => {
  it("offers natural's fourteen tools, without the trip tools when the agency has no trips", () => {
    expect(oneToolSchemas({ tripLabels: labels })).toHaveLength(14);
    expect(oneToolSchemas({ tripLabels: [] }).map((tool) => tool.name)).toEqual([
      "update_lead",
      "resend_payment",
      "plan_follow_up",
      "create_task",
      "add_note",
      "hand_over",
      "suggest_close",
      "stay_quiet",
    ]);
  });

  it("books on the terms alone: full_name and customer_words are refused as unknown keys", () => {
    expect(parseOneToolArguments("book", book, labels).ok).toBe(true);
    for (const extra of [{ full_name: "Rohan Mehta" }, { customer_words: "haan" }]) {
      expect(parseOneToolArguments("book", { ...book, ...extra }, labels).ok).toBe(false);
    }
  });

  it("hands over for b2b, which natural's own parse still refuses", () => {
    expect(parseOneToolArguments("hand_over", handOver, labels)).toMatchObject({ ok: true });
    expect(parseToolArguments("hand_over", handOver, labels).ok).toBe(false);
  });

  it("names the trips in the refusal of an unknown trip_id", () => {
    expect(parseOneToolArguments("book", { ...book, trip_id: "T9" }, labels)).toEqual({
      ok: false,
      problem: "T9 isn't one of the trips; the trips are T1, T2",
    });
  });

  it("keeps the parse-only checks on the schemas it hands over", () => {
    const update = oneToolSchemas({ tripLabels: labels }).find((tool) => tool.name === "update_lead");
    expect(update?.schema.safeParse({}).success).toBe(false);
    expect(update?.schema.safeParse({ trip_id: "T1" }).success).toBe(true);
    expect(update?.schema.safeParse({ trip_id: "T9" }).success).toBe(false);
  });

  it("describes book with no customer words in its JSON Schema", () => {
    const schema = oneToolSchemas({ tripLabels: labels }).find((tool) => tool.name === "book")?.schema;
    if (schema === undefined) throw new Error("book is offered");
    const json = JSON.stringify(z.toJSONSchema(schema, { io: "input" }));
    expect(json).not.toContain("customer_words");
    expect(json).not.toContain("full_name");
    expect(json).toContain('"enum":["T1","T2"]');
  });
});

describe("the one agent's trace, dry actions and test input", () => {
  it("reads a trace of the one agent", () => {
    expect(naturalTrace.parse(trace).agent).toBe("one");
    expect(naturalTrace.safeParse({ ...trace, agent: "lite" }).success).toBe(false);
    expect(naturalTestAnswer.shape.trace.safeParse({ ...trace, agent: "natural", promptLabel: null }).success).toBe(
      true,
    );
  });

  it("reads a dry hand-over for b2b", () => {
    expect(naturalDryAction.parse({ tool: "hand_over", ...handOver }).tool).toBe("hand_over");
  });

  it("refuses a prompt choice and any unknown key in one's test input, and a temperature without Flash", () => {
    expect(oneTestInput.safeParse(input).success).toBe(true);
    expect(oneTestInput.safeParse({ ...input, prompt: "draft" }).success).toBe(false);
    expect(oneTestInput.safeParse({ ...input, extra: 1 }).success).toBe(false);
    expect(oneTestInput.safeParse({ ...input, temperature: "0.4" }).success).toBe(false);
    expect(oneTestInput.safeParse({ ...input, model: "flash", temperature: "0.4" }).success).toBe(true);
  });
});

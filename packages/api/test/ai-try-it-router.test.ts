// ai.test on the real router is Try it for the one agent: the lite turn as a dry run on a test chat, so its first model
// call is Understand. The chat and the state it carries are checked before anything runs, and only ai:manage may try it.
import { TRPCError } from "@trpc/server";
import { saveAiSettings } from "@travel-crm/domain/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { anAgency, callerOf, createHarness, type Harness } from "./forms-support.js";

const details = {
  package: null,
  place: null,
  date: null,
  adults: null,
  children: null,
  name: null,
  pickup_city: null,
  room: null,
  pay_in_full: null,
};
const understood = JSON.stringify({
  intents: [{ name: "hello", proof: "hi" }],
  details,
  open_to_other_trips: "unknown",
  lookups: [],
  language: "english",
  summary: "Said hello.",
  score: {
    chance: 40,
    label: "warm",
    reasons: ["Said hello"],
    looks_fake: false,
    fake_why: "",
    standing: "Just started",
    next_step: "Share the trips",
  },
});

const greeting = JSON.stringify({ text: "Hello! Which trip are you looking at?", cannot_answer: false });

describe("ai.test", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  /** An agency with the AI on, and a model that fills the Understand form and writes a greeting, its schemas noted. */
  async function anAiAgency(granted?: Parameters<typeof callerOf>[1]["granted"]) {
    const organizationId = await anAgency(harness, { modules: ["crm", "inbox", "ai"] });
    const schemas: (string | undefined)[] = [];
    const model: NonNullable<Context["ai"]> = {
      configured: true,
      complete: (request) => {
        schemas.push(request.schema?.name);
        return Promise.resolve({
          ok: true,
          text: request.schema?.name === "understand_form" ? understood : greeting,
          model: "memory-model",
          inputTokens: 10,
          outputTokens: 10,
        });
      },
    };
    const owner = callerOf(harness, { organizationId, context: { ai: model } });
    await harness.db.forOrg(organizationId, (tx) =>
      saveAiSettings(tx, owner.member, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    const { caller } =
      granted === undefined ? owner : callerOf(harness, { organizationId, granted, context: { ai: model } });
    return { caller, schemas };
  }

  /** The refusal's reason (its tRPC code when it has none), or "allowed". */
  const codeOf = async (call: Promise<unknown>) => {
    try {
      await call;
      return "allowed";
    } catch (error) {
      if (!(error instanceof TRPCError)) throw error;
      const cause = error.cause as { reason?: string } | undefined;
      return cause?.reason ?? error.code;
    }
  };

  const hi = [{ from: "customer" as const, text: "hi" }];

  it("runs the lite dry run: the first model call is the Understand form", async () => {
    const { caller, schemas } = await anAiAgency();
    const shown = await caller.ai.test({ messages: hi, state: null });
    expect(schemas[0]).toBe("understand_form");
    // The state to send back next turn: the lite facts and Understand's summary.
    expect(shown.state).toMatchObject({ facts: { agent: "lite" }, summary: "Said hello." });
    expect(shown.trace.intents).toEqual(["hello"]);
    expect(shown.answer).toContain("Which trip are you looking at?");
  });

  it("takes back the state it handed out", async () => {
    const { caller } = await anAiAgency();
    const first = await caller.ai.test({ messages: hi, state: null });
    const chat = [...hi, { from: "agent" as const, text: first.answer }, { from: "customer" as const, text: "ok" }];
    expect(await codeOf(caller.ai.test({ messages: chat, state: first.state }))).toBe("allowed");
  });

  it("refuses a state that does not parse, before any model call", async () => {
    const { caller, schemas } = await anAiAgency();
    const facts = { agent: "lite" };
    for (const state of [
      { facts: { agent: "grounded" }, summary: "" },
      { facts: { ...facts, adults: 0 }, summary: "" },
      { facts: { ...facts, injected: true }, summary: "" },
      { facts, summary: "x".repeat(1001) },
      { facts },
    ]) {
      expect(await codeOf(caller.ai.test({ messages: hi, state } as never))).toBe("BAD_REQUEST");
    }
    expect(schemas).toEqual([]);
  });

  it("refuses a chat that is empty, too long, or doesn't end with the customer", async () => {
    const { caller, schemas } = await anAiAgency();
    const line = (from: "customer" | "agent") => ({ from, text: "hello" });
    for (const messages of [
      [],
      Array.from({ length: 41 }, () => line("customer")),
      [line("customer"), line("agent")],
    ]) {
      expect(await codeOf(caller.ai.test({ messages, state: null }))).toBe("BAD_REQUEST");
    }
    expect(
      await codeOf(caller.ai.test({ messages: [{ from: "customer", text: "x".repeat(1001) }], state: null })),
    ).toBe("BAD_REQUEST");
    expect(schemas).toEqual([]);
  });

  it("refuses a member without ai:manage", async () => {
    const { caller, schemas } = await anAiAgency(["ai:suggest", "inbox:view", "inbox:reply"]);
    expect(await codeOf(caller.ai.test({ messages: hi, state: null }))).toBe("MISSING_PERMISSION");
    expect(schemas).toEqual([]);
  });
});

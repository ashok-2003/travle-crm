// ai.testNatural on the real router is Try it for the natural agent: one dry turn of the sales agent on a test chat. The
// chat and the state it carries are checked before anything runs, and only ai:manage may try it.
import { TRPCError } from "@trpc/server";
import { saveAiSettings } from "@travel-crm/domain/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { anAgency, callerOf, createHarness, type Harness } from "./forms-support.js";

describe("ai.testNatural", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  /** An agency with the AI on and a model that greets, every request it was asked kept. */
  async function anAiAgency(options: { granted?: Parameters<typeof callerOf>[1]["granted"]; ready?: boolean } = {}) {
    const organizationId = await anAgency(harness, { modules: ["crm", "inbox", "ai"] });
    const asked: Parameters<NonNullable<Context["ai"]>["complete"]>[0][] = [];
    const model: NonNullable<Context["ai"]> = {
      configured: true,
      complete: (request) => {
        asked.push(request);
        if (options.ready === false) return Promise.resolve({ ok: false, reason: "not_configured" });
        return Promise.resolve({
          ok: true,
          text: "Hi! Which trip are you looking at?",
          model: "memory-model",
          inputTokens: 10,
          outputTokens: 10,
          finishReason: "stop",
        });
      },
    };
    const owner = callerOf(harness, { organizationId, context: { ai: model } });
    await harness.db.forOrg(organizationId, (tx) =>
      saveAiSettings(tx, owner.member, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    const { caller } =
      options.granted === undefined
        ? owner
        : callerOf(harness, { organizationId, granted: options.granted, context: { ai: model } });
    return { caller, asked };
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
  const live = { model: "live", temperature: "default" } as const;

  it("refuses a member without ai:manage", async () => {
    const { caller, asked } = await anAiAgency({ granted: ["ai:suggest", "inbox:view", "inbox:reply"] });
    expect(await codeOf(caller.ai.testNatural({ messages: hi, state: null, ...live }))).toBe("MISSING_PERMISSION");
    expect(asked).toEqual([]);
  });

  it("refuses a chat that ends with the agent's line", async () => {
    const { caller, asked } = await anAiAgency();
    const messages = [...hi, { from: "agent" as const, text: "Hello!" }];
    expect(await codeOf(caller.ai.testNatural({ messages, state: null, ...live }))).toBe("BAD_REQUEST");
    expect(asked).toEqual([]);
  });

  it("refuses unknown keys in the state", async () => {
    const { caller, asked } = await anAiAgency();
    const first = await caller.ai.testNatural({ messages: hi, state: null, ...live });
    const { facts, lead } = first.state;
    for (const state of [
      { facts: { ...facts, injected: true }, lead },
      { facts, lead: { ...lead, injected: true } },
      { facts, lead, injected: true },
    ]) {
      expect(await codeOf(caller.ai.testNatural({ messages: hi, state, ...live }))).toBe("BAD_REQUEST");
    }
    expect(asked).toHaveLength(1);
  });

  it("asks as the new agent: sales_agent, tools offered, no temperature", async () => {
    const { caller, asked } = await anAiAgency();
    await caller.ai.testNatural({ messages: hi, state: null, ...live });
    const [first] = asked;
    expect(first?.feature).toBe("sales_agent");
    expect(first?.tools?.length).toBeGreaterThan(0);
    for (const request of asked) {
      expect(request).not.toHaveProperty("model");
      expect(request).not.toHaveProperty("temperature");
    }
  });

  it("passes Try it's Flash and 0.4 on to the request", async () => {
    const { caller, asked } = await anAiAgency();
    await caller.ai.testNatural({ messages: hi, state: null, model: "flash", temperature: "0.4" });
    expect(asked.length).toBeGreaterThan(0);
    for (const request of asked) {
      expect(request).toMatchObject({ model: "google/gemini-3.5-flash", temperature: 0.4 });
    }
  });

  it("refuses a temperature for any model but Gemini Flash", async () => {
    const { caller, asked } = await anAiAgency();
    expect(
      await codeOf(caller.ai.testNatural({ messages: hi, state: null, model: "live", temperature: "0.4" } as never)),
    ).toBe("BAD_REQUEST");
    expect(asked).toEqual([]);
  });

  it("hands the state back for the next turn", async () => {
    const { caller } = await anAiAgency();
    const first = await caller.ai.testNatural({ messages: hi, state: null, ...live });
    expect(first.state.facts.agent).toBe("natural");
    expect(first.messages).toEqual(["Hi! Which trip are you looking at?"]);
    const chat = [...hi, ...first.history, { from: "customer" as const, text: "ok" }];
    const second = await caller.ai.testNatural({ messages: chat, state: first.state, ...live });
    expect(second.state.facts.agent).toBe("natural");
  });

  it("answers AI_NOT_READY when the server has no model for the agent", async () => {
    const { caller } = await anAiAgency({ ready: false });
    expect(await codeOf(caller.ai.testNatural({ messages: hi, state: null, ...live }))).toBe("AI_NOT_READY");
  });
});

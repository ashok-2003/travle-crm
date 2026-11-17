// ai.testOne on the real router is Try it for the one agent: one dry turn of the tool agent on a test chat. It answers
// AI_NOT_READY without a model or a tool agent, takes no prompt choice, and shows what the customer would get.
import { TRPCError } from "@trpc/server";
import { saveAiSettings, type ToolAgent } from "@travel-crm/domain/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { anAgency, callerOf, createHarness, type Harness } from "./forms-support.js";

describe("ai.testOne", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  const words = "Hi! Which trip are you looking at?";
  /** A tool agent that answers at once, every run it was asked kept. */
  const answering = () => {
    const runs: Parameters<ToolAgent["run"]>[0][] = [];
    const toolAgent: ToolAgent = {
      run: (input) => {
        runs.push(input);
        return Promise.resolve({ end: "answered", text: words, model: "memory-model", transcript: [], calls: 1 });
      },
    };
    return { toolAgent, runs };
  };

  async function anAiAgency(options: { ready?: boolean; toolAgent?: ToolAgent | null } = {}) {
    const organizationId = await anAgency(harness, { modules: ["crm", "inbox", "ai"] });
    const model: NonNullable<Context["ai"]> = {
      configured: options.ready !== false,
      complete: () => Promise.resolve({ ok: false, reason: "not_configured" }),
    };
    const toolAgent = options.toolAgent === null ? undefined : options.toolAgent;
    const context = { ai: model, ...(toolAgent === undefined ? {} : { toolAgent }) };
    const owner = callerOf(harness, { organizationId, context });
    await harness.db.forOrg(organizationId, (tx) =>
      saveAiSettings(tx, owner.member, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    return owner.caller;
  }

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

  it("answers AI_NOT_READY without a model or a tool agent", async () => {
    const noModel = await anAiAgency({ ready: false, toolAgent: answering().toolAgent });
    expect(await codeOf(noModel.ai.testOne({ messages: hi, state: null, ...live }))).toBe("AI_NOT_READY");
    const noAgent = await anAiAgency({ toolAgent: null });
    expect(await codeOf(noAgent.ai.testOne({ messages: hi, state: null, ...live }))).toBe("AI_NOT_READY");
  });

  it("refuses a prompt choice", async () => {
    const agent = answering();
    const caller = await anAiAgency({ toolAgent: agent.toolAgent });
    for (const prompt of ["live", "draft"]) {
      expect(await codeOf(caller.ai.testOne({ messages: hi, state: null, ...live, prompt } as never))).toBe(
        "BAD_REQUEST",
      );
    }
    expect(agent.runs).toEqual([]);
  });

  it("answers what the customer would get", async () => {
    const agent = answering();
    const caller = await anAiAgency({ toolAgent: agent.toolAgent });
    const shown = await caller.ai.testOne({ messages: hi, state: null, ...live });
    expect(shown).toMatchObject({ outcome: "replied", messages: [words], trace: { promptVersion: "built-in-one-2" } });
    expect(agent.runs).toHaveLength(1);
    expect(agent.runs[0]?.request).toMatchObject({ feature: "sales_agent" });
    expect(agent.runs[0]?.request).not.toHaveProperty("model");
    const flash = await caller.ai.testOne({ messages: hi, state: null, model: "flash", temperature: "0.4" });
    expect(flash.messages).toEqual([words]);
    expect(agent.runs[1]?.request).toMatchObject({ model: "google/gemini-3.5-flash", temperature: 0.4 });
  });
});

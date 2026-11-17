// ai.testOne on the real router is Try it for the one agent: one dry turn of the tool agent on a test chat. It answers
// AI_NOT_READY without a model or a tool agent, takes no model, temperature or prompt choice, runs only for an agency on the one agent, and shows what the customer would get.
import { TRPCError } from "@trpc/server";
import { saveAiSettings, setAgent, type ToolAgent } from "@travel-crm/domain/ai";
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

  async function anAiAgency(
    options: {
      ready?: boolean;
      toolAgent?: ToolAgent | null;
      prompts?: Context["prompts"];
      agent?: "lite" | "one";
    } = {},
  ) {
    const organizationId = await anAgency(harness, { modules: ["crm", "inbox", "ai"] });
    const model: NonNullable<Context["ai"]> = {
      configured: options.ready !== false,
      complete: () => Promise.resolve({ ok: false, reason: "not_configured" }),
    };
    const toolAgent = options.toolAgent === null ? undefined : options.toolAgent;
    const context = {
      ai: model,
      ...(toolAgent === undefined ? {} : { toolAgent }),
      ...(options.prompts === undefined ? {} : { prompts: options.prompts }),
    };
    const owner = callerOf(harness, { organizationId, context });
    await harness.db.forOrg(organizationId, (tx) =>
      saveAiSettings(tx, owner.member, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    await harness.db.forOrg(organizationId, (tx) => setAgent(tx, owner.member, options.agent ?? "one"));
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

  it("answers AI_NOT_READY without a model or a tool agent", async () => {
    const noModel = await anAiAgency({ ready: false, toolAgent: answering().toolAgent });
    expect(await codeOf(noModel.ai.testOne({ messages: hi, state: null }))).toBe("AI_NOT_READY");
    const noAgent = await anAiAgency({ toolAgent: null });
    expect(await codeOf(noAgent.ai.testOne({ messages: hi, state: null }))).toBe("AI_NOT_READY");
  });

  it("refuses a model, a temperature or a prompt choice", async () => {
    const agent = answering();
    const caller = await anAiAgency({ toolAgent: agent.toolAgent });
    for (const choice of [{ prompt: "draft" }, { model: "flash" }, { temperature: "0.4" }]) {
      expect(await codeOf(caller.ai.testOne({ messages: hi, state: null, ...choice }))).toBe("BAD_REQUEST");
    }
    expect(agent.runs).toEqual([]);
  });

  it("says which agent Try it runs, and refuses a turn for any other", async () => {
    const agent = answering();
    const lite = await anAiAgency({ toolAgent: agent.toolAgent, agent: "lite" });
    expect(await lite.ai.testAgent()).toEqual({ agent: "lite" });
    expect(await codeOf(lite.ai.testOne({ messages: hi, state: null }))).toBe("AGENT_CHANGED");
    expect(agent.runs).toEqual([]);
    expect(await (await anAiAgency({ toolAgent: agent.toolAgent })).ai.testAgent()).toEqual({ agent: "one" });
  });

  it("answers what the customer would get", async () => {
    const agent = answering();
    const caller = await anAiAgency({ toolAgent: agent.toolAgent });
    const shown = await caller.ai.testOne({ messages: hi, state: null });
    expect(shown).toMatchObject({ outcome: "replied", messages: [words], trace: { promptVersion: "built-in-one-3" } });
    expect(agent.runs).toHaveLength(1);
    expect(agent.runs[0]?.request).toMatchObject({ feature: "sales_agent" });
    expect(agent.runs[0]?.request).not.toHaveProperty("model");
    expect(agent.runs[0]?.request).not.toHaveProperty("temperature");
  });

  /** Langfuse's prompts as a fake: a production version, each ask kept. */
  const langfuse = () => {
    const asked: { name: string; label: string; fresh: boolean }[] = [];
    const prompts: NonNullable<Context["prompts"]> = {
      textPrompt: (name, label, request = {}) => {
        asked.push({ name, label, fresh: request.fresh === true });
        if (label === "production") return Promise.resolve({ name, version: 4, label, text: "The live prompt." });
        return Promise.resolve(null);
      },
    };
    return { prompts, asked };
  };

  it("runs on Langfuse's production prompt, like live turns, and on the built-in text when there is none", async () => {
    const fake = langfuse();
    const caller = await anAiAgency({ toolAgent: answering().toolAgent, prompts: fake.prompts });
    const shown = await caller.ai.testOne({ messages: hi, state: null });
    expect(shown.trace).toMatchObject({
      promptVersion: "langfuse:whatsapp-agent/real-agent@4",
      promptLabel: "production",
    });
    expect(fake.asked).toEqual([{ name: "whatsapp-agent/real-agent", label: "production", fresh: false }]);

    const other = await anAiAgency({ toolAgent: answering().toolAgent });
    const builtIn = await other.ai.testOne({ messages: hi, state: null });
    expect(builtIn.trace).toMatchObject({ promptVersion: "built-in-one-3", promptLabel: null });
  });
});

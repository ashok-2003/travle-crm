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
  async function anAiAgency(
    options: {
      granted?: Parameters<typeof callerOf>[1]["granted"];
      ready?: boolean;
      tracing?: Context["tracing"];
      prompts?: Context["prompts"];
    } = {},
  ) {
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
    const context = {
      ai: model,
      ...(options.tracing === undefined ? {} : { tracing: options.tracing }),
      ...(options.prompts === undefined ? {} : { prompts: options.prompts }),
    };
    const owner = callerOf(harness, { organizationId, context });
    await harness.db.forOrg(organizationId, (tx) =>
      saveAiSettings(tx, owner.member, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    const { caller } =
      options.granted === undefined ? owner : callerOf(harness, { organizationId, granted: options.granted, context });
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

  it("refuses a prompt choice that is neither live nor draft", async () => {
    const { caller, asked } = await anAiAgency();
    for (const prompt of ["production", "langfuse:whatsapp-agent/natural-system@3", ""]) {
      expect(await codeOf(caller.ai.testNatural({ messages: hi, state: null, ...live, prompt } as never))).toBe(
        "BAD_REQUEST",
      );
    }
    expect(asked).toEqual([]);
  });

  /** Langfuse's prompts as a fake: the live one at version 4, the draft at 7 when there is one, each ask kept. */
  const langfuse = (withDraft: boolean) => {
    const asked: { label: string; fresh: boolean }[] = [];
    const prompts: NonNullable<Context["prompts"]> = {
      textPrompt: (name, label, request = {}) => {
        asked.push({ label, fresh: request.fresh === true });
        const version = label === "production" ? 4 : label === "draft" && withDraft ? 7 : null;
        if (name !== "whatsapp-agent/natural-system" || version === null) return Promise.resolve(null);
        return Promise.resolve({ name, version, label, text: `The ${label} prompt for {{agency_name}}.` });
      },
    };
    return { prompts, asked };
  };
  const systemOf = (request: Parameters<NonNullable<Context["ai"]>["complete"]>[0] | undefined) =>
    request?.messages[0]?.content ?? "";

  it("runs on Langfuse's live prompt, filled in for the agency, and on the built-in text without Langfuse", async () => {
    const fake = langfuse(true);
    const { caller, asked } = await anAiAgency({ prompts: fake.prompts });
    const shown = await caller.ai.testNatural({ messages: hi, state: null, ...live });
    expect(shown.trace).toMatchObject({
      promptVersion: "langfuse:whatsapp-agent/natural-system@4",
      promptLabel: "production",
    });
    expect(systemOf(asked[0])).toMatch(/^The production prompt for Asha Travels\./);
    expect(fake.asked).toEqual([{ label: "production", fresh: false }]);

    const without = await anAiAgency();
    const builtIn = await without.caller.ai.testNatural({ messages: hi, state: null, ...live });
    expect(builtIn.trace).toMatchObject({ promptVersion: "built-in-1", promptLabel: null });
  });

  it("runs on the draft when asked, read fresh, and on the live prompt when there is no draft", async () => {
    const fake = langfuse(true);
    const { caller, asked } = await anAiAgency({ prompts: fake.prompts });
    const drafted = await caller.ai.testNatural({ messages: hi, state: null, ...live, prompt: "draft" });
    expect(drafted.trace).toMatchObject({
      promptVersion: "langfuse:whatsapp-agent/natural-system@7",
      promptLabel: "draft",
    });
    expect(systemOf(asked[0])).toMatch(/^The draft prompt for Asha Travels\./);
    // The live prompt is read beside the draft, so a draft that isn't there costs no second wait.
    expect(fake.asked).toEqual([
      { label: "draft", fresh: true },
      { label: "production", fresh: false },
    ]);

    const noDraft = langfuse(false);
    const other = await anAiAgency({ prompts: noDraft.prompts });
    const fellBack = await other.caller.ai.testNatural({ messages: hi, state: null, ...live, prompt: "draft" });
    expect(fellBack.trace).toMatchObject({
      promptVersion: "langfuse:whatsapp-agent/natural-system@4",
      promptLabel: "production",
    });
    expect(noDraft.asked).toEqual([
      { label: "draft", fresh: true },
      { label: "production", fresh: false },
    ]);
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

  it("is one traced Try it turn of its test chat when the server traces, its session the chat's id", async () => {
    const turns: { name: string; sessionId: string; tags: readonly string[] | undefined }[] = [];
    const notes: unknown[] = [];
    const tracing: NonNullable<Context["tracing"]> = {
      turn: (start, work) => {
        turns.push({ name: start.name, sessionId: start.sessionId, tags: start.tags });
        return work();
      },
      note: (note) => void notes.push(note.output),
      step: (_start, work) => work(),
      generation: () => ({ end: () => undefined }),
      flush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    const { caller } = await anAiAgency({ tracing });
    const chatId = "0192f3a0-0000-7000-8000-0000000000ff";
    const shown = await caller.ai.testNatural({ messages: hi, state: null, ...live, chatId });
    await caller.ai.testNatural({ messages: hi, state: null, ...live });
    expect(turns).toEqual([
      {
        name: "whatsapp-agent.natural.try-it",
        sessionId: `try-it:${chatId}`,
        tags: ["whatsapp-agent", "natural", "try-it"],
      },
      {
        name: "whatsapp-agent.natural.try-it",
        sessionId: expect.stringMatching(/^try-it:[0-9a-f-]{36}$/) as unknown,
        tags: ["whatsapp-agent", "natural", "try-it"],
      },
    ]);
    expect(turns[1]?.sessionId).not.toBe(turns[0]?.sessionId);
    expect(notes[0]).toEqual({ role: "assistant", content: shown.messages.join("\n\n") });
  });

  it("answers AI_NOT_READY when the server has no model for the agent", async () => {
    const { caller } = await anAiAgency({ ready: false });
    expect(await codeOf(caller.ai.testNatural({ messages: hi, state: null, ...live }))).toBe("AI_NOT_READY");
  });
});

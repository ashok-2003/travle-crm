// What the Langfuse prompts adapter says about a fetch that failed: nothing on the console (the SDK's own logger is
// silenced), and one line on the repo's Logger per prompt per quiet window, by name, label, reason and status, never the
// error's message. A label Langfuse doesn't have is no failure: a debug line at most.
import { setTimeout as wait } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createMemoryLogger } from "../../src/logging/index.js";
import { createLangfusePrompts, type LangfusePromptsOptions } from "../../src/prompts/index.js";
import { answerVersion3, json, NAME, startStandIn, type StandIn } from "./stand-in.js";

let standIn: StandIn;
let consoleCalls: MockInstance[] = [];
beforeAll(async () => {
  standIn = await startStandIn();
});
afterAll(() => standIn.close());
beforeEach(() => {
  standIn.asked.length = 0;
  standIn.answer = answerVersion3;
  consoleCalls = (["error", "warn", "info", "debug", "log"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

const consoleWritten = () => consoleCalls.flatMap((spy) => spy.mock.calls);

const open = (more: Partial<LangfusePromptsOptions> = {}) => {
  const logger = createMemoryLogger();
  const prompts = createLangfusePrompts({
    publicKey: "pk-lf-test",
    secretKey: "sk-lf-test",
    baseUrl: standIn.baseUrl,
    logger,
    ...more,
  });
  return { prompts, logger };
};

describe("the Langfuse prompts' logging", () => {
  it("writes nothing to the console when a fetch fails, and logs it once per quiet window", async () => {
    standIn.answer = (_request, response) => {
      json(response, 500, { message: "boom: the database said no" });
    };
    const { prompts, logger } = open({ retryAfterMs: 300 });
    expect(await prompts.textPrompt(NAME, "production")).toBeNull();
    expect(await prompts.textPrompt(NAME, "production")).toBeNull();
    expect(standIn.asked).toHaveLength(2);
    expect(logger.entries).toEqual([
      expect.objectContaining({
        level: "warn",
        source: "langfuse-prompts",
        prompt: NAME,
        label: "production",
        reason: "refused",
        status: 500,
        errorName: expect.any(String) as unknown,
      }),
    ]);
    expect(JSON.stringify(logger.entries)).not.toContain("boom");

    await wait(350);
    await prompts.textPrompt(NAME, "production");
    expect(logger.entries).toHaveLength(2);
    expect(consoleWritten()).toEqual([]);
  });

  it("logs a Langfuse that hangs as a timeout, once, and nothing on the console", async () => {
    standIn.answer = () => undefined;
    const { prompts, logger } = open({ timeoutMs: 100, retryAfterMs: 60_000 });
    expect(await prompts.textPrompt(NAME, "production")).toBeNull();
    expect(await prompts.textPrompt(NAME, "production")).toBeNull();
    expect(logger.entries).toEqual([
      expect.objectContaining({ level: "warn", prompt: NAME, label: "production", reason: "timeout" }),
    ]);
    await wait(700);
    expect(consoleWritten()).toEqual([]);
  });

  it("takes a label Langfuse doesn't have as no failure: a debug line, nothing on the console", async () => {
    standIn.answer = (_request, response) => {
      json(response, 404, { message: "Prompt not found" });
    };
    const { prompts, logger } = open();
    expect(await prompts.textPrompt(NAME, "draft", { fresh: true })).toBeNull();
    expect(logger.entries).toEqual([
      expect.objectContaining({ level: "debug", prompt: NAME, label: "draft", status: 404 }),
    ]);
    expect(consoleWritten()).toEqual([]);
  });

  it("logs a prompt that isn't a text prompt, and writes nothing on the console when a background refresh fails", async () => {
    const { prompts, logger } = open({ cacheTtlSeconds: 0.1 });
    await prompts.textPrompt(NAME, "production");
    standIn.answer = (_request, response) => {
      json(response, 500, { message: "boom" });
    };
    await wait(150);
    // Stale: the cached copy at once, and a refresh behind it that fails.
    expect(await prompts.textPrompt(NAME, "production")).toMatchObject({ version: 3 });
    await wait(100);
    expect(consoleWritten()).toEqual([]);

    standIn.answer = (_request, response) => {
      json(response, 200, { ...{ name: NAME, version: 2, labels: [], tags: [] }, type: "chat", prompt: [] });
    };
    expect(await prompts.textPrompt(NAME, "chat-shaped")).toBeNull();
    expect(logger.entries).toEqual([
      expect.objectContaining({ level: "warn", prompt: NAME, label: "chat-shaped", reason: "not_text" }),
    ]);
  });
});

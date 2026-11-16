// Langfuse's settings: both keys or neither, the address with them (https in production), a valid environment name, and
// blanks as unset. Unset, the process traces nothing; set, it traces into the environment named, or NODE_ENV's.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createMemoryTracing, noTracing } from "@travel-crm/integrations/tracing";
import { describe, expect, it } from "vitest";
import { createAiModel } from "../src/ai-services.js";
import { loadEnvironment } from "../src/environment.js";
import { tracingOf } from "../src/langfuse-settings.js";

const production = {
  DATABASE_URL: "postgresql://app_runtime:runtime@localhost:55432/travel_crm",
  BETTER_AUTH_SECRET: "Zq8+3vT!m2L#9xR@w4K$p7N&c1H^b6J%",
  BETTER_AUTH_URL: "https://app.example.in",
  APP_URL: "https://app.example.in",
  S3_BUCKET: "travel-crm",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  SMTP_HOST: "smtp.example.in",
  EMAIL_FROM_ADDRESS: "no-reply@example.in",
  VAPID_PUBLIC_KEY: "public-key",
  VAPID_PRIVATE_KEY: "private-key",
  VAPID_SUBJECT: "mailto:ops@example.in",
};
const langfuse = {
  LANGFUSE_PUBLIC_KEY: "pk-lf-00000000-0000-0000-0000-000000000000",
  LANGFUSE_SECRET_KEY: "sk-lf-00000000-0000-0000-0000-000000000000",
  LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com",
};

describe("Langfuse's settings", () => {
  it("are all optional, and a compose file's blanks leave tracing off", () => {
    const environment = loadEnvironment({
      ...production,
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
      LANGFUSE_BASE_URL: "",
      LANGFUSE_TRACING_ENVIRONMENT: "",
    });
    expect(environment.LANGFUSE_PUBLIC_KEY).toBeUndefined();
    expect(tracingOf(environment, environment.NODE_ENV)).toBe(noTracing);
  });

  it("take both keys and the address together", () => {
    expect(loadEnvironment({ ...production, ...langfuse })).toMatchObject(langfuse);
    expect(() => loadEnvironment({ ...production, ...langfuse, LANGFUSE_SECRET_KEY: "" })).toThrow(
      /LANGFUSE_SECRET_KEY: is needed with LANGFUSE_PUBLIC_KEY/,
    );
    expect(() => loadEnvironment({ ...production, ...langfuse, LANGFUSE_PUBLIC_KEY: "" })).toThrow(
      /LANGFUSE_PUBLIC_KEY: is needed with LANGFUSE_SECRET_KEY/,
    );
    expect(() => loadEnvironment({ ...production, ...langfuse, LANGFUSE_BASE_URL: "" })).toThrow(
      /LANGFUSE_BASE_URL: is needed with the Langfuse keys/,
    );
    expect(() => loadEnvironment({ ...production, LANGFUSE_BASE_URL: langfuse.LANGFUSE_BASE_URL })).toThrow(
      /LANGFUSE_BASE_URL: is only for use with the Langfuse keys/,
    );
  });

  it("refuse keys swapped or mistyped, without saying them", () => {
    let message = "";
    try {
      loadEnvironment({
        ...production,
        ...langfuse,
        LANGFUSE_PUBLIC_KEY: langfuse.LANGFUSE_SECRET_KEY,
        LANGFUSE_SECRET_KEY: langfuse.LANGFUSE_PUBLIC_KEY,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toMatch(/LANGFUSE_PUBLIC_KEY/);
    expect(message).toMatch(/LANGFUSE_SECRET_KEY/);
    expect(message).not.toContain("00000000");
  });

  it("send over https in production, and name a valid environment", () => {
    expect(() =>
      loadEnvironment({ ...production, ...langfuse, LANGFUSE_BASE_URL: "http://us.cloud.langfuse.com" }),
    ).toThrow(/LANGFUSE_BASE_URL: must be an https address in production/);
    expect(
      loadEnvironment({
        ...production,
        ...langfuse,
        NODE_ENV: "development",
        LANGFUSE_BASE_URL: "http://localhost:3000",
      }).LANGFUSE_BASE_URL,
    ).toBe("http://localhost:3000");
    expect(loadEnvironment({ ...production, ...langfuse, LANGFUSE_TRACING_ENVIRONMENT: "staging" })).toMatchObject({
      LANGFUSE_TRACING_ENVIRONMENT: "staging",
    });
    for (const name of ["Production", "langfuse-prod", "with space"]) {
      expect(() => loadEnvironment({ ...production, ...langfuse, LANGFUSE_TRACING_ENVIRONMENT: name })).toThrow(
        /LANGFUSE_TRACING_ENVIRONMENT/,
      );
    }
  });

  it("make the process's tracing Langfuse's when the keys are set", async () => {
    const tracing = tracingOf({ ...langfuse, LANGFUSE_BASE_URL: "http://127.0.0.1:9" }, "test");
    expect(tracing).not.toBe(noTracing);
    expect(await tracing.turn({ name: "t", sessionId: "s", organizationId: "o" }, () => Promise.resolve(1))).toBe(1);
    await tracing.shutdown();
  });
});

describe("the AI model a process builds", () => {
  it("traces every call through the process's tracing", async () => {
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            model: "gemini-2.5-flash",
            usage: { prompt_tokens: 12, completion_tokens: 3 },
            choices: [{ message: { content: "Namaste!" }, finish_reason: "stop" }],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const tracing = createMemoryTracing();
      const model = createAiModel(
        {
          AI_API_KEY: "test-key-0123456789",
          AI_BASE_URL: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
          AI_CHAT_MODELS: ["gemini-2.5-flash"],
          AI_FAST_MODELS: undefined,
          AI_ZERO_RETENTION: undefined,
          AI_BACKUP_API_KEY: undefined,
          AI_BACKUP_BASE_URL: undefined,
          AI_BACKUP_CHAT_MODELS: undefined,
          AI_BACKUP_FAST_MODELS: undefined,
          OPENROUTER_API_KEY: undefined,
          AI_SUGGEST_MODELS: [],
          AI_SCORE_MODELS: [],
          AI_TEST_SERVER_URL: undefined,
        },
        tracing,
      );
      const result = await model?.complete({
        feature: "suggest_reply",
        messages: [{ role: "user", content: "Hi" }],
      });
      expect(result).toMatchObject({ ok: true, text: "Namaste!" });
      expect(tracing.generations.map((call) => [call.start.name, call.end?.model, call.end?.usage])).toEqual([
        ["ai.suggest_reply", "gemini-2.5-flash", { input: 12, output: 3 }],
      ]);
    } finally {
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    }
  });
});

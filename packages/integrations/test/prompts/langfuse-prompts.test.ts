// The Langfuse prompts adapter against a local stand-in for Langfuse's prompts API: a text prompt by name and label, served
// from the SDK's cache after its first fetch (and fetched again in the background once stale), asked afresh when the call
// says so, and null for anything else. A Langfuse that is slow, down or wrong costs a call at most its bound, and nothing
// throws.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as wait } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLangfusePrompts, type LangfusePromptsOptions } from "../../src/prompts/index.js";
import { answerVersion3, json, NAME, startStandIn, textPrompt, type StandIn } from "./stand-in.js";

let standIn: StandIn;
beforeAll(async () => {
  standIn = await startStandIn();
});
afterAll(() => standIn.close());
beforeEach(() => {
  standIn.asked.length = 0;
  standIn.answer = answerVersion3;
});

const open = (more: Partial<LangfusePromptsOptions> = {}) =>
  createLangfusePrompts({ publicKey: "pk-lf-test", secretKey: "sk-lf-test", baseUrl: standIn.baseUrl, ...more });

describe("the Langfuse prompts", () => {
  it("fetches a text prompt by name and label, with the keys", async () => {
    const prompts = open();
    expect(await prompts.textPrompt(NAME, "production")).toEqual({
      name: NAME,
      version: 3,
      label: "production",
      text: "Hi, I'm {{agent_name}}.",
    });
    expect(standIn.asked).toEqual([
      {
        path: `/api/public/v2/prompts/${encodeURIComponent(NAME)}`,
        label: "production",
        authorization: `Basic ${Buffer.from("pk-lf-test:sk-lf-test").toString("base64")}`,
      },
    ]);
  });

  it("serves a prompt from the cache after its first fetch, and fetches it again in the background once stale", async () => {
    const prompts = open({ cacheTtlSeconds: 0.3 });
    await prompts.textPrompt(NAME, "production");
    expect(await prompts.textPrompt(NAME, "production")).toMatchObject({ version: 3 });
    expect(standIn.asked).toHaveLength(1);

    standIn.answer = (_request, response) => {
      json(response, 200, textPrompt(4, "Version four."));
    };
    await wait(350);
    // Stale: the cached version at once, the new one fetched behind it (and fresh for the next 0.3 s).
    expect(await prompts.textPrompt(NAME, "production")).toMatchObject({ version: 3 });
    await wait(50);
    expect(await prompts.textPrompt(NAME, "production")).toMatchObject({ version: 4, text: "Version four." });
    expect(standIn.asked).toHaveLength(2);
  });

  it("keeps each label apart, and asks Langfuse every time a call wants it fresh", async () => {
    const prompts = open();
    standIn.answer = (request, response) => {
      const label = new URL(request.url ?? "/", "http://localhost").searchParams.get("label") ?? "";
      json(response, 200, textPrompt(label === "draft" ? 7 : 3, `The ${label} words.`, [label]));
    };
    expect(await prompts.textPrompt(NAME, "production")).toMatchObject({ version: 3, label: "production" });
    expect(await prompts.textPrompt(NAME, "draft", { fresh: true })).toMatchObject({ version: 7, label: "draft" });
    expect(await prompts.textPrompt(NAME, "draft", { fresh: true })).toMatchObject({ version: 7 });
    expect(standIn.asked.map((request) => request.label)).toEqual(["production", "draft", "draft"]);
  });

  it("answers null for a prompt or label Langfuse doesn't have, a chat prompt, or no words", async () => {
    const prompts = open();
    standIn.answer = (_request, response) => {
      json(response, 404, { message: "Prompt not found" });
    };
    expect(await prompts.textPrompt(NAME, "draft")).toBeNull();
    standIn.answer = (_request, response) => {
      json(response, 200, { ...textPrompt(2, ""), type: "chat", prompt: [{ role: "system", content: "Hi" }] });
    };
    expect(await prompts.textPrompt(NAME, "chat-shaped")).toBeNull();
    standIn.answer = (_request, response) => {
      json(response, 200, textPrompt(2, "   \n"));
    };
    expect(await prompts.textPrompt(NAME, "blank")).toBeNull();
  });

  it("answers null, never throwing, when Langfuse refuses the keys, fails or is unreachable", async () => {
    standIn.answer = (_request, response) => {
      json(response, 401, { message: "Invalid credentials" });
    };
    expect(await open().textPrompt(NAME, "production")).toBeNull();
    standIn.answer = (_request, response) => {
      json(response, 500, { message: "boom" });
    };
    expect(await open().textPrompt(NAME, "production")).toBeNull();
    standIn.answer = (_request, response) => {
      response.writeHead(200, { "content-type": "text/html" }).end("<html>not json</html>");
    };
    expect(await open().textPrompt(NAME, "production")).toBeNull();

    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const closedUrl = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`;
    await new Promise<void>((resolve) =>
      closed.close(() => {
        resolve();
      }),
    );
    expect(await open({ baseUrl: closedUrl }).textPrompt(NAME, "production")).toBeNull();
  });

  it("waits at most its bound for a Langfuse that hangs, then answers null at once for a while", async () => {
    standIn.answer = () => undefined;
    const prompts = open({ timeoutMs: 200, retryAfterMs: 400 });
    const started = Date.now();
    expect(await prompts.textPrompt(NAME, "production")).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);

    const again = Date.now();
    expect(await prompts.textPrompt(NAME, "production")).toBeNull();
    expect(Date.now() - again).toBeLessThan(50);
    expect(standIn.asked).toHaveLength(1);

    await wait(450);
    standIn.answer = (_request, response) => {
      json(response, 200, textPrompt(3, "Back again."));
    };
    expect(await prompts.textPrompt(NAME, "production")).toMatchObject({ text: "Back again." });
    expect(standIn.asked).toHaveLength(2);
  });

  it("keeps a prompt that comes after the bound in the cache, for the next call to use at once", async () => {
    standIn.answer = (_request, response) => {
      setTimeout(() => {
        json(response, 200, textPrompt(5, "Late but here."));
      }, 250);
    };
    const prompts = open({ timeoutMs: 100, retryAfterMs: 60_000 });
    expect(await prompts.textPrompt(NAME, "production")).toBeNull();
    await wait(350);
    expect(await prompts.textPrompt(NAME, "production")).toMatchObject({ version: 5, text: "Late but here." });
    expect(standIn.asked).toHaveLength(1);
  });
});

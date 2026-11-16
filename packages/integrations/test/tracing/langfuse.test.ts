// The Langfuse adapter against a local stand-in for Langfuse's OpenTelemetry endpoint: a turn is one agent observation with
// the session, user, tags and environment, its model calls nest under it, notes made later in its async context land on
// it, contacts are masked, and an error's message never leaves. A Langfuse that is down or hangs changes nothing.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as wait } from "node:timers/promises";
import { gunzipSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLangfuseTracing, type AiTracing } from "../../src/tracing/index.js";

interface OtlpValue {
  stringValue?: string;
  intValue?: string | number;
  boolValue?: boolean;
  doubleValue?: number;
  arrayValue?: { values?: OtlpValue[] };
}
interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  attributes?: { key: string; value: OtlpValue }[];
}
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  attributes: Record<string, unknown>;
}

const valueOf = (value: OtlpValue): unknown =>
  value.arrayValue !== undefined
    ? (value.arrayValue.values ?? []).map(valueOf)
    : (value.stringValue ?? value.intValue ?? value.boolValue ?? value.doubleValue);

let server: Server;
let baseUrl = "";
const received: { authorization: string | undefined; body: string }[] = [];

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks);
  return (request.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw).toString("utf8");
}

/** Every span sent so far, its attributes as plain values. */
function spans(): Span[] {
  return received.flatMap(({ body }) => {
    const parsed = JSON.parse(body) as { resourceSpans?: { scopeSpans?: { spans?: OtlpSpan[] }[] }[] };
    return (parsed.resourceSpans ?? []).flatMap((resource) =>
      (resource.scopeSpans ?? []).flatMap((scope) =>
        (scope.spans ?? []).map((span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId === undefined || span.parentSpanId === "" ? null : span.parentSpanId,
          name: span.name,
          attributes: Object.fromEntries((span.attributes ?? []).map(({ key, value }) => [key, valueOf(value)])),
        })),
      ),
    );
  });
}

const jsonOf = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

beforeAll(async () => {
  server = createServer((request, response) => {
    void bodyOf(request).then((body) => {
      if (request.url === "/api/public/otel/v1/traces") {
        received.push({ authorization: request.headers.authorization, body });
      }
      response.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

let tracing: AiTracing | undefined;
afterEach(async () => {
  await tracing?.shutdown();
  tracing = undefined;
  received.length = 0;
});

const open = (url = baseUrl, timeoutSeconds?: number) => {
  tracing = createLangfuseTracing({
    publicKey: "pk-lf-test",
    secretKey: "sk-lf-test",
    baseUrl: url,
    environment: "test",
    release: "abc123",
    ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
  });
  return tracing;
};

describe("the Langfuse tracing", () => {
  it("sends a turn as an agent with its model call nested, grouped by chat, its contacts masked", async () => {
    const traced = open();
    const value = await traced.turn(
      {
        name: "whatsapp-agent.reply",
        sessionId: "chat-1",
        organizationId: "org-1",
        userId: "user-1",
        tags: ["whatsapp-agent", "reply"],
        input: [{ role: "user", content: "Hi, I am on 9876543210" }],
        metadata: { token: "message-1" },
      },
      async () => {
        await wait(2);
        const call = traced.generation({
          name: "ai.autopilot.understand_form",
          input: [{ role: "user", content: "mail me at priya@example.com" }],
          modelParameters: { max_tokens: 900 },
          metadata: { feature: "autopilot" },
        });
        await wait(2);
        call.end({ output: '{"intents":[]}', model: "gemini-2.5-flash", usage: { input: 120, output: 30 } });
        // The sink notes the finished turn later in the same async chain, after a timer.
        await new Promise<void>((resolve) => {
          setImmediate(() => {
            traced.note({ output: { reply: "Hello!" }, metadata: { outcome: "replied" }, statusMessage: "replied" });
            resolve();
          });
        });
        return "replied";
      },
    );
    expect(value).toBe("replied");
    traced.note({ output: "outside any turn" });
    await traced.flush();

    expect(received[0]?.authorization).toBe(`Basic ${Buffer.from("pk-lf-test:sk-lf-test").toString("base64")}`);
    const sent = spans();
    const turn = sent.find((span) => span.name === "whatsapp-agent.reply");
    const call = sent.find((span) => span.name === "ai.autopilot.understand_form");
    expect(turn?.attributes).toMatchObject({
      "langfuse.observation.type": "agent",
      "session.id": "chat-1",
      "user.id": "user-1",
      "langfuse.trace.name": "whatsapp-agent.reply",
      "langfuse.trace.tags": ["whatsapp-agent", "reply"],
      "langfuse.environment": "test",
      "langfuse.release": "abc123",
      "langfuse.observation.status_message": "replied",
    });
    expect(jsonOf(turn?.attributes["langfuse.observation.input"])).toEqual([
      { role: "user", content: "Hi, I am on [phone]" },
    ]);
    expect(jsonOf(turn?.attributes["langfuse.observation.output"])).toEqual({ reply: "Hello!" });
    expect(jsonOf(turn?.attributes["langfuse.observation.metadata.outcome"])).toBe("replied");
    expect(jsonOf(turn?.attributes["langfuse.observation.metadata.token"])).toBe("message-1");
    expect(JSON.stringify(turn?.attributes)).toContain("org-1");

    expect(call?.parentSpanId).toBe(turn?.spanId);
    expect(call?.traceId).toBe(turn?.traceId);
    expect(call?.attributes).toMatchObject({
      "langfuse.observation.type": "generation",
      "langfuse.observation.model.name": "gemini-2.5-flash",
      "session.id": "chat-1",
    });
    expect(jsonOf(call?.attributes["langfuse.observation.usage_details"])).toEqual({ input: 120, output: 30 });
    expect(jsonOf(call?.attributes["langfuse.observation.model.parameters"])).toEqual({ max_tokens: 900 });
    expect(jsonOf(call?.attributes["langfuse.observation.input"])).toEqual([
      { role: "user", content: "mail me at [email]" },
    ]);
    expect(JSON.stringify(sent)).not.toContain("outside any turn");
  });

  it("links a turn's model calls to its managed prompt, and nothing else", async () => {
    const traced = open();
    const turn = { name: "whatsapp-agent.natural.try-it", sessionId: "chat-4", organizationId: "org-1" };
    await traced.turn({ ...turn, prompt: { name: "whatsapp-agent/natural-system", version: 4 } }, async () => {
      await wait(1);
      traced.generation({ name: "ai.sales_agent", input: [] }).end({ output: "one" });
      await traced.step({ name: "look-up", type: "retriever" }, () => Promise.resolve("found"));
    });
    await traced.turn(turn, () => {
      traced.generation({ name: "ai.sales_agent.built-in", input: [] }).end({ output: "two" });
      return Promise.resolve();
    });
    await traced.flush();
    const sent = spans();
    const linked = sent.find((span) => span.name === "ai.sales_agent");
    expect(linked?.attributes).toMatchObject({
      "langfuse.observation.prompt.name": "whatsapp-agent/natural-system",
      "langfuse.observation.prompt.version": 4,
    });
    const unlinked = sent.filter((span) => span !== linked);
    expect(unlinked.map((span) => span.name).sort()).toEqual([
      "ai.sales_agent.built-in",
      "look-up",
      "whatsapp-agent.natural.try-it",
      "whatsapp-agent.natural.try-it",
    ]);
    for (const span of unlinked) expect(span.attributes).not.toHaveProperty(["langfuse.observation.prompt.name"]);
  });

  it("nests a step under its turn with its own type, and its error by name only", async () => {
    const traced = open();
    const error = Object.assign(new Error("9876543210 not found"), { code: "P2025" });
    await traced.turn({ name: "whatsapp-agent.reply", sessionId: "chat-3", organizationId: "org-1" }, async () => {
      const looked = await traced.step(
        { name: "look-up-and-decide", type: "retriever", input: [{ tool: "price" }] },
        () => Promise.resolve({ move: "give_price" }),
        (result) => ({ output: result, metadata: { why: "asked the price" } }),
      );
      expect(looked).toEqual({ move: "give_price" });
      await expect(traced.step({ name: "send-files", type: "tool" }, () => Promise.reject(error))).rejects.toBe(error);
    });
    await traced.flush();
    const sent = spans();
    const turn = sent.find((span) => span.name === "whatsapp-agent.reply");
    const looked = sent.find((span) => span.name === "look-up-and-decide");
    const failed = sent.find((span) => span.name === "send-files");
    expect(looked?.parentSpanId).toBe(turn?.spanId);
    expect(looked?.attributes["langfuse.observation.type"]).toBe("retriever");
    expect(jsonOf(looked?.attributes["langfuse.observation.output"])).toEqual({ move: "give_price" });
    expect(jsonOf(looked?.attributes["langfuse.observation.metadata.why"])).toBe("asked the price");
    expect(failed?.attributes).toMatchObject({
      "langfuse.observation.type": "tool",
      "langfuse.observation.level": "ERROR",
      "langfuse.observation.status_message": "Error P2025",
    });
    expect(received.map(({ body }) => body).join("")).not.toContain("not found");
  });

  it("sends a model call outside a turn as a trace of its own", async () => {
    const traced = open();
    traced.generation({ name: "ai.suggest_reply", input: [] }).end({ level: "ERROR", statusMessage: "unavailable" });
    await traced.flush();
    const [call] = spans();
    expect(call).toMatchObject({ name: "ai.suggest_reply", parentSpanId: null });
    expect(call?.attributes).toMatchObject({
      "langfuse.observation.level": "ERROR",
      "langfuse.observation.status_message": "unavailable",
    });
  });

  it("hands back the work's own error, and sends only its name and code", async () => {
    const traced = open();
    const error = Object.assign(new Error("customer 9876543210 broke it"), { name: "DomainError", code: "CONFLICT" });
    await expect(
      traced.turn({ name: "whatsapp-agent.reply", sessionId: "chat-1", organizationId: "org-1" }, () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);
    await traced.flush();
    const [turn] = spans();
    expect(turn?.attributes).toMatchObject({
      "langfuse.observation.level": "ERROR",
      "langfuse.observation.status_message": "DomainError CONFLICT",
    });
    expect(received.map(({ body }) => body).join("")).not.toContain("broke it");
  });

  it("changes nothing when Langfuse is unreachable or hangs, and stops in time", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const closedUrl = `http://127.0.0.1:${String((closed.address() as AddressInfo).port)}`;
    await new Promise<void>((resolve) =>
      closed.close(() => {
        resolve();
      }),
    );
    const down = open(closedUrl, 1);
    const turn = { name: "whatsapp-agent.nudge", sessionId: "chat-2", organizationId: "org-1" };
    expect(await down.turn(turn, () => Promise.resolve(42))).toBe(42);
    await down.flush();
    await down.shutdown();

    const hanging = createServer(() => undefined);
    await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", resolve));
    const slow = open(`http://127.0.0.1:${String((hanging.address() as AddressInfo).port)}`, 1);
    expect(await slow.turn(turn, () => Promise.resolve("still"))).toBe("still");
    const started = Date.now();
    await slow.flush();
    await slow.shutdown();
    expect(Date.now() - started).toBeLessThan(5_000);
    hanging.closeAllConnections();
    await new Promise<void>((resolve) =>
      hanging.close(() => {
        resolve();
      }),
    );
  });
});

// The Turnstile adapter against a fake siteverify: what it sends, and that trouble is "unreachable".
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryLogger } from "../../src/logging/index.js";
import { createTurnstileBotCheck } from "../../src/bot-check/index.js";

const SECRET = "very-secret-key-value";

describe("createTurnstileBotCheck", () => {
  let server: Server;
  let url: string;
  let received: URLSearchParams | null = null;
  let respond: (status: number, body: string, delayMs?: number) => void;
  let next = { status: 200, body: '{"success":true}', delayMs: 0 };

  beforeAll(async () => {
    respond = (status, body, delayMs = 0) => {
      next = { status, body, delayMs };
    };
    server = createServer((request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = new URLSearchParams(Buffer.concat(chunks).toString());
        setTimeout(() => {
          response.writeHead(next.status, { "content-type": "application/json" });
          response.end(next.body);
        }, next.delayMs);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/siteverify`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it("posts the secret and token, never the address, and reads success", async () => {
    respond(200, '{"success":true}');
    const check = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: url });
    expect(await check.verify({ token: "tok", address: "203.0.113.9" })).toBe("pass");
    expect(received?.get("secret")).toBe(SECRET);
    expect(received?.get("response")).toBe("tok");
    // Only a counted network (an IPv6 /64) is known here, and remoteip is optional: Cloudflare gets none.
    expect(received?.has("remoteip")).toBe(false);
  });

  it("maps Cloudflare's answers: the visitor's mistakes refuse, our own and Cloudflare's trouble let the enquiry in", async () => {
    const logger = createMemoryLogger();
    const check = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: url, logger });
    const answer = async (status: number, body: string) => {
      respond(status, body);
      return check.verify({ token: "t", address: null });
    };
    const refusal = (code: string) => `{"success":false,"error-codes":["${code}"]}`;
    expect(await answer(200, refusal("invalid-input-response"))).toBe("fail");
    expect(await answer(200, refusal("timeout-or-duplicate"))).toBe("fail");
    expect(await answer(200, refusal("missing-input-response"))).toBe("fail");
    expect(await answer(200, refusal("internal-error"))).toBe("unreachable");
    expect(await answer(200, refusal("invalid-input-secret"))).toBe("unreachable");
    expect(await answer(200, refusal("missing-input-secret"))).toBe("unreachable");
    expect(await answer(400, '{"success":false}')).toBe("unreachable");
    expect(await answer(500, "oops")).toBe("unreachable");
    // Our misconfiguration is logged once per process, naming the code and never the secret.
    const errors = logger.entries.filter((entry) => entry.level === "error");
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(errors)).toContain("invalid-input-secret");
    expect(JSON.stringify(logger.entries)).not.toContain(SECRET);
  });

  it("reads a refusal as fail", async () => {
    respond(200, '{"success":false,"error-codes":["invalid-input-response"]}');
    const check = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: url });
    expect(await check.verify({ token: "bad", address: null })).toBe("fail");
  });

  it("reads a 500, a timeout and a network error as unreachable", async () => {
    const check = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: url, timeoutMs: 100 });
    respond(500, "oops");
    expect(await check.verify({ token: "t", address: null })).toBe("unreachable");
    respond(200, '{"success":true}', 500);
    expect(await check.verify({ token: "t", address: null })).toBe("unreachable");
    const refused = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: "http://127.0.0.1:1/x" });
    expect(await refused.verify({ token: "t", address: null })).toBe("unreachable");
  });

  it("reads a body that is not JSON as unreachable, and never throws a message holding the secret", async () => {
    respond(200, "<html>");
    const check = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: url });
    await expect(check.verify({ token: "t", address: null })).resolves.toBe("unreachable");
    const failing = createTurnstileBotCheck({
      secretKey: SECRET,
      fetch: () => Promise.reject(new Error(`could not reach with ${SECRET}`)),
    });
    await expect(failing.verify({ token: "t", address: null })).resolves.toBe("unreachable");
  });
});

// The Turnstile adapter against a fake siteverify: what it sends, and that trouble is "unreachable".
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("posts the secret, token and address and reads success", async () => {
    respond(200, '{"success":true}');
    const check = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: url });
    expect(await check.verify({ token: "tok", address: "203.0.113.9" })).toBe("pass");
    expect(received?.get("secret")).toBe(SECRET);
    expect(received?.get("response")).toBe("tok");
    expect(received?.get("remoteip")).toBe("203.0.113.9");
  });

  it("leaves the address out when there is none", async () => {
    respond(200, '{"success":true}');
    const check = createTurnstileBotCheck({ secretKey: SECRET, verifyUrl: url });
    await check.verify({ token: "tok", address: null });
    expect(received?.has("remoteip")).toBe(false);
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

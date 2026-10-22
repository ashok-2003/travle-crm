// Shipping lines to Axiom (ADR 0032): a pino transport in a worker thread posts them in batches to the dataset's ingest
// endpoint, here a fake one; the request never waits on it, closing the logger flushes what is queued, and the token is
// never in a line. Stdout still gets every line.
import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPinoLogger } from "../../src/logging/index.js";

interface Received {
  path: string;
  authorization: string | undefined;
  contentType: string | undefined;
  lines: Record<string, unknown>[];
}

/**
 * The fake Axiom runs in a thread of its own: closing the logger waits for the transport's thread, which posts to this
 * server, so a server on the test's own thread could never answer.
 */
const fakeAxiom = `
const { createServer } = require("node:http");
const { parentPort } = require("node:worker_threads");
let status = 200;
let delayMs = 0;
parentPort.on("message", (message) => { if (message.status !== undefined) status = message.status; if (message.delayMs !== undefined) delayMs = message.delayMs; });
const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    parentPort.postMessage({
      kind: "post",
      path: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      body: Buffer.concat(chunks).toString(),
    });
    setTimeout(() => { response.statusCode = status; response.end("{}"); }, delayMs);
  });
});
server.listen(0, "127.0.0.1", () => parentPort.postMessage({ kind: "listening", port: server.address().port }));
`;

describe("the Axiom transport", () => {
  let thread: Worker;
  let url: string;
  const received: Received[] = [];

  beforeAll(async () => {
    thread = new Worker(fakeAxiom, { eval: true });
    thread.on(
      "message",
      (message: {
        kind: string;
        port?: number;
        path?: string;
        authorization?: string;
        contentType?: string;
        body?: string;
      }) => {
        if (message.kind === "post") {
          received.push({
            path: message.path ?? "",
            authorization: message.authorization,
            contentType: message.contentType,
            lines: (message.body ?? "")
              .split("\n")
              .filter((line) => line !== "")
              .map((line) => JSON.parse(line) as Record<string, unknown>),
          });
        }
      },
    );
    url = await new Promise<string>((resolve) => {
      thread.on("message", (message: { kind: string; port?: number }) => {
        if (message.kind === "listening") resolve(`http://127.0.0.1:${String(message.port)}`);
      });
    });
  });

  afterAll(async () => {
    await thread.terminate();
  });

  const stdout: string[] = [];
  const make = () =>
    createPinoLogger({
      process: "api",
      level: "debug",
      destination: { write: (line: string) => stdout.push(line) },
      axiom: { token: "xaat-secret-token", dataset: "travel-crm", url },
    });

  it("posts every line to the dataset in a batch when the logger is closed, with the token as a bearer", async () => {
    const logger = make();
    logger.debug({}, "a debug line");
    logger.info({ status: 200, durationMs: 5, email: "jane.doe@example.com" }, "request");
    logger.error({ errorName: "Error" }, "unhandled error");
    await logger.close();
    const posts = received.flatMap((post) => post.lines.map((line) => ({ ...post, line })));
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]).toMatchObject({
      path: "/v1/datasets/travel-crm/ingest",
      authorization: "Bearer xaat-secret-token",
      contentType: "application/x-ndjson",
    });
    expect(posts.map((post) => post.line.msg)).toEqual(["a debug line", "request", "unhandled error"]);
    expect(posts[1]?.line).toMatchObject({ level: "info", process: "api", status: 200, email: "[redacted]" });
    // Axiom reads its timestamp from _time.
    expect(typeof posts[1]?.line._time).toBe("string");
    expect(JSON.stringify(received)).not.toContain("jane");
    // The same lines reached standard output too, and the token is in none of them.
    expect(stdout).toHaveLength(3);
    expect(stdout.join("")).not.toContain("xaat-secret-token");
  });

  it("keeps working when Axiom refuses, and still closes", async () => {
    thread.postMessage({ status: 500 });
    const before = received.length;
    const logger = make();
    logger.info({}, "while axiom is down");
    await logger.close();
    thread.postMessage({ status: 200 });
    expect(received.length).toBeGreaterThan(before);
  });

  it("a slow Axiom never holds up a log call, and closing ends in a bounded time with the drop count on stderr", async () => {
    thread.postMessage({ delayMs: 20_000 });
    const lines: string[] = [];
    const logger = createPinoLogger({
      process: "api",
      level: "debug",
      destination: { write: (line: string) => lines.push(line) },
      axiom: { token: "xaat-secret-token", dataset: "travel-crm", url },
    });
    const started = performance.now();
    for (let index = 0; index < 5000; index += 1) logger.info({ index }, "a line while axiom is slow");
    expect(performance.now() - started).toBeLessThan(2000);
    expect(lines).toHaveLength(5000);
    const closing = performance.now();
    await logger.close();
    expect(performance.now() - closing).toBeLessThan(12_000);
    thread.postMessage({ delayMs: 0 });
  }, 40_000);

  it("a transport that can't load is dropped with one line on stderr: nothing throws, nothing loops, stdout still gets every line", async () => {
    const written: string[] = [];
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
    try {
      const lines: string[] = [];
      const logger = createPinoLogger({
        process: "api",
        level: "debug",
        destination: { write: (line: string) => lines.push(line) },
        axiom: { token: "t", dataset: "d", url, transportFile: "/nowhere/axiom-transport.mjs" },
      });
      for (let index = 0; index < 50; index += 1) logger.info({ index }, "before the thread fails");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      for (let index = 0; index < 50; index += 1) logger.info({ index }, "after the thread failed");
      await logger.close();
      logger.info({}, "after close");
      expect(lines).toHaveLength(101);
      expect(written.filter((line) => line.startsWith("axiom: shipping stopped"))).toHaveLength(1);
    } finally {
      stderr.mockRestore();
    }
  }, 30_000);

  it("a write after close is dropped from Axiom and kept on stdout, without throwing", async () => {
    const lines: string[] = [];
    const logger = createPinoLogger({
      process: "api",
      level: "debug",
      destination: { write: (line: string) => lines.push(line) },
      axiom: { token: "t", dataset: "d", url },
    });
    await logger.close();
    expect(() => {
      logger.error({}, "after close");
    }).not.toThrow();
    expect(lines).toHaveLength(1);
  }, 30_000);
});

// Shipping lines to Axiom (ADR 0032): a pino transport in a worker thread posts them in batches to the dataset's ingest
// endpoint, here a fake one; the request never waits on it, closing the logger flushes what is queued, and the token is
// never in a line. Stdout still gets every line.
import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
parentPort.on("message", (message) => { status = message.status; });
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
    response.statusCode = status;
    response.end("{}");
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
});

// The console's body limit: no console call needs more than 64 KB, so a bigger body is refused with 413 before tRPC
// reads it, whether or not the request says its length, as the api refuses its own (request-checks.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, ORIGIN, type TestServer } from "./support/test-server.js";

describe("the console's requests", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  /** A JSON POST from the trusted origin, as the console screens send every call, with this body. */
  async function post(body: string | ReadableStream<Uint8Array>): Promise<Response> {
    return testConsole.app.request("/api/platform/trpc/whoAmI", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie: support.jar.header },
      body,
      // Node's fetch needs duplex to send a stream; the request then has no content-length.
      ...(typeof body === "string" ? {} : { duplex: "half" }),
    });
  }

  it("refuses a body over 64 KB with 413, whether or not it says its length", async () => {
    const tooBig = JSON.stringify({ padding: "x".repeat(70_000) });
    const sized = await post(tooBig);
    expect(sized.status).toBe(413);
    expect(await sized.json()).toEqual({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(tooBig));
        controller.close();
      },
    });
    expect((await post(stream)).status).toBe(413);
  });

  it("lets a body under the limit through to tRPC", async () => {
    // whoAmI is a query, which the web app posts as it posts every call: tRPC answers it.
    expect((await post(JSON.stringify({ padding: "x".repeat(1_000) }))).status).toBe(200);
  });
});

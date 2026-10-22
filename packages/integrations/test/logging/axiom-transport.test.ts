// The transport itself, in this thread with a fake fetch: what it posts, and what it says on stderr when Axiom refuses
// (once, the status code alone) or never answers.
import { afterEach, describe, expect, it, vi } from "vitest";
import axiomTransport from "../../src/logging/axiom-transport.js";

const options = { token: "xaat-secret-token", dataset: "d", url: "http://axiom.test" };

/** Writes lines into the transport as pino would and ends it, waiting for its close. */
async function ship(lines: Record<string, unknown>[]): Promise<void> {
  const stream = axiomTransport(options);
  const closed = new Promise<void>((resolve) => stream.once("close", resolve));
  for (const line of lines) stream.write(`${JSON.stringify(line)}\n`);
  stream.end();
  await closed;
}

describe("the Axiom transport, in this thread", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("says once that Axiom refused, with the status code alone, never the body or the token", async () => {
    const written: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
    const fetchMock = vi.fn(() => Promise.resolve(new Response("secret body xaat-secret-token", { status: 403 })));
    vi.stubGlobal("fetch", fetchMock);
    // Two batches of 100, each refused: the first refusal is said, the second is not.
    await ship(Array.from({ length: 250 }, (_, index) => ({ level: "info", msg: "line", index })));
    expect(written.filter((line) => line.startsWith("axiom: ingest"))).toEqual(["axiom: ingest answered 403\n"]);
    expect(written.join("")).not.toMatch(/secret/);
    expect(written.join("")).toMatch(
      /axiom: 250 log lines could not be shipped|axiom: \d+ log lines could not be shipped/,
    );
  });

  it("says once that Axiom did not answer", async () => {
    const written: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
    vi.stubGlobal("fetch", () => Promise.reject(new Error("connect ECONNREFUSED")));
    await ship([{ level: "info", msg: "line" }]);
    expect(written.filter((line) => line.startsWith("axiom: ingest"))).toEqual(["axiom: ingest did not answer\n"]);
  });
});

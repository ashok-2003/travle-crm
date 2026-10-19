// The services build the Google adapter from the service accounts, and none without them.
import { describe, expect, it } from "vitest";
import { processLog } from "../src/process-log.js";
import { createServices } from "../src/services.js";
import { testEnvironment } from "./support/environment.js";

const key = (name: string) => ({ client_email: `${name}@project.iam.gserviceaccount.com`, private_key: "PEM" });

describe("the Google Sheets adapter in the services", () => {
  it("builds no Google adapter without accounts, and the real one with them", async () => {
    const without = createServices(testEnvironment(), processLog("api"));
    const withAccounts = createServices(
      testEnvironment({
        GOOGLE_SHEETS_SERVICE_ACCOUNTS: JSON.stringify([key("one"), key("two")]),
        SHEETS_HASH_KEY: "k".repeat(40),
      }),
      processLog("api"),
    );
    try {
      expect(without.google).toBeNull();
      expect(withAccounts.google?.accounts()).toEqual([
        { index: 0, email: "one@project.iam.gserviceaccount.com" },
        { index: 1, email: "two@project.iam.gserviceaccount.com" },
      ]);
    } finally {
      await without.close();
      await withAccounts.close();
    }
  });

  it("points the adapter at the journeys' fake Google when the test server is named", async () => {
    const requests: string[] = [];
    const server = startRecordingServer(requests);
    const services = createServices(
      testEnvironment({
        GOOGLE_SHEETS_SERVICE_ACCOUNTS: JSON.stringify(key("one")),
        SHEETS_HASH_KEY: "k".repeat(40),
        GOOGLE_SHEETS_TEST_SERVER_URL: (await server).url,
      }),
      processLog("api"),
    );
    try {
      await expect(services.google?.describe(0, "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aaa")).rejects.toMatchObject({
        reason: "unavailable",
      });
      expect(requests).toEqual(["Bearer test-token /v4/spreadsheets/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aaa"]);
    } finally {
      await services.close();
      (await server).stop();
    }
  });
});

/** A server that records the request and answers nothing useful. */
async function startRecordingServer(requests: string[]) {
  const { createServer } = await import("node:http");
  const server = createServer((request, response) => {
    requests.push(`${request.headers.authorization ?? ""} ${(request.url ?? "").split("?")[0] ?? ""}`);
    response.statusCode = 500;
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { url: `http://127.0.0.1:${String(port)}`, stop: () => server.close() };
}

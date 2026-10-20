// The services build the Google adapter from the service accounts, and none without them.
import { generateKeyPairSync } from "node:crypto";
import { createIsolatedDatabase } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { forgetServiceAccounts } from "../src/console-environment.js";
import { loadEnvironment } from "../src/environment.js";
import { processLog } from "../src/process-log.js";
import { createServices } from "../src/services.js";
import { testEnvironment, testEnvironmentVariables } from "./support/environment.js";

const pem = generateKeyPairSync("ec", { namedCurve: "P-256" })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const key = (name: string) => ({ client_email: `${name}@project.iam.gserviceaccount.com`, private_key: pem });

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

  it("builds no Google adapter in the console, though the host handed it the accounts (SC5)", async () => {
    const variables = testEnvironmentVariables({
      GOOGLE_SHEETS_SERVICE_ACCOUNTS: JSON.stringify(key("one")),
      SHEETS_HASH_KEY: "k".repeat(40),
    });
    const services = createServices(loadEnvironment(forgetServiceAccounts(variables)), processLog("console"));
    try {
      expect(services.google).toBeNull();
    } finally {
      await services.close();
    }
  });

  it("refuses to start with a SHEETS_HASH_KEY that differs from the stored one, before any other check (SC8)", async () => {
    const isolated = await createIsolatedDatabase(inject("dbUrls"));
    const environment = (hashKey: string) =>
      testEnvironment({ DATABASE_URL: isolated.urls.runtime, SHEETS_HASH_KEY: hashKey });
    const first = createServices(environment("rQ7vK2mXz9LpT4wNb8Ys5HdJ3cFe6UgA"), processLog("api"));
    const second = createServices(environment("wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug"), processLog("worker"));
    try {
      // The bucket is not reachable in these tests, so the first start fails there, after storing the check value.
      await expect(first.start()).rejects.not.toThrow(/SHEETS_HASH_KEY/);
      await expect(second.start()).rejects.toThrow(/SHEETS_HASH_KEY: differs/);
    } finally {
      await first.close();
      await second.close();
      await isolated.drop();
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

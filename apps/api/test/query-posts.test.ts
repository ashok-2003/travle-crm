// Queries sent as POSTs (the web app sends every call so, keeping inputs out of URLs and access logs): the api answers
// them as the queries they are, so a read-only organization still reads while its changes are refused, and holds them
// to the posts' rules: the web app's origin, and JSON.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, ORIGIN, type TestServer } from "./support/test-server.js";

describe("queries sent as POSTs", () => {
  let server: TestServer;
  let owner: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    const agency = await createTestAgency(server);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    owner = await signedInOwner(server, agency);
  });

  afterAll(async () => {
    await server.close();
  });

  const post = (path: string, input: unknown, headers: Record<string, string>) =>
    server.app.request(`/api/trpc/${path}?batch=1`, {
      method: "POST",
      headers: { cookie: owner.header, ...headers },
      body: JSON.stringify({ 0: input }),
    });
  const fromTheApp = { origin: ORIGIN, "content-type": "application/json" };

  it("answers a query posted as JSON from the web app, as a view the read-only organization may still make", async () => {
    const searched = await post("destinations.search", { query: "goa" }, fromTheApp);
    expect(searched.status).toBe(200);
    expect(await searched.json()).toEqual([{ result: { data: [] } }]);
    const rename = { destinationId: "0199e7a0-0000-7000-8000-0000000000d1", name: "Goa" };
    const renamed = await post("destinations.rename", rename, fromTheApp);
    expect(renamed.status).toBe(403);
    expect(JSON.stringify(await renamed.json())).toContain("ORGANIZATION_READ_ONLY");
  });

  it("refuses a posted query without the web app's origin, or not as JSON", async () => {
    expect((await post("destinations.search", {}, { "content-type": "application/json" })).status).toBe(403);
    const foreign = { origin: "https://evil.example", "content-type": "application/json" };
    expect((await post("destinations.search", {}, foreign)).status).toBe(403);
    expect((await post("destinations.search", {}, { origin: ORIGIN, "content-type": "text/plain" })).status).toBe(415);
  });
});

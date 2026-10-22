// The request line through the real app (ADR 0032): who called is known once the session is read, a refusal carries
// its reason, and a person's data in the path, the query or an error never reaches the line.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { mutate, query } from "./support/trpc.js";

describe("the request line through the app", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  const lastLine = () => server.logger.entries.at(-1);

  it("names the procedure, and the organization and user of a signed-in call", async () => {
    const owner = await signedInOwner(server, agency);
    const response = await query(server, "me.get", owner);
    expect(lastLine()).toMatchObject({
      level: "info",
      msg: "request",
      method: "GET",
      route: "/api/trpc",
      procedures: ["me.get"],
      status: 200,
      organizationId: agency.organizationId,
      userId: agency.owner.userId,
    });
    expect(response.headers.get("x-request-id")).toBe(lastLine()?.requestId);
  });

  it("warns on a refusal with its status code, and on a permission refusal its reason", async () => {
    await query(server, "me.get");
    expect(lastLine()).toMatchObject({ level: "warn", status: 401, refusalCode: "UNAUTHORIZED", reason: null });
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "sunil", roleKey: "sales" }),
    );
    await mutate(server, "settings.setTwoFactorRequirement", { required: false }, sales);
    expect(lastLine()).toMatchObject({
      level: "warn",
      status: 403,
      refusalCode: "FORBIDDEN",
      reason: "MISSING_PERMISSION",
    });
  });

  it("writes health checks at debug", async () => {
    await server.app.request("/health");
    expect(lastLine()).toMatchObject({ level: "debug", route: "/health", status: 200 });
  });

  it("keeps a search, an email and a share link's token out of the line", async () => {
    const owner = await signedInOwner(server, agency);
    await query(server, "me.get", owner, { search: "jane.doe@example.com", phone: "+91 98765 43210" });
    await server.app.request(`/p/${"a".repeat(65)}?email=jane.doe@example.com`, {
      headers: { "x-forwarded-for": "203.0.113.50" },
    });
    expect(lastLine()).toMatchObject({ route: "/p/:token" });
    expect(JSON.stringify(server.logger.entries)).not.toMatch(/jane|98765|aaaaaaaa/);
  });
});

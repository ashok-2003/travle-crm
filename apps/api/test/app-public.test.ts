// The app's public form routes (spec 5.1): reachable with no session, outside sign-in's rate limit, and answering a
// fault generically while the log keeps only its names.
import { afterAll, describe, expect, it } from "vitest";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { agencyWithOpenForm, freshAddress, getForm } from "./support/website-form.js";

describe("the public routes in the app", () => {
  const servers: TestServer[] = [];
  const serverWith = (...args: Parameters<typeof createTestServer>) => {
    const server = createTestServer(...args);
    servers.push(server);
    return server;
  };
  afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  it("answers /api/public/website-forms/<key> without a session or a cookie", async () => {
    const server = serverWith();
    const open = await agencyWithOpenForm(server);
    const response = await server.app.request(`/api/public/website-forms/${open.key}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ available: true });
  });

  it("is unaffected by the sign-in rate limit", async () => {
    // Sign-in allows 3 attempts in 10 seconds from one address; the form page counts on its own limits.
    const server = serverWith({ rateLimit: true });
    const open = await agencyWithOpenForm(server);
    const address = freshAddress();
    for (let call = 0; call < 6; call += 1) expect((await getForm(server, open.key, address)).status).toBe(200);
  });

  it("answers an error nothing handled generically, and logs it by names", async () => {
    const leak = new Error("Jane Doe at 98765 43210 broke the limiter");
    const server = serverWith({}, { rateLimiter: { hit: () => Promise.reject(leak) } });
    const open = await agencyWithOpenForm(server);
    const response = await getForm(server, open.key);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" });
    const logs = JSON.stringify(server.logger.entries);
    expect(logs).toContain("unhandled error");
    expect(logs).toContain("/api/public");
    expect(logs).not.toMatch(/Jane Doe|98765/);
    expect(logs).not.toContain(open.key.slice(22));
  });
});

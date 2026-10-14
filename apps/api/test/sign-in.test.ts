// Signing in through the HTTP app (spec 6.3): by email or by organization code and username, with no self sign-up,
// session cookies a browser keeps, and Better Auth's organization endpoints closed to clients.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  signInWithCode,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

describe("sign-in", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    const ownerAccess = await server.identity.resolveAccess(agency.owner.userId, agency.organizationId);
    if (!ownerAccess) throw new Error("owner has no access");
    await server.identity.staff.create(ownerAccess, {
      name: "Ravi",
      username: "Ravi",
      roleKey: "sales",
      temporaryPassword: "ravi-password-1",
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("answers the health check", async () => {
    const response = await server.app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("has no self sign-up", async () => {
    const response = await postJson(server, "/api/auth/sign-up/email", {
      email: "stranger@example.test",
      password: "stranger-password-1",
      name: "Stranger",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await server.platform.user.count({ where: { email: "stranger@example.test" } })).toBe(0);
  });

  it("signs in by email, in any letter case, into an HTTP-only session cookie and a 5-minute cache cookie", async () => {
    const jar = new CookieJar();
    const response = await signInByEmail(server, jar, agency.owner.email.toUpperCase(), agency.owner.password);
    expect(response.status).toBe(200);
    expect(jar.names()).toEqual(["better-auth.session_token", "better-auth.session_data"]);
    const [sessionCookie] = response.headers.getSetCookie();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  it("signs in with organization code and username, both in any letter case", async () => {
    const jar = new CookieJar();
    const response = await signInWithCode(server, jar, {
      orgCode: agency.code.toLowerCase(),
      username: "RAVI",
      password: "ravi-password-1",
    });
    expect(response.status).toBe(200);
    expect(jar.names()).toContain("better-auth.session_token");
  });

  it("refuses a wrong password, a wrong organization code, or someone else's organization", async () => {
    const other = await createTestAgency(server);
    const attempts = [
      { orgCode: agency.code, username: "ravi", password: "wrong-password-1" },
      { orgCode: "NOSUCHORG", username: "ravi", password: "ravi-password-1" },
      { orgCode: other.code, username: "ravi", password: "ravi-password-1" },
    ];
    for (const attempt of attempts) {
      expect((await postJson(server, "/api/auth/sign-in/org", attempt)).status).toBe(401);
    }
  });

  it("answers a malformed organization sign-in with 400", async () => {
    for (const body of [{}, { orgCode: "S!", username: "ravi", password: "x" }, "not json"]) {
      expect((await postJson(server, "/api/auth/sign-in/org", body)).status).toBe(400);
    }
  });

  it("refuses a sign-in posted from another website", async () => {
    const response = await postJson(
      server,
      "/api/auth/sign-in/email",
      { email: agency.owner.email, password: agency.owner.password },
      undefined,
      { origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
  });

  it("closes Better Auth's organization endpoints to clients", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, agency.owner.email, agency.owner.password);
    const update = await postJson(
      server,
      "/api/auth/organization/update-member-role",
      { memberId: "x", role: "x" },
      jar,
    );
    expect(update.status).toBe(404);
    const list = await server.app.request("/api/auth/organization/list", { headers: { cookie: jar.header } });
    expect(list.status).toBe(404);
  });

  it("signs out by clearing both cookies", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, agency.owner.email, agency.owner.password);
    jar.absorb(await postJson(server, "/api/auth/sign-out", {}, jar));
    expect(jar.names()).toEqual([]);
  });

  it("uses __Secure- cookies when secure cookies are on", async () => {
    const secure = createTestServer({ secureCookies: true });
    try {
      const response = await postJson(secure, "/api/auth/sign-in/email", {
        email: agency.owner.email,
        password: agency.owner.password,
      });
      const cookies = response.headers.getSetCookie();
      expect(cookies.map((cookie) => cookie.split("=")[0])).toEqual([
        "__Secure-better-auth.session_token",
        "__Secure-better-auth.session_data",
      ]);
      expect(cookies.every((cookie) => /;\s*Secure/i.test(cookie))).toBe(true);
    } finally {
      await secure.close();
    }
  });
});

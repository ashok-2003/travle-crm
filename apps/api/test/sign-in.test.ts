// Signing in through the HTTP app (spec 6.3): by email or by organization code and username, with no self sign-up,
// session cookies a browser keeps, and Better Auth's organization endpoints closed to clients.
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import {
  createTestAgency,
  createTestServer,
  ORIGIN,
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

  it("refuses a wrong password, a wrong organization code, or someone else's organization, all the same way", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const other = await createTestAgency(server);
    const attempts = [
      { orgCode: agency.code, username: "ravi", password: "wrong-password-1" },
      { orgCode: "NOSUCHORG", username: "ravi", password: "ravi-password-1" },
      { orgCode: other.code, username: "ravi", password: "ravi-password-1" },
    ];
    const bodies: unknown[] = [];
    for (const attempt of attempts) {
      const response = await postJson(server, "/api/auth/sign-in/org", attempt);
      expect(response.status).toBe(401);
      bodies.push(await response.json());
    }
    // Nothing tells a wrong password from an unknown organization or someone else's: no enumeration.
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    const lines = warn.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Invalid password");
    expect(lines[1]).toContain("User not found");
    expect(lines[2]).toContain("User not found");
  });

  it("answers a malformed organization sign-in with 400", async () => {
    for (const body of [{}, { orgCode: "S!", username: "ravi", password: "x" }, "not json"]) {
      expect((await postJson(server, "/api/auth/sign-in/org", body)).status).toBe(400);
    }
  });

  it("answers a body that is not JSON at all with 400", async () => {
    const response = await server.app.request("/api/auth/sign-in/org", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION" });
  });

  it("refuses an oversized organization sign-in body with 413", async () => {
    const response = await postJson(server, "/api/auth/sign-in/org", {
      orgCode: agency.code,
      username: "ravi",
      password: "x".repeat(20_000),
    });
    expect(response.status).toBe(413);
  });

  it("refuses a body over 64 KB on Better Auth's own endpoints with 413", async () => {
    const response = await postJson(server, "/api/auth/sign-in/email", {
      email: agency.owner.email,
      password: "x".repeat(70_000),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" });
  });

  describe("login CSRF on the organization sign-in", () => {
    const credentials = () => ({ orgCode: agency.code, username: "ravi", password: "ravi-password-1" });
    const post = (headers: Record<string, string>, body: string) =>
      server.app.request("/api/auth/sign-in/org", { method: "POST", headers, body });

    it("refuses form-style and text/plain posts, and sets no cookie", async () => {
      const form = new URLSearchParams(credentials()).toString();
      const text = JSON.stringify(credentials());
      const attempts = [
        { type: "application/x-www-form-urlencoded", body: form },
        { type: "text/plain", body: text },
      ];
      for (const { type, body } of attempts) {
        // From another website: refused on the origin.
        const crossSite = await post({ "content-type": type, origin: "https://evil.example" }, body);
        expect(crossSite.status).toBe(403);
        expect(crossSite.headers.getSetCookie()).toEqual([]);
        // With no Origin at all (some browsers omit it): refused too.
        const noOrigin = await post({ "content-type": type }, body);
        expect(noOrigin.status).toBe(403);
        expect(noOrigin.headers.getSetCookie()).toEqual([]);
        // From our own origin but not JSON: refused on the content type.
        const sameOrigin = await post({ "content-type": type, origin: ORIGIN }, body);
        expect(sameOrigin.status).toBe(415);
        expect(sameOrigin.headers.getSetCookie()).toEqual([]);
      }
    });

    it("refuses a JSON post from another website, and sets no cookie", async () => {
      const response = await postJson(server, "/api/auth/sign-in/org", credentials(), undefined, {
        origin: "https://evil.example",
      });
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    });
  });

  it("refuses a sign-in posted from another website", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => {
      error.mockRestore();
    });
    const response = await postJson(
      server,
      "/api/auth/sign-in/email",
      { email: agency.owner.email, password: agency.owner.password },
      undefined,
      { origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect(String(error.mock.calls[0]?.[0])).toContain("Invalid origin: https://evil.example");
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

  it("keeps the organization endpoints closed under variant spellings of the path", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, agency.owner.email, agency.owner.password);
    const paths = [
      "/api/auth/Organization/list",
      "/api/auth/ORGANIZATION/list",
      "/api/auth//organization/list",
      "/api/auth/organization%2Flist",
      "/api/auth/organization/list/",
      "/api/auth/organization/",
    ];
    for (const path of paths) {
      const response = await server.app.request(path, { headers: { cookie: jar.header } });
      expect(response.status, path).toBe(404);
    }
    for (const path of paths) {
      expect((await postJson(server, path, {}, jar)).status, path).toBe(404);
    }
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

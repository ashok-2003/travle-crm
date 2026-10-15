// Password reset by email link (spec 6.2), through the real SMTP sender to Mailpit: the email comes from our address
// under the product's name with the reset link, the link leads back to the web app's reset page with a token, the new
// password works and every old session ends. Tokens are stored hashed. password-reset-answers.test.ts has who gets
// an email and how alike the answers are; password-reset-requests.test.ts the request limits and logging.
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { expectBetterAuthLogs, fromAddress, resetLinkIn, resetPage, useResetKit } from "./support/password-reset.js";
import { ownerAccess, signedInOwner } from "./support/people.js";
import { postJson, signInByEmail } from "./support/test-server.js";

describe("password reset by email", () => {
  const kit = useResetKit();

  it("emails a link that leads back to the web app, sets the new password and ends every old session", async () => {
    const { server, agency, emails } = kit;
    const checkWarnings = expectBetterAuthLogs("warn", "Invalid password", 1);
    const devices = [await signedInOwner(server, agency), await signedInOwner(server, agency)];
    expect((await kit.ask(agency.owner.email)).status).toBe(200);
    await emails.settled();
    const [message] = await kit.messagesTo(agency.owner.email);
    expect(message).toMatchObject({
      From: { Address: fromAddress, Name: brand.emailSenderName },
      To: [{ Address: agency.owner.email, Name: "Asha Owner" }],
      ReplyTo: [],
      Subject: "Reset your password",
    });
    const link = resetLinkIn(message);

    const opened = await server.app.request(link.path);
    expect(opened.status).toBe(302);
    const backToApp = new URL(opened.headers.get("location") ?? "");
    expect(`${backToApp.origin}${backToApp.pathname}`).toBe(resetPage);
    expect(backToApp.searchParams.get("token")).toBe(link.token);

    const reset = await postJson(server, "/api/auth/reset-password", {
      token: link.token,
      newPassword: "a-brand-new-password",
    });
    expect(reset.status).toBe(200);
    // The link works once.
    expect(
      (await postJson(server, "/api/auth/reset-password", { token: link.token, newPassword: "x".repeat(12) })).status,
    ).toBe(400);
    expect(await server.platform.session.count({ where: { userId: agency.owner.userId } })).toBe(0);
    for (const jar of devices) {
      // Read from the database, not the 5-minute cookie cache: the session itself is gone.
      const session = await server.app.request("/api/auth/get-session?disableCookieCache=true", {
        headers: { cookie: jar.header },
      });
      expect(await session.json()).toBeNull();
    }
    expect((await signInByEmail(server, new CookieJar(), agency.owner.email, agency.owner.password)).status).toBe(401);
    expect((await signInByEmail(server, new CookieJar(), agency.owner.email, "a-brand-new-password")).status).toBe(200);
    checkWarnings();
  });

  it("keeps the token only hashed, for an hour", async () => {
    const { server, agency, emails } = kit;
    const address = `dev-${agency.code.toLowerCase()}@example.test`;
    const created = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Dev",
      email: address,
      roleKey: "sales",
      temporaryPassword: "temporary-password-4",
    });
    const asked = Date.now();
    await kit.ask(address);
    await emails.settled();
    const { token } = resetLinkIn((await kit.messagesTo(address))[0]);
    const stored = await server.platform.verification.findMany({ where: { value: created.userId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.identifier).not.toContain(token);
    expect(stored[0]?.identifier).not.toMatch(/^reset-password:/);
    const lifetime = (stored[0]?.expiresAt.getTime() ?? 0) - asked;
    expect(lifetime).toBeGreaterThan(59 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);
    // The hashed token still works.
    const reset = await postJson(server, "/api/auth/reset-password", { token, newPassword: "devs-own-password" });
    expect(reset.status).toBe(200);
  });

  it("clears a temporary password's must-change flag once the person chose their own", async () => {
    const { server, agency, emails } = kit;
    const address = `ravi-${agency.code.toLowerCase()}@example.test`;
    const created = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Ravi",
      email: address,
      roleKey: "sales",
      temporaryPassword: "temporary-password-1",
    });
    await kit.ask(address);
    await emails.settled();
    const [message] = await kit.messagesTo(address);
    expect(message?.To).toEqual([{ Address: address, Name: "Ravi" }]);
    const reset = await postJson(server, "/api/auth/reset-password", {
      token: resetLinkIn(message).token,
      newPassword: "ravis-own-password",
    });
    expect(reset.status).toBe(200);
    const user = await server.platform.user.findUniqueOrThrow({ where: { id: created.userId } });
    expect(user.mustChangePassword).toBe(false);
  });
});

// Password reset by email link (spec 6.2), through the real SMTP sender to Mailpit: the email comes from our address
// under the product's name with the reset link, the link leads back to the web app with a token, the new password
// works and every old session ends. Staff without email and addresses nobody has get nothing, and the answer never
// says which case it was. The link's token never reaches a log.
import { brand } from "@travel-crm/brand";
import { createMemoryEmailSender, createSmtpEmailSender, type EmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { passwordResetEmails } from "../src/password-reset-email.js";
import { CookieJar } from "./support/cookie-jar.js";
import { startMailpit, type Mailpit, type MailpitMessage } from "./support/mailpit.js";
import { ownerAccess, signedInOwner } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  ORIGIN,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

const resetPage = `${ORIGIN}/reset-password`;
const fromAddress = "no-reply@travel-crm.test";

/** The reset link in an email, and the token in it. */
function resetLinkIn(message: MailpitMessage | undefined): { path: string; token: string } {
  const match = /http:\/\/localhost(\/api\/auth\/reset-password\/([^?\s"<]+)\?[^\s"<]+)/.exec(message?.Text ?? "");
  if (!match?.[1] || !match[2]) throw new Error("no reset link in the email");
  return { path: match[1], token: match[2] };
}

/**
 * Better Auth logs some refusals: an address nobody has, a wrong password, a redirect to an untrusted origin. Each test
 * expects exactly its own lines, and the check it returns says so.
 */
function expectBetterAuthLogs(level: "warn" | "error", text: string, count: number): () => void {
  const log = vi.spyOn(console, level).mockImplementation(() => undefined);
  onTestFinished(() => {
    log.mockRestore();
  });
  return () => {
    expect(log).toHaveBeenCalledTimes(count);
    for (const [message] of log.mock.calls) expect(String(message)).toContain(text);
  };
}

describe("password reset by email", () => {
  let mailpit: Mailpit;
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    mailpit = await startMailpit();
    const smtp = createSmtpEmailSender({
      host: mailpit.smtpHost,
      port: mailpit.smtpPort,
      secure: false,
      fromAddress,
    });
    server = createTestServer({ sendPasswordResetEmail: passwordResetEmails(smtp) });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
    await mailpit.stop();
  });

  it("emails a link that leads back to the web app, sets the new password and ends every old session", async () => {
    const checkWarnings = expectBetterAuthLogs("warn", "Invalid password", 1);
    const before = (await mailpit.messages()).length;
    const devices = [await signedInOwner(server, agency), await signedInOwner(server, agency)];
    const asked = await postJson(server, "/api/auth/request-password-reset", {
      email: agency.owner.email,
      redirectTo: resetPage,
    });
    expect(asked.status).toBe(200);
    const [message] = await mailpit.messagesOnceThereAre(before + 1);
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
    // The link works once.
    expect(
      (await postJson(server, "/api/auth/reset-password", { token: link.token, newPassword: "x".repeat(12) })).status,
    ).toBe(400);
  });

  it("clears a temporary password's must-change flag once the person chose their own", async () => {
    const address = `ravi-${agency.code.toLowerCase()}@example.test`;
    const created = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Ravi",
      email: address,
      roleKey: "sales",
      temporaryPassword: "temporary-password-1",
    });
    const before = (await mailpit.messages()).length;
    await postJson(server, "/api/auth/request-password-reset", { email: address, redirectTo: resetPage });
    const [message] = await mailpit.messagesOnceThereAre(before + 1);
    expect(message?.To).toEqual([{ Address: address, Name: "Ravi" }]);
    const reset = await postJson(server, "/api/auth/reset-password", {
      token: resetLinkIn(message).token,
      newPassword: "ravis-own-password",
    });
    expect(reset.status).toBe(200);
    const user = await server.platform.user.findUniqueOrThrow({ where: { id: created.userId } });
    expect(user.mustChangePassword).toBe(false);
  });

  it("answers a placeholder or unknown address exactly like a real one, and sends them nothing", async () => {
    const checkWarnings = expectBetterAuthLogs("warn", "User not found", 1);
    // Staff without email have a placeholder address, which Better Auth finds like any other.
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Meera",
      username: "meera",
      roleKey: "operations",
      temporaryPassword: "temporary-password-2",
    });
    const real = `kiran-${agency.code.toLowerCase()}@example.test`;
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Kiran",
      email: real,
      roleKey: "sales",
      temporaryPassword: "temporary-password-3",
    });
    const before = (await mailpit.messages()).length;
    const answers: { status: number; body: string }[] = [];
    for (const email of [real, `${agency.code.toLowerCase()}-meera@no-email.invalid`, "nobody@example.test"]) {
      const asked = await postJson(server, "/api/auth/request-password-reset", { email, redirectTo: resetPage });
      answers.push({ status: asked.status, body: await asked.text() });
    }
    expect(answers[0]?.status).toBe(200);
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);

    const received = await mailpit.messagesOnceThereAre(before + 1);
    // Give anything else time to arrive: only the real address got an email.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await mailpit.messages()).length).toBe(before + 1);
    expect(received[0]?.To).toEqual([{ Address: real, Name: "Kiran" }]);
    checkWarnings();
  });

  it("refuses to send people back anywhere but a trusted origin, whether or not the address exists", async () => {
    const checkWarnings = expectBetterAuthLogs("warn", "User not found", 0);
    const checkErrors = expectBetterAuthLogs("error", "Invalid redirectURL", 2);
    const before = (await mailpit.messages()).length;
    const answers: { status: number; body: string }[] = [];
    for (const email of [agency.owner.email, "nobody@example.test"]) {
      const asked = await postJson(server, "/api/auth/request-password-reset", {
        email,
        redirectTo: "https://phishing.example/reset-password",
      });
      answers.push({ status: asked.status, body: await asked.text() });
    }
    expect(answers[0]?.status).toBe(403);
    expect(answers[1]).toEqual(answers[0]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await mailpit.messages()).length).toBe(before);
    checkWarnings();
    checkErrors();
  });
});

describe("password reset requests", () => {
  let server: TestServer;
  let agency: TestAgency;
  const email = createMemoryEmailSender();

  beforeAll(async () => {
    server = createTestServer({ rateLimit: true, sendPasswordResetEmail: passwordResetEmails(email) });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("are rate limited per client address: three a minute", async () => {
    const ask = (address: string) =>
      postJson(
        server,
        "/api/auth/request-password-reset",
        { email: agency.owner.email, redirectTo: resetPage },
        undefined,
        { "x-forwarded-for": address },
      );
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await ask("203.0.113.40")).status).toBe(200);
    const refused = await ask("203.0.113.40");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("x-retry-after") ?? refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await ask("203.0.113.41")).status).toBe(200);
  });
});

describe("the password-reset email", () => {
  it("keeps the reset link out of the log when sending fails", async () => {
    const url = "http://localhost/api/auth/reset-password/secret-reset-token-123?callbackURL=http%3A%2F%2Flocalhost";
    // A library error that quotes the message it failed to send, link and all.
    const failing: EmailSender = { send: () => Promise.reject(new Error(`could not deliver: ${url}`)) };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => {
      error.mockRestore();
    });
    await passwordResetEmails(failing)({ to: { name: "Asha", address: "asha@example.test" }, url });
    expect(error).toHaveBeenCalledTimes(1);
    const logged = error.mock.calls.flat().map((part) => (part instanceof Error ? part.message : String(part)));
    expect(logged.join(" ")).toContain("Could not send a password-reset email");
    expect(logged.join(" ")).not.toContain("secret-reset-token-123");
  });
});

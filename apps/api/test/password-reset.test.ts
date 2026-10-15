// Password reset by email link (spec 6.2), through the real SMTP sender to Mailpit: the email comes from our address
// under the product's name with the reset link, the link leads back to the web app's reset page with a token, the new
// password works and every old session ends. Staff without email and addresses nobody has get nothing, one address
// gets at most 3 emails an hour, and no answer says which case it was. Tokens are stored hashed.
import { brand } from "@travel-crm/brand";
import { createDatabase, type Database } from "@travel-crm/db";
import type { SendPasswordResetEmail } from "@travel-crm/domain/identity";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createSmtpEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
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

/**
 * The reset sender with a count of the emails Better Auth asked it for, and a way to wait until each has been dealt
 * with (sending happens after the answer, on a later turn of the event loop).
 */
function tracked(send: SendPasswordResetEmail) {
  const pending: Promise<void>[] = [];
  return {
    send: ((email) => {
      const sending = send(email);
      pending.push(sending);
      return sending;
    }) satisfies SendPasswordResetEmail,
    asked: () => pending.length,
    settled: async () => {
      // The detached send starts on a setImmediate queued during the request; this one runs after it.
      await new Promise((resolve) => setImmediate(resolve));
      await Promise.all(pending);
    },
  };
}

/** What an answer shows a caller: status, headers but the date, and body. */
async function answerOf(response: Response) {
  const headers = [...response.headers.entries()].filter(([name]) => name !== "date");
  return { status: response.status, headers, body: await response.text() };
}

describe("password reset by email", () => {
  let mailpit: Mailpit;
  let limiterDb: Database;
  let emails: ReturnType<typeof tracked>;
  let server: TestServer;
  let agency: TestAgency;

  /** Asks for a reset link to `redirectTo`; null leaves redirectTo out. */
  const ask = (email: string, redirectTo: string | null = resetPage, clientAddress = "203.0.113.60") =>
    postJson(
      server,
      "/api/auth/request-password-reset",
      redirectTo === null ? { email } : { email, redirectTo },
      undefined,
      { "x-forwarded-for": clientAddress },
    );
  const messagesTo = async (address: string) =>
    (await mailpit.messages()).filter((message) => message.To[0]?.Address === address);

  beforeAll(async () => {
    mailpit = await startMailpit();
    limiterDb = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
    const smtp = createSmtpEmailSender({ host: mailpit.smtpHost, port: mailpit.smtpPort, secure: false, fromAddress });
    const limiter = createRateLimiter(limiterDb, { keySecret: "password-reset-test-secret-of-32-bytes" });
    emails = tracked(passwordResetEmails(smtp, limiter));
    server = createTestServer({ passwordReset: { sendEmail: emails.send, pageUrl: resetPage } });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await emails.settled();
    await server.close();
    await limiterDb.disconnect();
    await mailpit.stop();
  });

  it("emails a link that leads back to the web app, sets the new password and ends every old session", async () => {
    const checkWarnings = expectBetterAuthLogs("warn", "Invalid password", 1);
    const devices = [await signedInOwner(server, agency), await signedInOwner(server, agency)];
    expect((await ask(agency.owner.email)).status).toBe(200);
    await emails.settled();
    const [message] = await messagesTo(agency.owner.email);
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
    const address = `dev-${agency.code.toLowerCase()}@example.test`;
    const created = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Dev",
      email: address,
      roleKey: "sales",
      temporaryPassword: "temporary-password-4",
    });
    const asked = Date.now();
    await ask(address);
    await emails.settled();
    const { token } = resetLinkIn((await messagesTo(address))[0]);
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
    const address = `ravi-${agency.code.toLowerCase()}@example.test`;
    const created = await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Ravi",
      email: address,
      roleKey: "sales",
      temporaryPassword: "temporary-password-1",
    });
    await ask(address);
    await emails.settled();
    const [message] = await messagesTo(address);
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
    const askedBefore = emails.asked();
    const answers = [];
    for (const email of [real, `${agency.code.toLowerCase()}-meera@no-email.invalid`, "nobody@example.test"]) {
      answers.push(await answerOf(await ask(email)));
    }
    expect(answers[0]?.status).toBe(200);
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    await emails.settled();
    // Only the real address was handed to the sender, and it got its email.
    expect(emails.asked()).toBe(askedBefore + 1);
    expect((await messagesTo(real)).map((message) => message.To)).toEqual([[{ Address: real, Name: "Kiran" }]]);
    checkWarnings();
  });

  it("sends one address at most 3 reset emails an hour, from wherever they are asked for", async () => {
    const address = `tara-${agency.code.toLowerCase()}@example.test`;
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "Tara",
      email: address,
      roleKey: "sales",
      temporaryPassword: "temporary-password-5",
    });
    const answers = [];
    for (const clientAddress of ["203.0.113.71", "203.0.113.72", "203.0.113.73", "203.0.113.74"]) {
      answers.push(await answerOf(await ask(address, resetPage, clientAddress)));
      await emails.settled();
    }
    expect(answers[0]?.status).toBe(200);
    for (const answer of answers) expect(answer).toEqual(answers[0]);
    expect(await messagesTo(address)).toHaveLength(3);
  });

  it("sends people back only to the reset page, refusing anything else alike for every address", async () => {
    const checkWarnings = expectBetterAuthLogs("warn", "User not found", 0);
    const checkErrors = expectBetterAuthLogs("error", "Invalid redirectURL", 2);
    const askedBefore = emails.asked();
    // An untrusted origin is refused by Better Auth itself, and that refusal is the one every other case matches.
    const untrusted = [];
    for (const email of [agency.owner.email, "nobody@example.test"]) {
      untrusted.push(await answerOf(await ask(email, "https://phishing.example/reset-password")));
    }
    expect(untrusted[0]?.status).toBe(403);
    expect(untrusted[1]).toEqual(untrusted[0]);
    // A trusted origin's other page, or no page at all, is refused the same way, before any address is looked up.
    for (const redirectTo of [`${ORIGIN}/sign-in`, `${resetPage}?next=x`, null]) {
      for (const email of [agency.owner.email, "nobody@example.test"]) {
        expect(await answerOf(await ask(email, redirectTo))).toEqual(untrusted[0]);
      }
    }
    await emails.settled();
    expect(emails.asked()).toBe(askedBefore);
    checkWarnings();
    checkErrors();
  });
});

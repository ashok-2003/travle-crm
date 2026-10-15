// What the password-reset tests share: a server whose reset emails go through the real SMTP sender to Mailpit, with
// the per-recipient cap counted in Postgres, and helpers to read the emails, wait for the sends and compare answers.
import { createDatabase, type Database } from "@travel-crm/db";
import type { SendPasswordResetEmail } from "@travel-crm/domain/identity";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSmtpEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, expect, inject, onTestFinished, vi } from "vitest";
import { passwordResetEmails } from "../../src/password-reset-email.js";
import { processLog } from "../../src/process-log.js";
import { startMailpit, type Mailpit, type MailpitMessage } from "./mailpit.js";
import {
  createTestAgency,
  createTestServer,
  ORIGIN,
  postJson,
  type TestAgency,
  type TestServer,
} from "./test-server.js";

export const resetPage = `${ORIGIN}/reset-password`;
export const fromAddress = "no-reply@travel-crm.test";

/** The reset link in an email, and the token in it. */
export function resetLinkIn(message: MailpitMessage | undefined): { path: string; token: string } {
  const match = /http:\/\/localhost(\/api\/auth\/reset-password\/([^?\s"<]+)\?[^\s"<]+)/.exec(message?.Text ?? "");
  if (!match?.[1] || !match[2]) throw new Error("no reset link in the email");
  return { path: match[1], token: match[2] };
}

/**
 * Better Auth logs some refusals: an address nobody has, a wrong password, a redirect to an untrusted origin. Each test
 * expects exactly its own lines, and the check it returns says so.
 */
export function expectBetterAuthLogs(level: "warn" | "error", text: string, count: number): () => void {
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
export function tracked(send: SendPasswordResetEmail) {
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
export async function answerOf(response: Response) {
  const headers = [...response.headers.entries()].filter(([name]) => name !== "date");
  return { status: response.status, headers, body: await response.text() };
}

export interface ResetKit {
  mailpit: Mailpit;
  server: TestServer;
  agency: TestAgency;
  emails: ReturnType<typeof tracked>;
  /** Every hit the per-recipient cap counted: its key and the instant it was counted at. */
  capHits: { key: string; at: Date }[];
  /** Asks for a reset link to `redirectTo` (the reset page unless given; null leaves it out). */
  ask(email: string, redirectTo?: string | null, clientAddress?: string): Promise<Response>;
  messagesTo(address: string): Promise<MailpitMessage[]>;
}

/**
 * The cap's limiter, counting every hit at one instant. Its windows are fixed hours, so a test that ran across the top
 * of an hour would otherwise count in two windows and let a fourth email through.
 */
function pinnedLimiter(limiter: RateLimiter, at: Date, hits: ResetKit["capHits"]): Pick<RateLimiter, "hit"> {
  return {
    hit: (key, rule) => {
      hits.push({ key, at });
      return limiter.hit(key, rule, at);
    },
  };
}

/** Call inside a describe: sets the server up before its tests and stops it after them. */
export function useResetKit(): ResetKit {
  // What has started, for the teardown: a set-up that failed half-way stops only that, and keeps its own error.
  let mailpit: Mailpit | undefined;
  let limiterDb: Database | undefined;
  let emails: ResetKit["emails"] | undefined;
  let server: TestServer | undefined;
  // Filled in by beforeAll, before any test reads it.
  const kit = {} as ResetKit;
  kit.capHits = [];
  kit.ask = (email, redirectTo = resetPage, clientAddress = "203.0.113.60") =>
    postJson(
      kit.server,
      "/api/auth/request-password-reset",
      redirectTo === null ? { email } : { email, redirectTo },
      undefined,
      { "x-forwarded-for": clientAddress },
    );
  kit.messagesTo = async (address) =>
    (await kit.mailpit.messages()).filter((message) => message.To[0]?.Address === address);

  beforeAll(async () => {
    mailpit = await startMailpit();
    kit.mailpit = mailpit;
    limiterDb = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
    const smtp = createSmtpEmailSender({ host: mailpit.smtpHost, port: mailpit.smtpPort, secure: false, fromAddress });
    const limiter = createRateLimiter(limiterDb, { keySecret: "password-reset-test-secret-of-32-bytes" });
    // A failed send would print an "api: ..." line, which the gate's clean stderr would show.
    emails = tracked(passwordResetEmails(smtp, pinnedLimiter(limiter, new Date(), kit.capHits), processLog("api")));
    kit.emails = emails;
    server = createTestServer({ passwordReset: { sendEmail: emails.send, pageUrl: resetPage } });
    kit.server = server;
    kit.agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await emails?.settled();
    await server?.close();
    await limiterDb?.disconnect();
    await mailpit?.stop();
  });

  return kit;
}

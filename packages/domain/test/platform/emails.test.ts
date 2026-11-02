// The console's failed emails (the failed-emails spec): a super admin opens a failed email as it was sent and sends it
// again through the console's recorded sender, logged first in the platform log, with a second entry when the resend
// fails too; only a failed email that is still kept is sent again. The email log's purge runs daily.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import type { EmailMessage } from "@travel-crm/integrations/email";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { emailLogStore, PURGE_EMAIL_LOG_QUEUE, recordedEmailSender } from "../../src/email-log/index.js";
import {
  emailLogPurgeSchedule,
  getStoredEmail,
  listFailedEmails,
  listPlatformLog,
  purgeEmailLogNow,
  resendFailedEmail,
} from "../../src/platform/index.js";
import { createTestPlatform, support, type TestPlatform } from "./test-platform.js";

const message = (): EmailMessage => ({
  to: { name: "Asha Owner", address: `asha-${crypto.randomUUID()}@agency.example` },
  fromName: "Test Sender",
  subject: "Reset your password",
  text: "Choose a new password: https://app.example/reset-password?token=abc",
  html: '<a href="https://app.example/reset-password?token=abc">Choose a new password</a>',
  purpose: "password-reset",
});

const smtpError = () =>
  Object.assign(new Error("Sending the email failed: EAUTH (SMTP 535)"), { code: "EAUTH", responseCode: 535 });

describe("the console's failed emails", () => {
  let test: TestPlatform;
  let platform: PlatformClient;

  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  /** An email whose send failed, as the api or the worker would have recorded it; returns its id. */
  async function failedEmail(sent = message()): Promise<string> {
    const failing = { send: () => Promise.reject(smtpError()) };
    await recordedEmailSender(failing, emailLogStore(test.services.db), createMemoryLogger())
      .send(sent)
      .catch(() => undefined);
    const row = await platform.emailLog.findFirstOrThrow({ where: { toAddress: sent.to.address } });
    return row.id;
  }

  const logOf = async (id: string) =>
    (await test.services.platformDb.transaction((tx) => listPlatformLog(tx, { limit: 100 }))).entries.filter(
      (entry) => entry.targetId === id,
    );

  it("lists a failed email and shows it as it was sent", async () => {
    const sent = message();
    const id = await failedEmail(sent);
    const page = await listFailedEmails(test.services, { limit: 100 });
    expect(page.emails.find((email) => email.id === id)).toMatchObject({
      toAddress: sent.to.address,
      failureSource: "smtp",
      failureCode: "EAUTH (SMTP 535)",
      resent: false,
    });
    expect(await getStoredEmail(test.services, id)).toMatchObject({ id, htmlBody: sent.html, resends: [] });
  });

  it("sends a failed email again as it was, logged first, and says it was sent", async () => {
    const sent = message();
    const id = await failedEmail(sent);
    const before = test.emails.sent.length;

    const outcome = await resendFailedEmail(test.services, support, { id });
    expect(outcome).toEqual({ id: expect.any(String) as string, status: "sent" });
    const [again, ...others] = test.emails.sent.slice(before);
    expect(others).toEqual([]);
    expect(again).toMatchObject({ to: sent.to, subject: sent.subject, html: sent.html, purpose: "password-reset" });
    expect(await platform.emailLog.findUniqueOrThrow({ where: { id: outcome.id ?? "" } })).toMatchObject({
      resentFromId: id,
      status: "sent",
    });
    expect((await getStoredEmail(test.services, id)).resends).toEqual([
      expect.objectContaining({ id: outcome.id, status: "sent" }),
    ]);
    expect(await logOf(id)).toEqual([
      expect.objectContaining({
        action: "email.resent",
        actorUserId: support.userId,
        targetType: "email",
        after: { purpose: "password-reset" },
      }),
    ]);
  });

  it("says when the resend failed too, with a second log entry naming the code", async () => {
    const id = await failedEmail();
    const failing = { send: () => Promise.reject(smtpError()) };
    const services = {
      ...test.services,
      email: recordedEmailSender(failing, emailLogStore(test.services.db), createMemoryLogger()),
    };
    expect(await resendFailedEmail(services, support, { id })).toEqual({
      id: expect.any(String) as string,
      status: "failed",
    });
    expect((await logOf(id)).map((entry) => [entry.action, entry.after])).toEqual([
      ["email.resend-failed", { purpose: "password-reset", failure: "EAUTH (SMTP 535)" }],
      ["email.resent", { purpose: "password-reset" }],
    ]);
  });

  it("sends again only a failed email it still keeps, and logs nothing otherwise", async () => {
    const missing = "0199a000-0000-7000-8000-0000000000e8";
    await expect(resendFailedEmail(test.services, support, { id: missing })).rejects.toMatchObject({
      reason: "EMAIL_NOT_FOUND",
    });
    await expect(getStoredEmail(test.services, missing)).rejects.toMatchObject({ reason: "EMAIL_NOT_FOUND" });
    const sent = message();
    await recordedEmailSender(test.emails, emailLogStore(test.services.db), createMemoryLogger()).send(sent);
    const { id } = await platform.emailLog.findFirstOrThrow({ where: { toAddress: sent.to.address } });
    await expect(resendFailedEmail(test.services, support, { id })).rejects.toMatchObject({
      reason: "EMAIL_NOT_FAILED",
    });
    expect([...(await logOf(missing)), ...(await logOf(id))]).toEqual([]);
  });

  it("purges the email log every day, in India's night", async () => {
    const schedule = emailLogPurgeSchedule(test.services);
    expect(schedule).toMatchObject({ queue: PURGE_EMAIL_LOG_QUEUE, cron: "5 4 * * *", timeZone: "Asia/Kolkata" });
    expect(PURGE_EMAIL_LOG_QUEUE).toBe("email-log.purge");
    await expect(schedule.handle({})).resolves.toBeUndefined();
  });

  it("blanks Brevo's stored reports a week after they were processed, keeping their ids", async () => {
    const now = new Date();
    const report = (daysAgo: number) =>
      platform.webhookEvent.create({
        data: {
          provider: "brevo",
          providerEventId: crypto.randomUUID(),
          eventType: "brevo.hard_bounce",
          headers: {},
          payload: '{"event":"hard_bounce","email":"asha@agency.example"}',
          processedAt: new Date(now.getTime() - daysAgo * 86_400_000),
        },
      });
    const old = await report(8);
    const recent = await report(6);
    await purgeEmailLogNow(test.services, now);
    expect(await platform.webhookEvent.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({
      payload: "",
      providerEventId: old.providerEventId,
    });
    expect((await platform.webhookEvent.findUniqueOrThrow({ where: { id: recent.id } })).payload).toBe(recent.payload);
  });
});

// The console's failed emails over HTTP (the failed-emails spec): super admins only, never support, since each email
// is shown as it was sent, reset and invite links included. A super admin lists the failed emails newest first by
// cursor, opens one, and sends it again, which the platform log records.
import type { FailedEmailsPage, PlatformLogPage, ResendEmailOutput, StoredEmail } from "@travel-crm/contracts/platform";
import { createDatabase, type Database } from "@travel-crm/db";
import { emailLogStore, recordedEmailSender } from "@travel-crm/domain/email-log";
import { createMemoryEmailSender, type EmailMessage } from "@travel-crm/integrations/email";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

/** The id just above this one: a page after it starts with this email, whatever other test files add. */
function justAfter(id: string): string {
  const hex = (BigInt(`0x${id.replaceAll("-", "")}`) + 1n).toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("the console's failed emails", () => {
  const sent = createMemoryEmailSender();
  let db: Database;
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
    server = createTestServer();
    testConsole = createTestConsole(server, {
      email: recordedEmailSender(sent, emailLogStore(db), createMemoryLogger()),
    });
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
    await db.disconnect();
  });

  /** An invite whose send failed, as the worker would have recorded it; returns its id. */
  async function failedInvite(): Promise<{ id: string; message: EmailMessage }> {
    const message: EmailMessage = {
      to: { name: "Meera", address: `meera-${crypto.randomUUID()}@agency.example` },
      fromName: "Sharma Travels via Veeper AI",
      subject: "Your account for Sharma Travels",
      text: "Choose your password: https://app.example/reset-password?token=abc",
      html: '<a href="https://app.example/reset-password?token=abc">Choose your password</a>',
      purpose: "staff-invite",
    };
    const failing = { send: () => Promise.reject(Object.assign(new Error("refused"), { code: "EENVELOPE" })) };
    await recordedEmailSender(failing, emailLogStore(db), createMemoryLogger())
      .send(message)
      .catch(() => undefined);
    const row = await server.platform.emailLog.findFirstOrThrow({ where: { toAddress: message.to.address } });
    return { id: row.id, message };
  }

  it("refuses support every call, and anyone signed out", async () => {
    const { id } = await failedInvite();
    for (const response of [
      await consoleQuery(testConsole, "emails.failed", support.jar, {}),
      await consoleQuery(testConsole, "emails.get", support.jar, { id }),
      await consoleMutate(testConsole, "emails.resend", { id }, support.jar),
    ]) {
      expect(await refusalOf(response)).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    }
    expect((await consoleQuery(testConsole, "emails.failed", undefined, {})).status).toBe(401);
    expect(sent.sent).toEqual([]);
  });

  it("lists the failed emails newest first, a page at a time", async () => {
    const older = await failedInvite();
    const newer = await failedInvite();
    const page = await dataOf<FailedEmailsPage>(
      await consoleQuery(testConsole, "emails.failed", superAdmin.jar, { limit: 1, cursor: justAfter(newer.id) }),
    );
    expect(page.emails).toEqual([
      expect.objectContaining({
        id: newer.id,
        toAddress: newer.message.to.address,
        purpose: "staff-invite",
        failureSource: "smtp",
        failureCode: "EENVELOPE",
        resent: false,
      }),
    ]);
    expect(page.nextCursor).toBe(newer.id);
    const next = await dataOf<FailedEmailsPage>(
      await consoleQuery(testConsole, "emails.failed", superAdmin.jar, { limit: 1, cursor: page.nextCursor }),
    );
    expect(next.emails[0]?.id).toBe(older.id);
    expect((await consoleQuery(testConsole, "emails.failed", superAdmin.jar, { limit: 101 })).status).toBe(400);
    expect((await consoleQuery(testConsole, "emails.failed", superAdmin.jar, { page: 2 })).status).toBe(400);
  });

  it("shows one email as it was sent, and sends it again, which the platform log records", async () => {
    const { id, message } = await failedInvite();
    const email = await dataOf<StoredEmail>(await consoleQuery(testConsole, "emails.get", superAdmin.jar, { id }));
    expect(email).toMatchObject({ id, htmlBody: message.html, textBody: message.text, status: "failed", resends: [] });

    const outcome = await dataOf<ResendEmailOutput>(
      await consoleMutate(testConsole, "emails.resend", { id }, superAdmin.jar),
    );
    expect(outcome).toEqual({ id: expect.any(String) as string, status: "sent" });
    expect(sent.sent.at(-1)).toMatchObject({ to: message.to, html: message.html, purpose: "staff-invite" });
    const again = await dataOf<StoredEmail>(await consoleQuery(testConsole, "emails.get", superAdmin.jar, { id }));
    expect(again.resends).toEqual([expect.objectContaining({ id: outcome.id, status: "sent" })]);

    const log = await dataOf<PlatformLogPage>(await consoleQuery(testConsole, "log.list", superAdmin.jar, {}));
    expect(log.entries.find((entry) => entry.targetId === id)).toMatchObject({
      action: "email.resent",
      actorUserId: superAdmin.userId,
      targetType: "email",
      after: { purpose: "staff-invite" },
    });
  });

  it("says when the email is gone, or wasn't a failed one", async () => {
    const missing = "0199e7a0-0000-7000-8000-0000000000e7";
    expect(await refusalOf(await consoleQuery(testConsole, "emails.get", superAdmin.jar, { id: missing }))).toEqual({
      status: 404,
      reason: "EMAIL_NOT_FOUND",
    });
    const { id } = await failedInvite();
    await consoleMutate(testConsole, "emails.resend", { id }, superAdmin.jar);
    const resend = await server.platform.emailLog.findFirstOrThrow({ where: { resentFromId: id } });
    expect(
      await refusalOf(await consoleMutate(testConsole, "emails.resend", { id: resend.id }, superAdmin.jar)),
    ).toEqual({ status: 409, reason: "EMAIL_NOT_FAILED" });
  });
});

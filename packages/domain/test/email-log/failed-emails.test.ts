// What the console reads from the email log (the failed-emails spec), in a platform transaction: the last 30 days'
// failed emails, newest first by cursor, each source's last attempt only, with whether a resend got through; one email
// as it was sent, with its resends; the stored email a resend copies. And what it deletes: the daily purge (sent rows
// after 7 days, failed rows and resends after 30) and an erased member's emails. A database of the file's own: the
// list and the purge read every row.
import { createDatabase, type Database } from "@travel-crm/db";
import { emailLogs } from "@travel-crm/db/email-log";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import {
  deleteEmailsTo,
  emailToResend,
  failedEmails,
  purgeEmailLog,
  storedEmailOf,
} from "../../src/email-log/index.js";
import { DomainError } from "../../src/kernel/index.js";

const now = new Date("2026-11-02T10:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

interface Row {
  purpose?: string;
  sourceRef?: string | null;
  toAddress?: string;
  subject?: string;
  status?: "sending" | "sent" | "failed";
  failureSource?: "smtp" | "provider";
  failureCode?: string;
  failureReason?: string | null;
  createdAt?: Date;
  resentFromId?: string | null;
}

describe("the console's failed emails", () => {
  let isolated: IsolatedDatabase;
  let db: Database;
  let platformDb: PlatformDatabase;
  let platform: PlatformClient;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    platformDb = createPlatformDatabase(isolated.urls.platform, { maxConnections: 2 });
    platform = createPlatformClient(isolated.urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await platformDb.disconnect();
    await db.disconnect();
    await isolated.drop();
  });

  beforeEach(async () => {
    await platform.emailLog.deleteMany({});
  });

  /** A row as the recording wrapper and Brevo's reports leave it. */
  async function row(input: Row = {}): Promise<string> {
    const status = input.status ?? "failed";
    const createdAt = input.createdAt ?? daysAgo(1);
    const created = await db.withoutOrg((tx) =>
      emailLogs(tx).create({
        data: {
          purpose: input.purpose ?? "password-reset",
          sourceRef: input.sourceRef ?? null,
          toAddress: input.toAddress ?? "asha@agency.example",
          toName: "Asha Owner",
          fromName: "Test Sender",
          subject: input.subject ?? "Reset your password",
          textBody: "Choose a new password: https://app.example/reset-password?token=abc",
          htmlBody: '<a href="https://app.example/reset-password?token=abc">Choose a new password</a>',
          headers: { "List-Unsubscribe": "<https://app.example/account/notifications>" },
          status,
          createdAt,
          resentFromId: input.resentFromId ?? null,
          ...(status === "sent" ? { sentAt: createdAt } : {}),
          ...(status === "failed"
            ? {
                failureSource: input.failureSource ?? "smtp",
                failureCode: input.failureCode ?? "EAUTH (SMTP 535)",
                failureReason: input.failureReason ?? null,
                failedAt: createdAt,
              }
            : {}),
        },
      }),
    );
    return created.id;
  }

  const list = (input: { cursor?: string; limit?: number } = {}) =>
    platformDb.transaction((tx) => failedEmails(tx, { limit: input.limit ?? 25, cursor: input.cursor }, now));

  it("lists the last 30 days' failed emails, newest first, a page at a time", async () => {
    await row({ subject: "Too old", createdAt: daysAgo(31) });
    const oldest = await row({ subject: "Oldest", createdAt: daysAgo(3) });
    await row({ subject: "Sent", status: "sent" });
    await row({ subject: "Still going", status: "sending" });
    const middle = await row({ subject: "Middle", createdAt: daysAgo(2) });
    const newest = await row({
      subject: "Newest",
      createdAt: daysAgo(1),
      failureSource: "provider",
      failureCode: "blocked",
      failureReason: "x".repeat(300),
    });

    const first = await list({ limit: 2 });
    expect(first.emails.map((email) => email.id)).toEqual([newest, middle]);
    expect(first.nextCursor).toBe(middle);
    expect(first.emails[0]).toEqual({
      id: newest,
      createdAt: daysAgo(1).toISOString(),
      toAddress: "asha@agency.example",
      toName: "Asha Owner",
      subject: "Newest",
      purpose: "password-reset",
      failureSource: "provider",
      failureCode: "blocked",
      failureReason: "x".repeat(200),
      failedAt: daysAgo(1).toISOString(),
      resent: false,
    });
    const second = await list({ limit: 2, ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }) });
    expect(second.emails.map((email) => email.id)).toEqual([oldest]);
    expect(second.nextCursor).toBeNull();
  });

  it("shows each source's last attempt only: a retry that got through, or failed again, hides the earlier one", async () => {
    await row({ sourceRef: "notification:a", createdAt: daysAgo(3) });
    await row({ sourceRef: "notification:a", status: "sent", createdAt: daysAgo(2) });
    await row({ sourceRef: "notification:b", createdAt: daysAgo(3) });
    const lastOfB = await row({ sourceRef: "notification:b", createdAt: daysAgo(2) });
    const alone = await row({ sourceRef: "notification:c", createdAt: daysAgo(1) });
    expect((await list()).emails.map((email) => email.id)).toEqual([alone, lastOfB]);
  });

  it("keeps an email that was resent listed, saying whether a resend got through, and never lists a resend", async () => {
    const original = await row({ sourceRef: "notification:d", createdAt: daysAgo(3) });
    await row({ sourceRef: "notification:d", resentFromId: original, createdAt: daysAgo(2) });
    const other = await row({ createdAt: daysAgo(2) });
    await row({ resentFromId: other, status: "sent", createdAt: daysAgo(1) });
    const listed = (await list()).emails;
    expect(listed.map((email) => [email.id, email.resent])).toEqual([
      [other, true],
      [original, false],
    ]);
  });

  it("shows one email as it was sent, links included, with its resends oldest first", async () => {
    const original = await row({
      failureSource: "provider",
      failureCode: "hard_bounce",
      failureReason: "550 no such user",
    });
    const firstResend = await row({ resentFromId: original, createdAt: new Date(now.getTime() - 60_000) });
    const secondResend = await row({ resentFromId: original, status: "sent", createdAt: now });
    const email = await platformDb.transaction((tx) => storedEmailOf(tx, original));
    expect(email).toMatchObject({
      id: original,
      purpose: "password-reset",
      toAddress: "asha@agency.example",
      toName: "Asha Owner",
      fromName: "Test Sender",
      replyTo: null,
      subject: "Reset your password",
      textBody: "Choose a new password: https://app.example/reset-password?token=abc",
      htmlBody: '<a href="https://app.example/reset-password?token=abc">Choose a new password</a>',
      status: "failed",
      failureSource: "provider",
      failureCode: "hard_bounce",
      failureReason: "550 no such user",
      sentAt: null,
    });
    expect(email.resends).toEqual([
      expect.objectContaining({ id: firstResend, status: "failed", failureCode: "EAUTH (SMTP 535)" }),
      expect.objectContaining({ id: secondResend, status: "sent", sentAt: now.toISOString(), failureCode: null }),
    ]);
  });

  it("refuses an email it doesn't hold, and resends only a failed one", async () => {
    const missing = "0199a000-0000-7000-8000-0000000000e9";
    const notFound = await platformDb.transaction((tx) => storedEmailOf(tx, missing)).catch((error: unknown) => error);
    expect(notFound).toBeInstanceOf(DomainError);
    expect(notFound).toMatchObject({ code: "NOT_FOUND", reason: "EMAIL_NOT_FOUND" });
    await expect(platformDb.transaction((tx) => emailToResend(tx, missing))).rejects.toMatchObject({
      reason: "EMAIL_NOT_FOUND",
    });
    const sent = await row({ status: "sent" });
    await expect(platformDb.transaction((tx) => emailToResend(tx, sent))).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "EMAIL_NOT_FAILED",
    });
  });

  it("hands a resend the failed email exactly as it was sent", async () => {
    const failed = await row({ sourceRef: "notification:e", purpose: "notification" });
    expect(await platformDb.transaction((tx) => emailToResend(tx, failed))).toEqual({
      id: failed,
      to: { name: "Asha Owner", address: "asha@agency.example" },
      fromName: "Test Sender",
      replyTo: undefined,
      subject: "Reset your password",
      text: "Choose a new password: https://app.example/reset-password?token=abc",
      html: '<a href="https://app.example/reset-password?token=abc">Choose a new password</a>',
      headers: { "List-Unsubscribe": "<https://app.example/account/notifications>" },
      purpose: "notification",
      sourceRef: "notification:e",
    });
  });

  it("purges sent emails after 7 days, and failed ones and resends after 30", async () => {
    const sentRecently = await row({ status: "sent", createdAt: daysAgo(6) });
    await row({ status: "sent", createdAt: daysAgo(8) });
    await row({ status: "sending", createdAt: daysAgo(8) });
    const failedRecently = await row({ createdAt: daysAgo(29) });
    await row({ createdAt: daysAgo(31) });
    const resend = await row({ status: "sent", resentFromId: failedRecently, createdAt: daysAgo(8) });
    const oldOriginal = await row({ createdAt: daysAgo(40) });
    const orphan = await row({ status: "sent", resentFromId: oldOriginal, createdAt: daysAgo(20) });

    expect(await platformDb.transaction((tx) => purgeEmailLog(tx, now))).toBe(4);
    const left = await platform.emailLog.findMany({ select: { id: true, resentFromId: true }, orderBy: { id: "asc" } });
    expect(left).toEqual(
      [
        { id: sentRecently, resentFromId: null },
        { id: failedRecently, resentFromId: null },
        { id: resend, resentFromId: failedRecently },
        { id: orphan, resentFromId: null },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("deletes every email to an erased person's addresses, whatever their case, and nobody else's", async () => {
    await row({ toAddress: "Meera@Agency.example" });
    await row({ toAddress: "meera.old@agency.example", status: "sent" });
    const kept = await row({ toAddress: "asha@agency.example" });
    expect(
      await platformDb.transaction((tx) => deleteEmailsTo(tx, ["meera@agency.example", "meera.old@agency.example"])),
    ).toBe(2);
    expect(await platformDb.transaction((tx) => deleteEmailsTo(tx, []))).toBe(0);
    expect((await platform.emailLog.findMany({ select: { id: true } })).map((email) => email.id)).toEqual([kept]);
  });

  it("is refused in an organization's transaction", async () => {
    const organizationId = "0199a000-0000-7000-8000-000000000002";
    await expect(db.forOrg(organizationId, (tx) => failedEmails(tx, { limit: 1 }, now))).rejects.toThrow(
      /email_?log|emailLog/i,
    );
  });
});

// The recording wrapper (the failed-emails spec): every email is recorded as its send starts, sent with our reference
// for Brevo's reports, then marked sent, or failed with the adapter's safe code and the same error rethrown, so the
// callers' retries don't change. The record never stops an email: an insert that fails sends it anyway, with one
// warning by names and codes. A resend is a new row naming the email it copies.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createMemoryEmailSender, type EmailMessage, type EmailSender } from "@travel-crm/integrations/email";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  EMAIL_REFERENCE_HEADER,
  emailLogStore,
  recordedEmailSender,
  type EmailLogStore,
} from "../../src/email-log/index.js";

const message = (overrides: Partial<EmailMessage> = {}): EmailMessage => ({
  to: { name: "Asha Owner", address: `asha-${crypto.randomUUID()}@agency.example` },
  fromName: "Sharma Travels via Test Sender",
  replyTo: "hello@sharma.example",
  subject: "Your quotation was opened",
  text: "Meera opened it. https://app.example/leads/1",
  html: '<p>Meera opened it. <a href="https://app.example/leads/1">Open</a></p>',
  headers: { "List-Unsubscribe": "<https://app.example/account/notifications>" },
  purpose: "notification",
  sourceRef: "notification:0199a000-0000-7000-8000-000000000001",
  ...overrides,
});

/** A sender that fails as the SMTP adapter does: a safe error with nodemailer's code and the server's reply code. */
function failingSender(error: Error): EmailSender & { tried: EmailMessage[] } {
  const tried: EmailMessage[] = [];
  return {
    tried,
    send: (sent) => {
      tried.push(sent);
      return Promise.reject(error);
    },
  };
}

const smtpError = () =>
  Object.assign(new Error("Sending the email failed: EAUTH (SMTP 535)"), { code: "EAUTH", responseCode: 535 });

describe("the recorded email sender", () => {
  let db: Database;
  let platform: PlatformClient;
  let store: EmailLogStore;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
    platform = createPlatformClient(inject("dbUrls").platform);
    store = emailLogStore(db);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await db.disconnect();
  });

  const rowsTo = (address: string) =>
    platform.emailLog.findMany({ where: { toAddress: address }, orderBy: { createdAt: "asc" } });

  it("records the email as sent, and sends it with the row's id for the provider's reports", async () => {
    const inner = createMemoryEmailSender();
    const sender = recordedEmailSender(inner, store, createMemoryLogger());
    const sent = message();
    await sender.send(sent);

    const [row, ...others] = await rowsTo(sent.to.address);
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      purpose: "notification",
      sourceRef: "notification:0199a000-0000-7000-8000-000000000001",
      toName: "Asha Owner",
      fromName: "Sharma Travels via Test Sender",
      replyTo: "hello@sharma.example",
      subject: "Your quotation was opened",
      textBody: sent.text,
      htmlBody: sent.html,
      headers: { "List-Unsubscribe": "<https://app.example/account/notifications>" },
      status: "sent",
      failureSource: null,
      failureCode: null,
      failedAt: null,
      resentFromId: null,
    });
    expect(row?.sentAt).toBeInstanceOf(Date);
    expect(inner.sent).toEqual([{ ...sent, headers: { ...sent.headers, [EMAIL_REFERENCE_HEADER]: row?.id } }]);
  });

  it("marks a failed send failed with the adapter's safe code, and rethrows the very same error", async () => {
    const error = smtpError();
    const inner = failingSender(error);
    const sender = recordedEmailSender(inner, store, createMemoryLogger());
    const sent = message();
    const thrown = await sender.send(sent).catch((caught: unknown) => caught);
    expect(thrown).toBe(error);

    const [row] = await rowsTo(sent.to.address);
    expect(row).toMatchObject({
      status: "failed",
      failureSource: "smtp",
      failureCode: "EAUTH (SMTP 535)",
      failureReason: null,
      sentAt: null,
    });
    expect(row?.failedAt).toBeInstanceOf(Date);
    expect(inner.tried).toHaveLength(1);
  });

  it("names a failure without a code by its error's name, never its message", async () => {
    const sender = recordedEmailSender(
      failingSender(new RangeError("The email's subject has a line break")),
      store,
      createMemoryLogger(),
    );
    const sent = message();
    await expect(sender.send(sent)).rejects.toThrow(RangeError);
    expect((await rowsTo(sent.to.address))[0]).toMatchObject({ status: "failed", failureCode: "RangeError" });
  });

  it("makes one row per attempt of a retried email", async () => {
    const sent = message();
    await recordedEmailSender(failingSender(smtpError()), store, createMemoryLogger())
      .send(sent)
      .catch(() => undefined);
    await recordedEmailSender(createMemoryEmailSender(), store, createMemoryLogger()).send(sent);
    expect((await rowsTo(sent.to.address)).map((row) => row.status)).toEqual(["failed", "sent"]);
  });

  it("records a purpose it can't store as other, and an email without one too", async () => {
    const sender = recordedEmailSender(createMemoryEmailSender(), store, createMemoryLogger());
    const odd = message({ purpose: "Password Reset!", sourceRef: undefined });
    const none = message({ purpose: undefined, sourceRef: undefined });
    await sender.send(odd);
    await sender.send(none);
    expect((await rowsTo(odd.to.address))[0]).toMatchObject({ purpose: "other", sourceRef: null });
    expect((await rowsTo(none.to.address))[0]).toMatchObject({ purpose: "other" });
  });

  it("sends the email anyway when it can't be recorded, and warns once by names and codes", async () => {
    const broken: EmailLogStore = {
      ...store,
      started: () => Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })),
    };
    const inner = createMemoryEmailSender();
    const logger = createMemoryLogger({ censor: false });
    const sent = message();
    await recordedEmailSender(inner, broken, logger).send(sent);

    expect(inner.sent).toEqual([sent]);
    expect(logger.entries).toEqual([
      expect.objectContaining({ level: "warn", errorName: "Error", errorCode: "ECONNREFUSED" }),
    ]);
    expect(JSON.stringify(logger.entries)).not.toContain(sent.to.address);
    expect(await rowsTo(sent.to.address)).toEqual([]);
  });

  it("neither throws nor sends again when the outcome can't be recorded", async () => {
    const broken: EmailLogStore = { ...store, sent: () => Promise.reject(new Error("the database went away")) };
    const inner = createMemoryEmailSender();
    const logger = createMemoryLogger({ censor: false });
    await recordedEmailSender(inner, broken, logger).send(message());
    expect(inner.sent).toHaveLength(1);
    expect(logger.entries).toEqual([expect.objectContaining({ level: "warn" })]);
  });

  it("resends a stored email as a new row naming it, with its purpose and source, and answers its status", async () => {
    const original = message();
    await recordedEmailSender(failingSender(smtpError()), store, createMemoryLogger())
      .send(original)
      .catch(() => undefined);
    const [failed] = await rowsTo(original.to.address);
    const inner = createMemoryEmailSender();
    const sender = recordedEmailSender(inner, store, createMemoryLogger());

    const resent = await sender.resend({ id: failed?.id ?? "", ...original });
    const rows = await rowsTo(original.to.address);
    expect(rows.map((row) => row.status)).toEqual(["failed", "sent"]);
    expect(resent).toEqual({ id: rows[1]?.id, status: "sent" });
    expect(rows[1]).toMatchObject({
      resentFromId: failed?.id,
      purpose: original.purpose,
      sourceRef: original.sourceRef,
      subject: original.subject,
    });
    expect(inner.sent[0]?.headers?.[EMAIL_REFERENCE_HEADER]).toBe(rows[1]?.id);

    const again = await recordedEmailSender(failingSender(smtpError()), store, createMemoryLogger()).resend({
      id: failed?.id ?? "",
      ...original,
    });
    expect(again).toEqual({ id: expect.any(String) as string, status: "failed", failureCode: "EAUTH (SMTP 535)" });
  });
});

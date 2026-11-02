// Brevo's reports of emails it accepted and then dropped (the failed-emails spec): the row named by our reference is
// marked failed by the provider, with Brevo's event, reason and time; an unknown or malformed reference changes
// nothing; a report processed twice leaves the same row; and our own "sent" never undoes a report that arrived first.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createMemoryEmailSender, type EmailMessage, type EmailSender } from "@travel-crm/integrations/email";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  EMAIL_REFERENCE_HEADER,
  emailLogStore,
  recordedEmailSender,
  recordProviderFailures,
} from "../../src/email-log/index.js";

const message = (): EmailMessage => ({
  to: { address: `meera-${crypto.randomUUID()}@agency.example` },
  fromName: "Sharma Travels via Veeper AI",
  subject: "Your account for Sharma Travels",
  text: "Choose your password",
  html: "<p>Choose your password</p>",
  purpose: "staff-invite",
});

describe("the provider's failure reports", () => {
  let db: Database;
  let platform: PlatformClient;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await db.disconnect();
  });

  /** Sends one email through the recording wrapper and returns the reference it carried. */
  async function sent(inner: EmailSender = createMemoryEmailSender()): Promise<string> {
    let reference = "";
    const capturing: EmailSender = {
      send: async (sentMessage) => {
        reference = sentMessage.headers?.[EMAIL_REFERENCE_HEADER] ?? "";
        await inner.send(sentMessage);
      },
    };
    await recordedEmailSender(capturing, emailLogStore(db), createMemoryLogger()).send(message());
    return reference;
  }

  const rowOf = (id: string) => platform.emailLog.findUniqueOrThrow({ where: { id } });
  const at = new Date("2026-11-02T08:30:00.000Z");

  it("marks the email the reference names failed, by the provider, with its event, reason and time", async () => {
    const reference = await sent();
    const report = { reference, code: "blocked", reason: "x".repeat(1200), at };
    expect(await recordProviderFailures(db, [report])).toBe(1);
    const row = await rowOf(reference);
    expect(row).toMatchObject({
      status: "failed",
      failureSource: "provider",
      failureCode: "blocked",
      failureReason: "x".repeat(1000),
      failedAt: at,
    });
    // Twice gives the same row.
    expect(await recordProviderFailures(db, [report])).toBe(1);
    expect(await rowOf(reference)).toEqual(row);
  });

  it("changes nothing for a reference it doesn't hold or can't read", async () => {
    const reference = await sent();
    const before = await rowOf(reference);
    expect(
      await recordProviderFailures(db, [
        { reference: "0199a000-0000-7000-8000-0000000000f1", code: "hard_bounce", reason: null, at },
        { reference: "not-ours", code: "hard_bounce", reason: null, at },
        { reference: "", code: "hard_bounce", reason: null, at },
      ]),
    ).toBe(0);
    expect(await rowOf(reference)).toEqual(before);
  });

  it("keeps a report that arrived before our own send was marked sent", async () => {
    let reference = "";
    // The provider's report is processed while our send is still finishing.
    const slow: EmailSender = {
      send: async (sentMessage) => {
        reference = sentMessage.headers?.[EMAIL_REFERENCE_HEADER] ?? "";
        await recordProviderFailures(db, [{ reference, code: "error", reason: "Account under review", at }]);
      },
    };
    await recordedEmailSender(slow, emailLogStore(db), createMemoryLogger()).send(message());
    expect(await rowOf(reference)).toMatchObject({ status: "failed", failureCode: "error", sentAt: null });
  });
});

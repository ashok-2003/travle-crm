// email_log keeps every email the product sends, as sent (the failed-emails spec, 2026-11-02). No organization_id, so
// no row-level security: the runtime role records sends and their outcome but never changes what was sent or deletes
// a row; the platform role reads and deletes (the console's list, the purge, an erasure) and never writes one.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { emailLogs } from "../src/email-log.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";

/** A row as the recording wrapper first inserts it. */
const sending = (overrides: Record<string, unknown> = {}) => ({
  purpose: "password-reset",
  toAddress: `asha-${randomUUID()}@example.test`,
  fromName: "Example Sender",
  subject: "Reset your password",
  textBody: "Choose a new password",
  htmlBody: "<p>Choose a new password</p>",
  ...overrides,
});

describe("the email log table", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const insert = (overrides: Record<string, unknown> = {}) =>
    db.withoutOrg((tx) => emailLogs(tx).create({ data: sending(overrides) }));

  it("has no organization_id, and exactly the columns it should", async () => {
    // The catalog, not information_schema, which shows the platform role only what it may use.
    const columns = await platform.$queryRaw<{ column_name: string }[]>`
      SELECT attname AS column_name FROM pg_attribute
      WHERE attrelid = 'public.email_log'::regclass AND attnum > 0 AND NOT attisdropped
      ORDER BY attname`;
    expect(columns.map((column) => column.column_name)).toEqual([
      "created_at",
      "failed_at",
      "failure_code",
      "failure_reason",
      "failure_source",
      "from_name",
      "headers",
      "html_body",
      "id",
      "purpose",
      "reply_to",
      "resent_from_id",
      "sent_at",
      "source_ref",
      "status",
      "subject",
      "text_body",
      "to_address",
      "to_name",
    ]);
  });

  it("lets the runtime role record sends and outcomes, and the platform role read and delete", async () => {
    const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const held = async (role: string) => {
      const found = await Promise.all(
        privileges.map(async (privilege) => {
          const [row] = await platform.$queryRaw<{ held: boolean }[]>`
            SELECT has_table_privilege(${role}, 'public.email_log', ${privilege}) AS held`;
          return row?.held === true ? privilege : null;
        }),
      );
      return found.filter((privilege) => privilege !== null).sort();
    };
    expect(await held("app_runtime")).toEqual(["INSERT", "SELECT"]);
    expect(await held("app_platform")).toEqual(["DELETE", "SELECT"]);

    const updatable = await platform.$queryRaw<{ column_name: string }[]>`
      SELECT attname AS column_name FROM pg_attribute
      WHERE attrelid = 'public.email_log'::regclass AND attnum > 0 AND NOT attisdropped
        AND has_column_privilege('app_runtime', 'public.email_log', attname, 'UPDATE')
      ORDER BY attname`;
    expect(updatable.map((column) => column.column_name)).toEqual([
      "failed_at",
      "failure_code",
      "failure_reason",
      "failure_source",
      "sent_at",
      "status",
    ]);
  });

  it("never lets the runtime role change what was sent, or delete a row", async () => {
    const row = await insert();
    await expect(
      db.withoutOrg((tx) => emailLogs(tx).updateMany({ where: { id: row.id }, data: { subject: "Something else" } })),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.withoutOrg((tx) => emailLogs(tx).deleteMany({ where: { id: row.id } }))).rejects.toThrow(
      /permission denied/i,
    );
    await db.withoutOrg((tx) =>
      emailLogs(tx).updateMany({ where: { id: row.id }, data: { status: "sent", sentAt: new Date() } }),
    );
    expect(await platform.emailLog.findUnique({ where: { id: row.id }, select: { status: true } })).toEqual({
      status: "sent",
    });
  });

  it("refuses a purpose that isn't lower-case words, and a status it doesn't know", async () => {
    await expect(insert({ purpose: "Password reset" })).rejects.toThrow(/email_log_purpose_format/);
    await expect(insert({ purpose: "" })).rejects.toThrow(/email_log_purpose_format/);
    await expect(insert({ status: "bounced" })).rejects.toThrow(/email_log_status_value/);
    await expect(insert({ headers: ["List-Unsubscribe"] })).rejects.toThrow(/email_log_headers_object/);
  });

  it("holds a failed row to a source, a code and a time, and only a failed row", async () => {
    const failedAt = new Date();
    await expect(insert({ status: "failed" })).rejects.toThrow(/email_log_failure/);
    await expect(insert({ status: "failed", failureSource: "smtp", failedAt })).rejects.toThrow(/email_log_failure/);
    await expect(insert({ status: "failed", failureSource: "bounce", failureCode: "x", failedAt })).rejects.toThrow(
      /email_log_failure_source_value/,
    );
    await expect(insert({ failureSource: "smtp", failureCode: "EAUTH", failedAt })).rejects.toThrow(
      /email_log_failure/,
    );
    await expect(insert({ status: "sent" })).rejects.toThrow(/email_log_sent_at/);
    await expect(
      insert({
        status: "failed",
        failureSource: "provider",
        failureCode: "blocked",
        failureReason: "x".repeat(1001),
        failedAt,
      }),
    ).rejects.toThrow(/email_log_failure_reason_length/);
    const failed = await insert({
      status: "failed",
      failureSource: "provider",
      failureCode: "blocked",
      failureReason: "x".repeat(1000),
      failedAt,
    });
    expect(failed.status).toBe("failed");
  });

  it("keeps a resend when the purge deletes the email it copied, without the link", async () => {
    const original = await insert();
    const resend = await insert({ resentFromId: original.id });
    await platform.emailLog.deleteMany({ where: { id: original.id } });
    expect(await platform.emailLog.findUnique({ where: { id: resend.id }, select: { resentFromId: true } })).toEqual({
      resentFromId: null,
    });
  });
});

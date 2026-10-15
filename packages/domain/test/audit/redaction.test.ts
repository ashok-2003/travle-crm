// The audit log's part in erasure (spec 5, ADR 0015): one record's entries for the export, then their snapshots
// redacted by the platform role, keeping who did what and when; and a month's changes, counted for the dashboard.
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { auditEntriesAbout, auditEntriesSince, recordAudit, redactAuditEntries } from "../../src/audit/index.js";
import type { Actor } from "../../src/kernel/index.js";

const traveller = "0199e7a0-0000-7000-8000-0000000000e7";
const someoneElse = "0199e7a0-0000-7000-8000-0000000000e8";

describe("the audit log in erasure", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let owner: Actor;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Audit erasure");
    owner = { organizationId, userId: "0199e7a0-0000-7000-8000-0000000000e9", source: "web", impersonatedBy: null };
    await db.forOrg(organizationId, async (tx) => {
      for (let edit = 0; edit < 104; edit += 1) {
        await recordAudit(tx, owner, {
          action: "traveller.updated",
          entityType: "traveller",
          entityId: traveller,
          before: { phone: `+9198765${String(edit).padStart(5, "0")}` },
          after: { phone: `+9198765${String(edit + 1).padStart(5, "0")}` },
        });
      }
      await recordAudit(tx, owner, { action: "traveller.deleted", entityType: "traveller", entityId: traveller });
      await recordAudit(tx, owner, {
        action: "traveller.updated",
        entityType: "traveller",
        entityId: someoneElse,
        after: { name: "Ravi" },
      });
    });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("lists every entry about the record, past one page, for the export", async () => {
    const entries = await db.forOrg(organizationId, (tx) =>
      auditEntriesAbout(tx, { organizationId, entityType: "traveller", entityId: traveller }),
    );
    expect(entries).toHaveLength(105);
    expect(entries.every((entry) => entry.entityId === traveller)).toBe(true);
  });

  it("redacts the record's snapshots, keeping who did what and when, and nobody else's", async () => {
    const record = { organizationId, entityType: "traveller", entityId: traveller };
    expect(await platformDb.transaction((tx) => redactAuditEntries(tx, record))).toBe(104);
    const rows = await platform.auditEntry.findMany({ where: { organizationId }, orderBy: { id: "asc" } });
    const about = rows.filter((row) => row.entityId === traveller);
    expect(
      about
        .slice(0, 104)
        .every((row) => JSON.stringify([row.before, row.after]) === '[{"redacted":true},{"redacted":true}]'),
    ).toBe(true);
    expect(about.at(-1)).toMatchObject({
      action: "traveller.deleted",
      before: null,
      after: null,
      actorUserId: owner.userId,
    });
    expect(rows.find((row) => row.entityId === someoneElse)?.after).toEqual({ name: "Ravi" });
    // Redacting again finds nothing left to redact.
    expect(await platformDb.transaction((tx) => redactAuditEntries(tx, record))).toBe(0);
  });

  it("can't be redacted by the runtime role", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        redactAuditEntries(tx, { organizationId, entityType: "traveller", entityId: someoneElse }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("counts the changes recorded since a day, for the dashboard", async () => {
    expect(await db.forOrg(organizationId, (tx) => auditEntriesSince(tx, new Date(Date.now() - 60_000)))).toBe(106);
    expect(await db.forOrg(organizationId, (tx) => auditEntriesSince(tx, new Date(Date.now() + 60_000)))).toBe(0);
  });
});

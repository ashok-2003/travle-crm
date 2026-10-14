// listAuditEntries pages through an organization's log newest first, or one record's history, and nothing else.
import { listAuditEntriesInput } from "@travel-crm/contracts/audit";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listAuditEntries, recordAudit } from "../../src/audit/index.js";
import type { Actor } from "../../src/kernel/index.js";

const roleId = "0199e7a0-0000-7000-8000-000000000201";
const memberIds = [
  "0199e7a0-0000-7000-8000-000000000211",
  "0199e7a0-0000-7000-8000-000000000212",
  "0199e7a0-0000-7000-8000-000000000213",
];

describe("listAuditEntries", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Audit list");
    const owner: Actor = {
      organizationId,
      userId: "0199e7a0-0000-7000-8000-0000000002f1",
      source: "web",
      impersonatedBy: null,
    };
    // One transaction per entry, so each has its own time.
    for (const memberId of memberIds) {
      await db.forOrg(organizationId, (tx) =>
        recordAudit(tx, owner, { action: "staff.created", entityType: "member", entityId: memberId }),
      );
    }
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, owner, { action: "role.created", entityType: "role", entityId: roleId, after: { name: "Visa" } }),
    );
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const list = (input: unknown) =>
    db.forOrg(organizationId, (tx) => listAuditEntries(tx, listAuditEntriesInput.parse(input)));

  it("lists newest first, a page at a time, until there is no next page", async () => {
    const first = await list({ limit: 3 });
    expect(first.entries.map((entry) => entry.entityId)).toEqual([roleId, memberIds[2], memberIds[1]]);
    expect(first.nextCursor).toBe(first.entries[2]?.id);
    const second = await list({ limit: 3, before: first.nextCursor });
    expect(second.entries.map((entry) => entry.entityId)).toEqual([memberIds[0]]);
    expect(second.nextCursor).toBeNull();
  });

  it("gives entries as the contract shows them", async () => {
    const [newest] = (await list({ limit: 1 })).entries;
    expect(newest?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(newest?.occurredAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(newest).toMatchObject({
      actorUserId: "0199e7a0-0000-7000-8000-0000000002f1",
      source: "web",
      impersonatedBy: null,
      action: "role.created",
      entityType: "role",
      entityId: roleId,
      before: null,
      after: { name: "Visa" },
    });
  });

  it("lists one record's history", async () => {
    const history = await list({ entityType: "member", entityId: memberIds[1] });
    expect(history.entries.map((entry) => entry.action)).toEqual(["staff.created"]);
  });

  it("shows another organization nothing", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Other audit list");
    const page = await db.forOrg(otherOrganizationId, (tx) => listAuditEntries(tx, listAuditEntriesInput.parse({})));
    expect(page).toEqual({ entries: [], nextCursor: null });
    // Naming this organization's entries, as a cursor and as a record to filter by, finds nothing there either.
    const ours = await list({ limit: 1 });
    const named = await db.forOrg(otherOrganizationId, (tx) =>
      listAuditEntries(
        tx,
        listAuditEntriesInput.parse({ before: ours.entries[0]?.id, entityType: "member", entityId: memberIds[0] }),
      ),
    );
    expect(named).toEqual({ entries: [], nextCursor: null });
  });
});

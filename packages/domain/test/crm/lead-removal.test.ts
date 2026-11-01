// Removing leads (the owner, 2026-11-01): one lead leaves every read with its open follow-ups cancelled and an audit
// entry, a lead out of the member's scope is not found, and every lead at once is an Owner's alone.
import { randomUUID } from "node:crypto";
import { createDatabase, withDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { removeAllLeads, removeLead } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, aTask } from "./support/records.js";

describe("removing leads", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;
  let manager: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const leadOf = (ownerUserId: string) =>
    inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx)).id, ownerUserId }));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Lead removal");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("removes the lead, cancels its open follow-ups and records who removed it", async () => {
    const lead = await leadOf(owner.userId);
    const task = await inOrg((tx) =>
      aTask(tx, { kind: "follow-up", record: { recordType: "lead", recordId: lead.id } }),
    );
    await inOrg((tx) => removeLead(tx, owner, lead.id, new Date()));

    expect(await inOrg((tx) => tx.lead.findUnique({ where: { id: lead.id } }))).toBeNull();
    const removed = await withDeleted(() => inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } })));
    expect(removed.deletedBy).toBe(owner.userId);
    const cancelled = await inOrg((tx) => tx.task.findUniqueOrThrow({ where: { id: task.id } }));
    expect(cancelled.cancelledAt).not.toBeNull();
    const audit = await inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: lead.id, action: "lead.deleted" } }));
    expect(audit).toHaveLength(1);
  });

  it("says a removed lead is not found when it is removed again", async () => {
    const lead = await leadOf(owner.userId);
    await inOrg((tx) => removeLead(tx, owner, lead.id, new Date()));
    await expect(inOrg((tx) => removeLead(tx, owner, lead.id, new Date()))).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
  });

  it("refuses every lead at once to anyone but an Owner", async () => {
    await expect(removeAllLeads(db, manager)).rejects.toMatchObject({ reason: "OWNER_ONLY" });
  });

  it("removes every lead at once for an Owner", async () => {
    await leadOf(owner.userId);
    await leadOf(manager.userId);
    const result = await removeAllLeads(db, owner);
    expect(result.removed).toBeGreaterThanOrEqual(2);
    expect(result.kept).toBe(0);
    expect(await inOrg((tx) => tx.lead.count())).toBe(0);
  });
});

// Follow-ups and tasks on a lead (spec 3.4, 4; R21, R25): given to the lead's owner whoever adds them, due at a day and
// time on the agency's clock (Asia/Kolkata here), never in the past, and "follow-up added" on the lead's timeline.
import { randomUUID } from "node:crypto";
import { addLeadWorkInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { addLeadWork } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead } from "./support/records.js";

describe("work on a lead", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let asha: string;
  /** 10:30 in Asia/Kolkata on 17 Oct. */
  const now = new Date("2026-10-17T05:00:00Z");

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const add = (input: Record<string, unknown>) =>
    inOrg((tx) => addLeadWork(tx, manager, addLeadWorkInput.parse(input), now));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Lead work");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    asha = randomUUID();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("adds a follow-up or a task to a lead, given to its owner, and writes follow-up-added", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: asha }));
    const followUp = await add({
      leadId: lead.id,
      kind: "follow-up",
      title: "Send the Kashmir quote",
      due: { on: "2026-10-18", at: "16:00" },
    });
    expect(followUp).toMatchObject({
      kind: "follow-up",
      title: "Send the Kashmir quote",
      dueAt: "2026-10-18T10:30:00.000Z",
      assigneeUserId: asha,
      record: { recordType: "lead", recordId: lead.id },
      doneAt: null,
    });
    const task = await add({
      leadId: lead.id,
      kind: "task",
      title: "Check visas",
      due: { on: "2026-10-17", at: "18:00" },
    });
    expect(task).toMatchObject({ kind: "task", assigneeUserId: asha, dueAt: "2026-10-17T12:30:00.000Z" });
    const entries = await inOrg((tx) =>
      tx.leadTimelineEntry.findMany({ where: { leadId: lead.id }, orderBy: { id: "asc" } }),
    );
    expect(entries.map((entry) => [entry.kind, entry.recordType, entry.recordId, entry.actorUserId])).toEqual([
      ["follow-up-added", "task", followUp.id, manager.userId],
      ["follow-up-added", "task", task.id, manager.userId],
    ]);
    const audit = await inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: followUp.id } }));
    expect(audit).toMatchObject([{ action: "task.added", after: { kind: "follow-up", assigneeUserId: asha } }]);
  });

  it("refuses work due before now", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: asha }));
    await expect(
      add({ leadId: lead.id, kind: "follow-up", title: "Call back", due: { on: "2026-10-17", at: "09:00" } }),
    ).rejects.toMatchObject({ reason: "DUE_IN_THE_PAST" });
    expect(await inOrg((tx) => tx.task.count({ where: { recordId: lead.id } }))).toBe(0);
    expect(await inOrg((tx) => tx.leadTimelineEntry.count({ where: { leadId: lead.id } }))).toBe(0);
  });
});

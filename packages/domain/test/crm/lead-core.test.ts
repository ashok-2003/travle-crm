// The two changes every door into a lead shares (P9): moving its stage and changing its owner. A move keeps the open
// stage it left and the first reply, closes the lead's open tasks on Lost and Not a lead (R29), and records a reopen;
// an owner change takes the lead's open tasks along (R21) and tells the new owner, unless the system did it (R27).
// Each writes its timeline entry, audit entry and event; a change to what already is records nothing (R31).
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { changeLeadOwner, changeLeadStage } from "../../src/crm/lead-core.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, aTask } from "./support/records.js";

describe("the lead core", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let asha: string;
  let ravi: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const leadRow = (id: string) => inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id } }));
  const timeline = (leadId: string) =>
    inOrg((tx) => tx.leadTimelineEntry.findMany({ where: { leadId }, orderBy: { id: "asc" } }));
  const audit = (entityId: string) =>
    inOrg((tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));
  const events = (leadId: string) =>
    inOrg(async (tx) =>
      (await tx.outboxEvent.findMany({ orderBy: { id: "asc" } })).filter(
        (event) => (event.payload as { leadId?: string }).leadId === leadId,
      ),
    );
  const followUpOn = (leadId: string, assigneeUserId: string, extra: { doneAt?: Date } = {}) =>
    inOrg((tx) =>
      aTask(tx, { kind: "follow-up", record: { recordType: "lead", recordId: leadId }, assigneeUserId, ...extra }),
    );

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Lead core");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    [asha, ravi] = [randomUUID(), randomUUID()];
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("moves a lead's stage, keeping the open stage it left and the first reply, and writes stage-changed", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: asha }));
    const now = new Date("2026-10-17T05:00:00Z");
    expect(await inOrg((tx) => changeLeadStage(tx, manager, { leadId: lead.id, stage: "contacted" }, now))).toBe(true);
    expect(await leadRow(lead.id)).toMatchObject({
      stage: "contacted",
      reopenStage: "new",
      stageChangedAt: now,
      firstReplyAt: now,
    });
    const later = new Date("2026-10-18T05:00:00Z");
    await inOrg((tx) => changeLeadStage(tx, manager, { leadId: lead.id, stage: "new" }, later));
    await inOrg((tx) => changeLeadStage(tx, manager, { leadId: lead.id, stage: "quote_sent" }, later));
    expect(await leadRow(lead.id)).toMatchObject({ stage: "quote_sent", reopenStage: "new", firstReplyAt: now });

    expect(await inOrg((tx) => changeLeadStage(tx, manager, { leadId: lead.id, stage: "quote_sent" }, later))).toBe(
      false,
    );
    expect((await timeline(lead.id)).map((entry) => [entry.kind, entry.stage, entry.actorUserId])).toEqual([
      ["stage-changed", "contacted", manager.userId],
      ["stage-changed", "new", manager.userId],
      ["stage-changed", "quote_sent", manager.userId],
    ]);
    const entries = await audit(lead.id);
    expect(entries.map((entry) => entry.action)).toEqual(Array(3).fill("lead.stage-changed"));
    expect(entries[0]).toMatchObject({ entityType: "lead", before: { stage: "new" }, after: { stage: "contacted" } });
    expect((await events(lead.id)).map((event) => [event.type, event.payload])).toContainEqual([
      "lead.stage-changed",
      { leadId: lead.id, from: "new", to: "contacted" },
    ]);
  });

  it("cancels every open task on Lost and Not a lead, keeps them on Won, and records a reopen", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: asha, stage: "contacted", reopenStage: "new" }));
    const open = await followUpOn(lead.id, asha);
    const task = await inOrg((tx) =>
      aTask(tx, { record: { recordType: "lead", recordId: lead.id }, assigneeUserId: asha }),
    );
    const done = await followUpOn(lead.id, asha, { doneAt: new Date() });
    const now = new Date();
    await inOrg((tx) => changeLeadStage(tx, manager, { leadId: lead.id, stage: "lost" }, now));
    const tasks = await inOrg((tx) => tx.task.findMany({ where: { recordId: lead.id } }));
    expect(new Map(tasks.map((row) => [row.id, row.cancelledAt]))).toEqual(
      new Map([
        [open.id, now],
        [task.id, now],
        [done.id, null],
      ]),
    );
    expect(await leadRow(lead.id)).toMatchObject({ stage: "lost", reopenStage: "contacted" });
    const kinds = (await timeline(lead.id)).map((entry) => [entry.kind, entry.recordId ?? entry.stage]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ["follow-up-cancelled", open.id],
        ["follow-up-cancelled", task.id],
        ["stage-changed", "lost"],
      ]),
    );

    await inOrg((tx) => changeLeadStage(tx, manager, { leadId: lead.id, stage: "contacted" }, new Date()));
    expect((await audit(lead.id)).map((entry) => entry.action)).toEqual(["lead.stage-changed", "lead.reopened"]);
    expect(await inOrg((tx) => tx.task.count({ where: { recordId: lead.id, doneAt: null, cancelledAt: null } }))).toBe(
      0,
    );

    const won = await inOrg((tx) => aLead(tx, { ownerUserId: asha, stage: "booking_requested" }));
    const kept = await followUpOn(won.id, asha);
    await inOrg((tx) => changeLeadStage(tx, manager, { leadId: won.id, stage: "won" }, new Date()));
    expect(await inOrg((tx) => tx.task.findUniqueOrThrow({ where: { id: kept.id } }))).toMatchObject({
      cancelledAt: null,
    });
    expect(await leadRow(won.id)).toMatchObject({ stage: "won", reopenStage: "booking_requested" });
  });

  it("leaves the first reply unset when a new lead becomes Not a lead", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: asha }));
    await inOrg((tx) => changeLeadStage(tx, manager, { leadId: lead.id, stage: "not_a_lead" }, new Date()));
    expect(await leadRow(lead.id)).toMatchObject({ stage: "not_a_lead", reopenStage: "new", firstReplyAt: null });
    await expect(
      inOrg((tx) => changeLeadStage(tx, manager, { leadId: randomUUID(), stage: "won" }, new Date())),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("moves the owner with the lead's open tasks, writes reassigned, and tells the new owner", async () => {
    const lead = await inOrg(async (tx) => {
      const kashmir = await tx.destination.create({ data: { name: `Kashmir ${randomUUID().slice(0, 6)}` } });
      const person = await aPerson(tx, { name: "Rahul Sharma" });
      return aLead(tx, { ownerUserId: asha, personId: person.id, destinationId: kashmir.id });
    });
    const open = [(await followUpOn(lead.id, asha)).id, (await followUpOn(lead.id, asha)).id];
    const done = (await followUpOn(lead.id, asha, { doneAt: new Date() })).id;
    expect(await inOrg((tx) => changeLeadOwner(tx, manager, { leadId: lead.id, ownerUserId: ravi }))).toBe(true);
    expect((await leadRow(lead.id)).ownerUserId).toBe(ravi);
    const tasks = await inOrg((tx) => tx.task.findMany({ where: { recordId: lead.id } }));
    expect(new Map(tasks.map((row) => [row.id, row.assigneeUserId]))).toEqual(
      new Map([
        [open[0] ?? "", ravi],
        [open[1] ?? "", ravi],
        [done, asha],
      ]),
    );
    expect((await timeline(lead.id)).map((entry) => [entry.kind, entry.ownerUserId])).toEqual([["reassigned", ravi]]);
    expect(await audit(lead.id)).toMatchObject([
      { action: "lead.reassigned", before: { ownerUserId: asha }, after: { ownerUserId: ravi } },
    ]);
    expect((await events(lead.id)).map((event) => [event.type, event.payload])).toContainEqual([
      "lead.reassigned",
      { leadId: lead.id, fromUserId: asha, toUserId: ravi },
    ]);
    const told = await inOrg((tx) => tx.notification.findMany({ where: { link: `/leads/${lead.id}` } }));
    expect(told).toMatchObject([{ recipientUserId: ravi, kind: "lead.assigned", title: "New lead assigned to you" }]);
    expect(told[0]?.body).toMatch(/^Rahul Sharma · Kashmir /);

    expect(await inOrg((tx) => changeLeadOwner(tx, manager, { leadId: lead.id, ownerUserId: ravi }))).toBe(false);
    expect(await timeline(lead.id)).toHaveLength(1);
  });

  it("tells nobody when the system hands a lead over", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: asha }));
    await inOrg((tx) => changeLeadOwner(tx, systemActor(organizationId), { leadId: lead.id, ownerUserId: ravi }));
    expect((await timeline(lead.id)).map((entry) => [entry.kind, entry.actorUserId])).toEqual([["reassigned", null]]);
    expect(await inOrg((tx) => tx.notification.count({ where: { link: `/leads/${lead.id}` } }))).toBe(0);
    expect((await audit(lead.id))[0]).toMatchObject({ action: "lead.reassigned", source: "job", actorUserId: null });
  });
});

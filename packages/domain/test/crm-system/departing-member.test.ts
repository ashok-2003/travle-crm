// When someone leaves (spec 4, R15, R37): on staff.removed, their open leads, with those leads' open tasks, and their
// open standalone tasks go to the agency's Owner, as the system's change, 50 leads a transaction; closed leads and
// finished tasks stay as they were, and the event coming again changes nothing more.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { handOverDepartingMemberListener } from "../../src/crm/index.js";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { aLead, aTask } from "../crm/support/records.js";

describe("a departing member's work", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const leadOwner = (id: string) =>
    inOrg(async (tx) => (await tx.lead.findUniqueOrThrow({ where: { id } })).ownerUserId);
  const taskAssignee = (id: string) =>
    inOrg(async (tx) => (await tx.task.findUniqueOrThrow({ where: { id } })).assigneeUserId);
  const auditOf = (entityId: string) =>
    inOrg((tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));

  /** A member who leaves, the Owner who takes their work, and what the worker hands the listener. */
  function departure(options: { owner?: string | null } = {}) {
    const leaver = randomUUID();
    const owner = options.owner === undefined ? randomUUID() : options.owner;
    const asked: string[] = [];
    let transactions = 0;
    const listener = handOverDepartingMemberListener({
      firstOwner: (organization) => {
        asked.push(organization);
        return Promise.resolve(owner);
      },
    });
    const event: DomainEvent = {
      id: randomUUID(),
      organizationId,
      type: "staff.removed",
      payload: { memberId: randomUUID(), userId: leaver },
      occurredAt: new Date(),
    };
    const context: ListenerContext = {
      actor: systemActor(organizationId),
      forOrg: (work) => {
        transactions += 1;
        return db.forOrg(organizationId, work);
      },
    };
    return {
      leaver,
      owner: owner ?? "",
      asked,
      transactions: () => transactions,
      handOver: () => listener.handle(event, context),
    };
  }

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Departing member");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("is the crm's listener on staff.removed", () => {
    const listener = handOverDepartingMemberListener({ firstOwner: () => Promise.resolve(null) });
    expect(listener).toMatchObject({ name: "crm.hand-over-departing-member", eventType: "staff.removed" });
  });

  it("moves the member's open leads and their tasks, and their open standalone tasks, to the Owner", async () => {
    const { leaver, owner, asked, handOver } = departure();
    const stayer = randomUUID();
    const ids = await inOrg(async (tx) => {
      const fresh = await aLead(tx, { ownerUserId: leaver });
      const quoted = await aLead(tx, { ownerUserId: leaver, stage: "quote_sent" });
      const onQuoted = { recordType: "lead", recordId: quoted.id };
      return {
        fresh: fresh.id,
        quoted: quoted.id,
        followUp: (await aTask(tx, { kind: "follow-up", assigneeUserId: leaver, record: onQuoted })).id,
        task: (await aTask(tx, { assigneeUserId: leaver, record: onQuoted })).id,
        standalone: (await aTask(tx, { assigneeUserId: leaver })).id,
        othersLead: (await aLead(tx, { ownerUserId: stayer })).id,
        othersTask: (await aTask(tx, { assigneeUserId: stayer })).id,
      };
    });

    await handOver();

    expect(asked).toEqual([organizationId]);
    expect(await leadOwner(ids.fresh)).toBe(owner);
    expect(await leadOwner(ids.quoted)).toBe(owner);
    expect(await taskAssignee(ids.followUp)).toBe(owner);
    expect(await taskAssignee(ids.task)).toBe(owner);
    expect(await taskAssignee(ids.standalone)).toBe(owner);
    expect(await leadOwner(ids.othersLead)).toBe(stayer);
    expect(await taskAssignee(ids.othersTask)).toBe(stayer);
  });

  it("leaves their closed leads and done tasks as they were", async () => {
    const { leaver, owner, handOver } = departure();
    const now = new Date();
    const ids = await inOrg(async (tx) => {
      const open = await aLead(tx, { ownerUserId: leaver, stage: "contacted" });
      const onOpen = { recordType: "lead", recordId: open.id };
      return {
        open: open.id,
        doneFollowUp: (await aTask(tx, { kind: "follow-up", assigneeUserId: leaver, record: onOpen, doneAt: now })).id,
        won: (await aLead(tx, { ownerUserId: leaver, stage: "won" })).id,
        lost: (await aLead(tx, { ownerUserId: leaver, stage: "lost" })).id,
        notALead: (await aLead(tx, { ownerUserId: leaver, stage: "not_a_lead" })).id,
        doneTask: (await aTask(tx, { assigneeUserId: leaver, doneAt: now, doneBy: leaver })).id,
        cancelledTask: (await aTask(tx, { assigneeUserId: leaver, cancelledAt: now })).id,
      };
    });

    await handOver();

    expect(await leadOwner(ids.open)).toBe(owner);
    expect(await taskAssignee(ids.doneFollowUp)).toBe(leaver);
    for (const closed of [ids.won, ids.lost, ids.notALead]) expect(await leadOwner(closed)).toBe(leaver);
    expect(await taskAssignee(ids.doneTask)).toBe(leaver);
    expect(await taskAssignee(ids.cancelledTask)).toBe(leaver);
  });

  it("records each move as the system's, in the audit log and on the timeline", async () => {
    const { leaver, owner, handOver } = departure();
    const ids = await inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: leaver });
      const followUp = await aTask(tx, {
        kind: "follow-up",
        assigneeUserId: leaver,
        record: { recordType: "lead", recordId: lead.id },
      });
      return { lead: lead.id, followUp: followUp.id, standalone: (await aTask(tx, { assigneeUserId: leaver })).id };
    });

    await handOver();

    const system = { actorUserId: null, source: "job", impersonatedBy: null };
    expect(await auditOf(ids.lead)).toMatchObject([
      {
        ...system,
        action: "lead.reassigned",
        entityType: "lead",
        before: { ownerUserId: leaver },
        after: { ownerUserId: owner },
      },
    ]);
    for (const task of [ids.followUp, ids.standalone]) {
      expect(await auditOf(task)).toMatchObject([
        { ...system, action: "task.reassigned", before: { assigneeUserId: leaver }, after: { assigneeUserId: owner } },
      ]);
    }
    expect(await inOrg((tx) => tx.leadTimelineEntry.findMany({ where: { leadId: ids.lead } }))).toMatchObject([
      { kind: "reassigned", actorUserId: null, ownerUserId: owner },
    ]);
    // Managers reassign from here: the hand-over tells nobody (R27).
    expect(await inOrg((tx) => tx.notification.count({ where: { recipientUserId: owner } }))).toBe(0);
  });

  it("does nothing more when the event comes again", async () => {
    const { leaver, owner, handOver } = departure();
    const ids = await inOrg(async (tx) => ({
      lead: (await aLead(tx, { ownerUserId: leaver })).id,
      standalone: (await aTask(tx, { assigneeUserId: leaver })).id,
    }));

    await handOver();
    const entries = await inOrg((tx) =>
      tx.auditEntry.count({ where: { entityId: { in: [ids.lead, ids.standalone] } } }),
    );
    await handOver();

    expect(await leadOwner(ids.lead)).toBe(owner);
    expect(entries).toBe(2);
    expect(await inOrg((tx) => tx.auditEntry.count({ where: { entityId: { in: [ids.lead, ids.standalone] } } }))).toBe(
      entries,
    );
    expect(await inOrg((tx) => tx.leadTimelineEntry.count({ where: { leadId: ids.lead } }))).toBe(1);
  });

  it("moves 450 leads in batches of 50", async () => {
    const { leaver, owner, transactions, handOver } = departure();
    await inOrg(async (tx) => {
      const person = await tx.person.create({
        data: { name: "Many Leads", email: `many-${randomUUID()}@example.test` },
      });
      await tx.lead.createMany({
        data: Array.from({ length: 450 }, () => ({ personId: person.id, source: "phone_call", ownerUserId: leaver })),
      });
    });

    await handOver();

    expect(await inOrg((tx) => tx.lead.count({ where: { ownerUserId: owner } }))).toBe(450);
    expect(await inOrg((tx) => tx.lead.count({ where: { ownerUserId: leaver } }))).toBe(0);
    // Nine batches of 50 leads, a tenth that finds none left, then one for the standalone tasks.
    expect(transactions()).toBe(11);
  });

  it("moves nothing, and fails for the worker to retry, when the agency has no Owner", async () => {
    const { leaver, handOver, transactions } = departure({ owner: null });
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: leaver }));

    await expect(handOver()).rejects.toThrow("has no Owner");

    expect(await leadOwner(lead.id)).toBe(leaver);
    expect(transactions()).toBe(0);
  });
});

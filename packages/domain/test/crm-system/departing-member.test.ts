// When someone leaves (spec 4, R15, R37): on staff.removed, their open leads, with those leads' open tasks, the closed
// leads that still hold open tasks of theirs (a Won lead keeps its follow-ups), and their open standalone tasks go to
// the agency's Owner, as the system's change, 50 a transaction; other closed leads and finished tasks stay as they
// were, a lead a manager changes meanwhile keeps that change, and the event coming again changes nothing more.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { handOverDepartingMemberListener } from "../../src/crm/index.js";
import { changeLeadOwner, changeLeadStage } from "../../src/crm/lead-core.js";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import { systemActor, type Actor } from "../../src/kernel/index.js";
import { aLead, aTask } from "../crm/support/records.js";
import { backendPid, waitUntilBlockedBy } from "../lock-waits.js";

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
    db = createDatabase(urls.runtime, { maxConnections: 4 });
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

  it("moves a Won lead with an open follow-up", async () => {
    const { leaver, owner, handOver } = departure();
    const ids = await inOrg(async (tx) => {
      const won = await aLead(tx, { ownerUserId: leaver, stage: "won" });
      const followUp = await aTask(tx, {
        kind: "follow-up",
        assigneeUserId: leaver,
        record: { recordType: "lead", recordId: won.id },
      });
      return {
        won: won.id,
        followUp: followUp.id,
        wonWithout: (await aLead(tx, { ownerUserId: leaver, stage: "won" })).id,
      };
    });

    await handOver();

    expect(await leadOwner(ids.won)).toBe(owner);
    expect(await taskAssignee(ids.followUp)).toBe(owner);
    expect(await auditOf(ids.won)).toMatchObject([{ action: "lead.reassigned", actorUserId: null, source: "job" }]);
    // A closed lead with nothing left to do stays as it was.
    expect(await leadOwner(ids.wonWithout)).toBe(leaver);
  });

  it("keeps a manager's reassign or close that commits while the hand-over waits for the lead", async () => {
    const { leaver, owner, handOver } = departure();
    const [ravi, manager] = [randomUUID(), randomUUID()];
    const managerActor: Actor = { organizationId, userId: manager, source: "web", impersonatedBy: null };
    const [reassigned, lost, untouched] = await inOrg(async (tx) => [
      (await aLead(tx, { ownerUserId: leaver })).id,
      (await aLead(tx, { ownerUserId: leaver })).id,
      (await aLead(tx, { ownerUserId: leaver })).id,
    ]);
    let holder = 0;
    const released = Promise.withResolvers<undefined>();
    const changesMade = Promise.withResolvers<undefined>();
    const managersChanges = db.forOrg(
      organizationId,
      async (tx) => {
        holder = await backendPid(tx);
        await changeLeadOwner(tx, managerActor, { leadId: reassigned, ownerUserId: ravi });
        await changeLeadStage(tx, managerActor, { leadId: lost, stage: "lost" }, new Date());
        changesMade.resolve(undefined);
        await released.promise;
      },
      { timeout: 15_000 },
    );
    await changesMade.promise;

    const handingOver = handOver();
    await waitUntilBlockedBy(platform, holder);
    released.resolve(undefined);
    await managersChanges;
    await handingOver;

    expect(await leadOwner(reassigned)).toBe(ravi);
    expect(await leadOwner(lost)).toBe(leaver);
    expect(await leadOwner(untouched)).toBe(owner);
    expect((await auditOf(reassigned)).map((entry) => entry.actorUserId)).toEqual([manager]);
  });

  it("moves every lead left when some change while a batch waits on them", async () => {
    const { leaver, owner, handOver } = departure();
    const ravi = randomUUID();
    const { leadIds, given } = await inOrg(async (tx) => {
      const person = await tx.person.create({ data: { name: "Many Leads", email: `${randomUUID()}@example.test` } });
      const made = await tx.lead.createManyAndReturn({
        data: Array.from({ length: 80 }, () => ({ personId: person.id, source: "phone_call", ownerUserId: leaver })),
        select: { id: true },
      });
      const ravisLead = await aLead(tx, { ownerUserId: ravi });
      return { leadIds: made.map((lead) => lead.id).sort(), given: ravisLead.id };
    });
    // While the second batch waits on its leads, a manager gives two of them to Ravi, moves another on, and gives the
    // leaver one of Ravi's leads: the waiting batch can't see that one, and comes back with fewer than 50.
    const at = (index: number) => leadIds[index] ?? "";
    let holder = 0;
    const released = Promise.withResolvers<undefined>();
    const changed = Promise.withResolvers<undefined>();
    const managersChanges = db.forOrg(
      organizationId,
      async (tx) => {
        holder = await backendPid(tx);
        await tx.lead.updateMany({ where: { id: { in: [at(55), at(60)] } }, data: { ownerUserId: ravi } });
        await tx.lead.update({ where: { id: at(70) }, data: { stage: "contacted" } });
        await tx.lead.update({ where: { id: given }, data: { ownerUserId: leaver } });
        changed.resolve(undefined);
        await released.promise;
      },
      { timeout: 20_000 },
    );
    await changed.promise;

    const handingOver = handOver();
    await waitUntilBlockedBy(platform, holder);
    released.resolve(undefined);
    await managersChanges;
    await handingOver;

    const owners = await inOrg((tx) =>
      tx.lead.groupBy({ by: ["ownerUserId"], where: { id: { in: [...leadIds, given] } }, _count: true }),
    );
    expect(new Map(owners.map((group) => [group.ownerUserId, group._count]))).toEqual(
      new Map([
        [owner, 79],
        [ravi, 2],
      ]),
    );
  });

  /**
   * Runs the manager's changes in a transaction held open until the hand-over waits on it, then lets it commit and
   * waits for both.
   */
  async function whileAManagerChanges(change: (tx: OrgTx) => Promise<void>, handOver: () => Promise<void>) {
    let holder = 0;
    const released = Promise.withResolvers<undefined>();
    const changed = Promise.withResolvers<undefined>();
    const managersChanges = db.forOrg(
      organizationId,
      async (tx) => {
        holder = await backendPid(tx);
        await change(tx);
        changed.resolve(undefined);
        await released.promise;
      },
      { timeout: 20_000 },
    );
    await changed.promise;
    const handingOver = handOver();
    await waitUntilBlockedBy(platform, holder);
    released.resolve(undefined);
    await managersChanges;
    await handingOver;
  }

  const countBy = <T extends string | null>(values: T[]) => {
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  };

  it("moves every Won lead with open work when some change while a page waits on them", async () => {
    const { leaver, owner, handOver } = departure();
    const [ravi, manager] = [randomUUID(), randomUUID()];
    const managerActor: Actor = { organizationId, userId: manager, source: "web", impersonatedBy: null };
    const followUpOn = (tx: OrgTx, leadId: string, assigneeUserId: string) =>
      aTask(tx, { kind: "follow-up", assigneeUserId, record: { recordType: "lead", recordId: leadId } });
    const { byTask, ravisLead } = await inOrg(async (tx) => {
      // Ravi's Won lead comes first, so its follow-up is older than every one of the leaver's.
      const ravis = await aLead(tx, { ownerUserId: ravi, stage: "won" });
      await followUpOn(tx, ravis.id, ravi);
      const person = await tx.person.create({ data: { name: "Many Trips", email: `${randomUUID()}@example.test` } });
      const leads = await tx.lead.createManyAndReturn({
        data: Array.from({ length: 80 }, () => ({
          personId: person.id,
          source: "phone_call",
          ownerUserId: leaver,
          stage: "won",
        })),
        select: { id: true },
      });
      const tasks = [];
      for (const lead of leads) tasks.push({ taskId: (await followUpOn(tx, lead.id, leaver)).id, leadId: lead.id });
      return { byTask: tasks.sort((first, second) => first.taskId.localeCompare(second.taskId)), ravisLead: ravis.id };
    });
    const leadOfTask = (index: number) => byTask[index]?.leadId ?? "";

    // While the second page of the leaver's follow-ups waits on its leads, a manager gives two of those leads to Ravi,
    // edits a third, and gives the leaver Ravi's Won lead, whose follow-up sits behind the page's cursor.
    await whileAManagerChanges(async (tx) => {
      for (const index of [55, 60]) {
        await changeLeadOwner(tx, managerActor, { leadId: leadOfTask(index), ownerUserId: ravi });
      }
      await tx.lead.update({ where: { id: leadOfTask(70) }, data: { roomType: "Deluxe" } });
      await changeLeadOwner(tx, managerActor, { leadId: ravisLead, ownerUserId: leaver });
    }, handOver);

    const leadIds = [...byTask.map((task) => task.leadId), ravisLead];
    const owners = await inOrg((tx) =>
      tx.lead.findMany({ where: { id: { in: leadIds } }, select: { ownerUserId: true } }),
    );
    expect(countBy(owners.map((lead) => lead.ownerUserId))).toEqual(
      new Map([
        [owner, 79],
        [ravi, 2],
      ]),
    );
    const assignees = await inOrg((tx) =>
      tx.task.findMany({ where: { recordId: { in: leadIds } }, select: { assigneeUserId: true } }),
    );
    expect(countBy(assignees.map((task) => task.assigneeUserId))).toEqual(
      new Map([
        [owner, 79],
        [ravi, 2],
      ]),
    );
  });

  it("moves every standalone task left when some change while a batch waits on them", async () => {
    const { leaver, owner, handOver } = departure();
    const ravi = randomUUID();
    const { taskIds, ravisTask } = await inOrg(async (tx) => {
      // Ravi's task comes first, older than every one of the leaver's.
      const ravis = await aTask(tx, { assigneeUserId: ravi });
      const made = [];
      for (let index = 0; index < 80; index += 1) made.push((await aTask(tx, { assigneeUserId: leaver })).id);
      return { taskIds: made.sort(), ravisTask: ravis.id };
    });
    const at = (index: number) => taskIds[index] ?? "";

    // While the second batch waits on its tasks, a manager gives two to Ravi, edits a third, and gives the leaver
    // Ravi's task, which the waiting batch can't see.
    await whileAManagerChanges(async (tx) => {
      await tx.task.updateMany({ where: { id: { in: [at(55), at(60)] } }, data: { assigneeUserId: ravi } });
      await tx.task.update({ where: { id: at(70) }, data: { title: "Call back after lunch" } });
      await tx.task.update({ where: { id: ravisTask }, data: { assigneeUserId: leaver } });
    }, handOver);

    const assignees = await inOrg((tx) =>
      tx.task.findMany({ where: { id: { in: [...taskIds, ravisTask] } }, select: { assigneeUserId: true } }),
    );
    expect(countBy(assignees.map((task) => task.assigneeUserId))).toEqual(
      new Map([
        [owner, 79],
        [ravi, 2],
      ]),
    );
  });

  it("keeps a reassign of a standalone task that commits while the hand-over waits for it", async () => {
    const { leaver, owner, handOver } = departure();
    const ravi = randomUUID();
    const [reassigned, untouched] = await inOrg(async (tx) => [
      (await aTask(tx, { assigneeUserId: leaver })).id,
      (await aTask(tx, { assigneeUserId: leaver })).id,
    ]);
    let holder = 0;
    const released = Promise.withResolvers<undefined>();
    const changed = Promise.withResolvers<undefined>();
    // A manager gives the task to Ravi in a transaction that stays open until the hand-over waits on it.
    const managersChange = db.forOrg(
      organizationId,
      async (tx) => {
        holder = await backendPid(tx);
        await tx.task.update({ where: { id: reassigned }, data: { assigneeUserId: ravi } });
        changed.resolve(undefined);
        await released.promise;
      },
      { timeout: 15_000 },
    );
    await changed.promise;

    const handingOver = handOver();
    await waitUntilBlockedBy(platform, holder);
    released.resolve(undefined);
    await managersChange;
    await handingOver;

    expect(await taskAssignee(reassigned)).toBe(ravi);
    expect(await taskAssignee(untouched)).toBe(owner);
    expect(await auditOf(reassigned)).toEqual([]);
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
    // Nine batches of 50 open leads and a tenth that finds none left, one page of closed leads' tasks, and one for
    // the standalone tasks.
    expect(transactions()).toBe(12);
  });

  it("moves nothing, and fails for the worker to retry, when the agency has no Owner", async () => {
    const { leaver, handOver, transactions } = departure({ owner: null });
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: leaver }));

    await expect(handOver()).rejects.toThrow("has no Owner");

    expect(await leadOwner(lead.id)).toBe(leaver);
    expect(transactions()).toBe(0);
  });
});

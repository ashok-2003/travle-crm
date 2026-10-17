// Changing follow-ups and tasks (spec 3.5, 4): adding one for yourself or, with leads:assign, for someone who works
// leads; Done once; snoozing by the agency's clock while the first due time stays; and a record's open tasks
// cancelled or moved together. Each change is audited without its title (R28).
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  addStandaloneTask,
  cancelOpenTasks,
  completeTask,
  reassignOpenStandaloneTasks,
  reassignOpenTasks,
  redactTaskTitles,
  snoozeTask,
} from "../../src/tasks/index.js";
import { aTask } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const at = (iso: string) => new Date(iso);

describe("changing tasks", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;
  let sales: MemberAccess;
  let otherSales: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const auditOf = (entityId: string) =>
    inOrg((tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));
  const eventsOf = (taskId: string) =>
    inOrg(async (tx) =>
      (await tx.outboxEvent.findMany({ where: { payload: { equals: { taskId } } }, orderBy: { id: "asc" } })).map(
        (event) => event.type,
      ),
    );

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Tasks");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    sales = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    otherSales = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("snoozes to 09:00 tomorrow in the agency's zone, even at 23:30", async () => {
    const task = await inOrg((tx) => aTask(tx, { assigneeUserId: sales.userId, dueAt: at("2026-10-16T12:00:00Z") }));
    const lateEvening = at("2026-10-16T18:00:00Z"); // 23:30 in India on 16 Oct
    const snooze = (until: Parameters<typeof snoozeTask>[2]["until"], now = lateEvening) =>
      inOrg((tx) => snoozeTask(tx, sales, { taskId: task.id, until }, now));
    expect((await snooze({ choice: "tomorrow-morning" })).dueAt).toBe("2026-10-17T03:30:00.000Z");
    expect((await snooze({ choice: "one-hour" })).dueAt).toBe("2026-10-16T19:00:00.000Z");
    expect((await snooze({ choice: "at", due: { on: "2026-10-18", at: "16:00" } })).dueAt).toBe(
      "2026-10-18T10:30:00.000Z",
    );
    // Five minutes past midnight in India it is already the 17th: tomorrow is the 18th.
    expect((await snooze({ choice: "tomorrow-morning" }, at("2026-10-16T18:35:00Z"))).dueAt).toBe(
      "2026-10-18T03:30:00.000Z",
    );
  });

  it("keeps the first due time when snoozed", async () => {
    const firstDue = at("2026-10-17T10:30:00Z");
    const task = await inOrg((tx) => aTask(tx, { assigneeUserId: sales.userId, dueAt: firstDue }));
    const now = at("2026-10-17T09:00:00Z");
    await inOrg((tx) => snoozeTask(tx, sales, { taskId: task.id, until: { choice: "one-hour" } }, now));
    const snoozed = await inOrg((tx) =>
      snoozeTask(tx, sales, { taskId: task.id, until: { choice: "tomorrow-morning" } }, now),
    );
    expect(snoozed).toMatchObject({ firstDueAt: firstDue.toISOString(), dueAt: "2026-10-18T03:30:00.000Z" });
    const entries = await auditOf(task.id);
    expect(entries.map((entry) => entry.action)).toEqual(["task.snoozed", "task.snoozed"]);
    expect(entries[1]).toMatchObject({
      before: { dueAt: "2026-10-17T10:00:00.000Z" },
      after: { dueAt: "2026-10-18T03:30:00.000Z" },
    });
    expect(await eventsOf(task.id)).toEqual(["task.snoozed", "task.snoozed"]);
  });

  it("answers TASK_CLOSED to a second Done, and records one task.done", async () => {
    const task = await inOrg((tx) => aTask(tx, { assigneeUserId: sales.userId, title: "Send the Kashmir quote" }));
    const now = new Date();
    const done = await inOrg((tx) => completeTask(tx, sales, task.id, now));
    expect(done).toMatchObject({ id: task.id, doneAt: now.toISOString(), cancelledAt: null });
    await expect(inOrg((tx) => completeTask(tx, sales, task.id, now))).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "TASK_CLOSED",
    });
    await expect(
      inOrg((tx) => snoozeTask(tx, sales, { taskId: task.id, until: { choice: "one-hour" } }, now)),
    ).rejects.toMatchObject({ reason: "TASK_CLOSED" });
    const entries = await auditOf(task.id);
    expect(entries.map((entry) => entry.action)).toEqual(["task.done"]);
    expect(JSON.stringify(entries)).not.toContain("Kashmir quote");
    expect(await eventsOf(task.id)).toEqual(["task.done"]);
    const cancelled = await inOrg((tx) => aTask(tx, { assigneeUserId: sales.userId, cancelledAt: new Date() }));
    await expect(
      inOrg((tx) => snoozeTask(tx, sales, { taskId: cancelled.id, until: { choice: "one-hour" } }, now)),
    ).rejects.toMatchObject({ reason: "TASK_CLOSED" });
  });

  it("refuses a salesperson's Done or Snooze on another's task as NOT_FOUND", async () => {
    const theirs = await inOrg((tx) => aTask(tx, { assigneeUserId: otherSales.userId }));
    const now = new Date();
    await expect(inOrg((tx) => completeTask(tx, sales, theirs.id, now))).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "NOT_FOUND",
    });
    await expect(
      inOrg((tx) => snoozeTask(tx, sales, { taskId: theirs.id, until: { choice: "one-hour" } }, now)),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "NOT_FOUND" });
    await expect(inOrg((tx) => completeTask(tx, sales, randomUUID(), now))).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
    // A manager sees everyone's.
    await expect(inOrg((tx) => completeTask(tx, owner, theirs.id, now))).resolves.toMatchObject({ id: theirs.id });
  });

  it("refuses a time before now: DUE_IN_THE_PAST", async () => {
    const now = at("2026-10-17T10:00:00Z"); // 15:30 in India
    const owners = new Set([sales.userId]);
    await expect(
      inOrg((tx) =>
        addStandaloneTask(
          tx,
          sales,
          { title: "Call", due: { on: "2026-10-17", at: "15:00" }, assigneeUserId: null },
          { owners, now },
        ),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "DUE_IN_THE_PAST" });
    const task = await inOrg((tx) => aTask(tx, { assigneeUserId: sales.userId }));
    await expect(
      inOrg((tx) =>
        snoozeTask(
          tx,
          sales,
          { taskId: task.id, until: { choice: "at", due: { on: "2026-10-16", at: "09:00" } } },
          now,
        ),
      ),
    ).rejects.toMatchObject({ reason: "DUE_IN_THE_PAST" });
  });

  it("gives a standalone task to someone else only with leads:assign, and only to a lead worker", async () => {
    const now = at("2026-10-17T10:00:00Z");
    const due = { on: "2026-10-17", at: "17:00" };
    const owners = new Set([owner.userId, sales.userId]);
    const add = (actor: MemberAccess, assigneeUserId: string | null) =>
      inOrg((tx) => addStandaloneTask(tx, actor, { title: "Visit the hotel", due, assigneeUserId }, { owners, now }));

    const own = await add(sales, null);
    expect(own).toMatchObject({
      kind: "task",
      title: "Visit the hotel",
      assigneeUserId: sales.userId,
      record: null,
      dueAt: "2026-10-17T11:30:00.000Z",
      firstDueAt: "2026-10-17T11:30:00.000Z",
    });
    await expect(add(sales, owner.userId)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "MISSING_PERMISSION" });
    await expect(add(owner, randomUUID())).rejects.toMatchObject({ reason: "NOT_A_LEAD_WORKER" });
    const given = await add(owner, sales.userId);
    expect(given.assigneeUserId).toBe(sales.userId);
    const [added] = await auditOf(given.id);
    expect(added).toMatchObject({
      action: "task.added",
      entityType: "task",
      actorUserId: owner.userId,
      after: { kind: "task", dueAt: "2026-10-17T11:30:00.000Z", assigneeUserId: sales.userId, recordType: null },
    });
    expect(JSON.stringify(added)).not.toContain("Visit the hotel");
    expect(await eventsOf(given.id)).toEqual(["task.added"]);
  });

  it("cancels and reassigns a record's open tasks, leaving done ones", async () => {
    const record = { recordType: "lead", recordId: randomUUID() };
    const ids = await inOrg(async (tx) => ({
      first: (await aTask(tx, { kind: "follow-up", record, assigneeUserId: sales.userId })).id,
      second: (await aTask(tx, { record, assigneeUserId: sales.userId })).id,
      done: (await aTask(tx, { record, assigneeUserId: sales.userId, doneAt: new Date() })).id,
      elsewhere: (await aTask(tx, { assigneeUserId: sales.userId })).id,
    }));
    const moved = await inOrg((tx) => reassignOpenTasks(tx, owner, record, otherSales.userId));
    expect(moved.map((task) => task.id).sort()).toEqual([ids.first, ids.second].sort());
    expect(moved.every((task) => task.assigneeUserId === otherSales.userId)).toBe(true);
    expect((await auditOf(ids.first)).map((entry) => entry.action)).toEqual(["task.reassigned"]);
    expect(await inOrg((tx) => reassignOpenTasks(tx, owner, record, otherSales.userId))).toEqual([]);

    const now = new Date();
    const cancelled = await inOrg((tx) => cancelOpenTasks(tx, systemActor(organizationId), record, now));
    expect(cancelled.map((task) => task.id).sort()).toEqual([ids.first, ids.second].sort());
    expect(cancelled.every((task) => task.cancelledAt === now.toISOString())).toBe(true);
    const rows = await inOrg((tx) => tx.task.findMany({ where: { id: { in: Object.values(ids) } } }));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(ids.done)).toMatchObject({ assigneeUserId: sales.userId, cancelledAt: null });
    expect(byId.get(ids.elsewhere)).toMatchObject({ assigneeUserId: sales.userId, cancelledAt: null });
    expect((await auditOf(ids.second)).map((entry) => entry.action)).toEqual(["task.reassigned", "task.cancelled"]);
  });

  it("hands a person's open standalone tasks to someone else, and empties a record's titles for an erasure", async () => {
    const leaving = randomUUID();
    const record = { recordType: "lead", recordId: randomUUID() };
    const ids = await inOrg(async (tx) => ({
      open: (await aTask(tx, { assigneeUserId: leaving })).id,
      done: (await aTask(tx, { assigneeUserId: leaving, doneAt: new Date() })).id,
      onRecord: (await aTask(tx, { assigneeUserId: leaving, record, title: "Ask Rahul for passports" })).id,
    }));
    const handed = await inOrg((tx) =>
      reassignOpenStandaloneTasks(tx, systemActor(organizationId), { fromUserId: leaving, toUserId: owner.userId }),
    );
    expect(handed).toBe(1);
    const rows = await inOrg((tx) => tx.task.findMany({ where: { id: { in: Object.values(ids) } } }));
    expect(new Map(rows.map((row) => [row.id, row.assigneeUserId]))).toEqual(
      new Map([
        [ids.open, owner.userId],
        [ids.done, leaving],
        [ids.onRecord, leaving],
      ]),
    );
    const redacted = await inOrg((tx) =>
      redactTaskTitles(tx, { organizationId, recordType: "lead", recordIds: [record.recordId] }),
    );
    expect(redacted).toBe(1);
    expect(await inOrg((tx) => tx.task.findUniqueOrThrow({ where: { id: ids.onRecord } }))).toMatchObject({
      title: "",
    });
  });
});

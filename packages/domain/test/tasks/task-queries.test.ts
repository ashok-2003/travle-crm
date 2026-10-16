// Reading open tasks (spec 3.5): one person's, by due time, a page after a cursor and within a window of time; a
// record's, earliest first; and each record's earliest, for the lead list's "what's next".
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { countOpenTasks, listOpenTasks, nextOpenTasks, openTasksOf } from "../../src/tasks/index.js";
import { aTask } from "../crm/support/records.js";

const at = (iso: string) => new Date(iso);

describe("reading tasks", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Task queries");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists open tasks by due time, a page after a cursor", async () => {
    const me = randomUUID();
    const due = ["2026-10-17T05:00:00Z", "2026-10-17T03:00:00Z", "2026-10-17T09:00:00Z", "2026-10-18T03:00:00Z"];
    const ids = await inOrg(async (tx) => {
      const open = [];
      for (const dueAt of due) open.push((await aTask(tx, { assigneeUserId: me, dueAt: at(dueAt) })).id);
      await aTask(tx, { assigneeUserId: me, dueAt: at("2026-10-17T01:00:00Z"), doneAt: new Date() });
      await aTask(tx, { assigneeUserId: me, dueAt: at("2026-10-17T01:00:00Z"), cancelledAt: new Date() });
      await aTask(tx, { assigneeUserId: randomUUID(), dueAt: at("2026-10-17T01:00:00Z") });
      return open;
    });
    const [at05, at03, at09, tomorrow] = ids;
    const firstPage = await inOrg((tx) => listOpenTasks(tx, { assigneeUserId: me, limit: 2 }));
    expect(firstPage.map((task) => task.id)).toEqual([at03, at05]);
    const secondPage = await inOrg((tx) => listOpenTasks(tx, { assigneeUserId: me, after: at05 ?? "", limit: 2 }));
    expect(secondPage.map((task) => task.id)).toEqual([at09, tomorrow]);
    const today = { assigneeUserId: me, dueFrom: at("2026-10-17T04:00:00Z"), dueBefore: at("2026-10-17T18:30:00Z") };
    expect((await inOrg((tx) => listOpenTasks(tx, { ...today, limit: 10 }))).map((task) => task.id)).toEqual([
      at05,
      at09,
    ]);
    expect(await inOrg((tx) => countOpenTasks(tx, today))).toBe(2);
    expect(await inOrg((tx) => countOpenTasks(tx, { assigneeUserId: me, dueBefore: at("2026-10-17T04:00:00Z") }))).toBe(
      1,
    );
    expect(firstPage[0]).toMatchObject({ kind: "task", title: "Call back", assigneeUserId: me, doneAt: null });
  });

  it("gives each record its earliest open task", async () => {
    const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()];
    const lead = (recordId: string) => ({ recordType: "lead", recordId });
    const ids = await inOrg(async (tx) => ({
      firstDone: (await aTask(tx, { record: lead(first), dueAt: at("2026-10-16T03:00:00Z"), doneAt: new Date() })).id,
      firstLater: (await aTask(tx, { record: lead(first), dueAt: at("2026-10-19T03:00:00Z") })).id,
      firstSooner: (await aTask(tx, { kind: "follow-up", record: lead(first), dueAt: at("2026-10-18T03:00:00Z") })).id,
      second: (await aTask(tx, { record: lead(second), dueAt: at("2026-10-20T03:00:00Z") })).id,
      otherType: (await aTask(tx, { record: { recordType: "booking", recordId: third } })).id,
    }));
    const next = await inOrg((tx) => nextOpenTasks(tx, "lead", [first, second, third]));
    expect(new Map([...next].map(([recordId, task]) => [recordId, task.id]))).toEqual(
      new Map([
        [first, ids.firstSooner],
        [second, ids.second],
      ]),
    );
    expect((await inOrg((tx) => openTasksOf(tx, lead(first)))).map((task) => task.id)).toEqual([
      ids.firstSooner,
      ids.firstLater,
    ]);
    expect(await inOrg((tx) => nextOpenTasks(tx, "lead", []))).toEqual(new Map());
  });
});

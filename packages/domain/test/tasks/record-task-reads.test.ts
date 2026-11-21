// Reads of the tasks on records, for the modules above tasks: every task of some records, open, done or cancelled (a
// customer's export), one person's open tasks on records of a type, a page at a time (a departing member's
// hand-over), and the records with an open task of a kind overdue (the Leads list's Show: Follow-up overdue).
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listOpenRecordTasksOf, listTasksOnRecord, overdueRecordIds } from "../../src/tasks/index.js";
import { aTask } from "../crm/support/records.js";

const at = (iso: string) => new Date(iso);

describe("reading the tasks on records", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Record task reads");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists every task on the records, done and cancelled ones too, earliest due first", async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    const lead = (recordId: string) => ({ recordType: "lead", recordId });
    const ids = await inOrg(async (tx) => ({
      later: (await aTask(tx, { record: lead(first), dueAt: at("2026-10-20T05:00:00Z") })).id,
      done: (await aTask(tx, { record: lead(second), dueAt: at("2026-10-18T05:00:00Z"), doneAt: new Date() })).id,
      cancelled: (await aTask(tx, { record: lead(first), dueAt: at("2026-10-19T05:00:00Z"), cancelledAt: new Date() }))
        .id,
      otherType: (await aTask(tx, { record: { recordType: "booking", recordId: first } })).id,
      otherRecord: (await aTask(tx, { record: lead(randomUUID()) })).id,
    }));

    const tasks = await inOrg((tx) => listTasksOnRecord(tx, "lead", [first, second]));

    expect(tasks.map((task) => task.id)).toEqual([ids.done, ids.cancelled, ids.later]);
    expect(tasks[0]).toMatchObject({ record: lead(second), title: "Call back" });
    expect(await inOrg((tx) => listTasksOnRecord(tx, "lead", []))).toEqual([]);
  });

  it("pages one person's open tasks on records of a type, by id", async () => {
    const me = randomUUID();
    const ids = await inOrg(async (tx) => {
      const onLead = () => ({ recordType: "lead", recordId: randomUUID() });
      const open = [];
      for (let index = 0; index < 3; index += 1) {
        open.push((await aTask(tx, { assigneeUserId: me, kind: "follow-up", record: onLead() })).id);
      }
      await aTask(tx, { assigneeUserId: me, record: onLead(), doneAt: new Date() });
      await aTask(tx, { assigneeUserId: me, record: onLead(), cancelledAt: new Date() });
      await aTask(tx, { assigneeUserId: me });
      await aTask(tx, { assigneeUserId: me, record: { recordType: "booking", recordId: randomUUID() } });
      await aTask(tx, { assigneeUserId: randomUUID(), record: onLead() });
      return open.sort();
    });
    const page = (after?: string) =>
      inOrg((tx) =>
        listOpenRecordTasksOf(tx, { assigneeUserId: me, recordType: "lead", limit: 2, ...(after ? { after } : {}) }),
      );

    const first = await page();
    expect(first.map((task) => task.id)).toEqual(ids.slice(0, 2));
    expect((await page(first.at(-1)?.id)).map((task) => task.id)).toEqual(ids.slice(2));
  });

  it("names the records with an open task of a kind overdue, each once, longest overdue first", async () => {
    // Before every other test's tasks are due, so only this test's count.
    const now = at("2026-10-12T06:00:00Z");
    const [first, second, notYet] = [randomUUID(), randomUUID(), randomUUID()];
    const lead = (recordId: string) => ({ recordType: "lead", recordId });
    const followUp = { kind: "follow-up" as const };
    await inOrg(async (tx) => {
      await aTask(tx, { ...followUp, record: lead(first), dueAt: at("2026-10-11T05:00:00Z") });
      await aTask(tx, { ...followUp, record: lead(second), dueAt: at("2026-10-10T05:00:00Z") });
      await aTask(tx, { ...followUp, record: lead(first), dueAt: at("2026-10-09T05:00:00Z") });
      await aTask(tx, { ...followUp, record: lead(notYet), dueAt: at("2026-10-12T07:00:00Z") });
      await aTask(tx, { ...followUp, record: lead(notYet), dueAt: at("2026-10-01T05:00:00Z"), doneAt: now });
      await aTask(tx, { ...followUp, record: lead(notYet), dueAt: at("2026-10-01T05:00:00Z"), cancelledAt: now });
      await aTask(tx, { record: lead(notYet), dueAt: at("2026-10-01T05:00:00Z") });
      await aTask(tx, {
        ...followUp,
        record: { recordType: "booking", recordId: notYet },
        dueAt: at("2026-10-01T05:00:00Z"),
      });
    });
    expect(
      await inOrg((tx) => overdueRecordIds(tx, { recordType: "lead", kind: "follow-up", dueBefore: now })),
    ).toEqual([first, second]);
  });
});

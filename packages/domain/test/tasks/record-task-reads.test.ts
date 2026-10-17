// Reads of the tasks on records, for the modules above tasks: every task of some records, open, done or cancelled (a
// customer's export), and one person's open tasks on records of a type, a page at a time (a departing member's
// hand-over).
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listOpenRecordTasksOf, listTasksOnRecord } from "../../src/tasks/index.js";
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
});

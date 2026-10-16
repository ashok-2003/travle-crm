// Tasks and destinations over HTTP (spec 3.5, 3.6): a standalone task added, a lead's follow-up done from anywhere
// writes "follow-up done" on the lead's timeline in the same transaction (R22), and destinations are searched with
// leads:view, renamed and merged only with settings:manage, all on the crm plan module (R18).
import type { Destination, MergedDestinations } from "@travel-crm/contracts/catalog";
import type { Task } from "@travel-crm/contracts/tasks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("tasks and destinations", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let salesperson: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    salesperson = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "zara", roleKey: "sales" }),
    );
  });

  afterAll(async () => {
    await server.close();
  });

  const inAgency = <T>(work: Parameters<typeof server.db.forOrg<T>>[1]) =>
    server.db.forOrg(agency.organizationId, work);

  it("adds a standalone task for whoever adds it", async () => {
    const tomorrow = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
    const task = await dataOf<Task>(
      await mutate(
        server,
        "tasks.add",
        { title: "Call the hotel", due: { on: tomorrow, at: "16:00" }, assigneeUserId: null },
        salesperson,
      ),
    );
    expect(task).toMatchObject({ kind: "task", title: "Call the hotel", record: null, doneAt: null });
  });

  it("writes 'follow-up done' on the lead's timeline when a lead's task is done", async () => {
    const { leadId, taskId } = await inAgency(async (tx) => {
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876500001" } });
      const lead = await tx.lead.create({
        data: { personId: person.id, source: "walk_in", ownerUserId: agency.owner.userId },
      });
      const dueAt = new Date(Date.now() + DAY_MS);
      const task = await tx.task.create({
        data: {
          kind: "follow-up",
          title: "Send the quote",
          dueAt,
          firstDueAt: dueAt,
          assigneeUserId: agency.owner.userId,
          recordType: "lead",
          recordId: lead.id,
        },
      });
      return { leadId: lead.id, taskId: task.id };
    });
    const done = await dataOf<Task>(await mutate(server, "tasks.complete", { taskId }, owner));
    expect(done.doneAt).not.toBeNull();
    const entries = await inAgency((tx) => tx.leadTimelineEntry.findMany({ where: { leadId } }));
    expect(entries).toMatchObject([
      { kind: "follow-up-done", recordType: "task", recordId: taskId, actorUserId: agency.owner.userId },
    ]);
    expect(await refusalOf(await mutate(server, "tasks.complete", { taskId }, owner))).toEqual({
      status: 409,
      reason: "TASK_CLOSED",
    });
    expect(await inAgency((tx) => tx.leadTimelineEntry.count({ where: { leadId } }))).toBe(1);
  });

  it("lets only settings:manage rename and merge, on the crm plan module", async () => {
    const [goa, northGoa] = await inAgency(async (tx) => [
      await tx.destination.create({ data: { name: "Goa" } }),
      await tx.destination.create({ data: { name: "North Goa" } }),
    ]);
    const rename = { destinationId: goa.id, name: "Goa beaches" };
    const merge = { destinationId: northGoa.id, intoDestinationId: goa.id };
    expect(await refusalOf(await mutate(server, "destinations.rename", rename, salesperson))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    expect(await refusalOf(await mutate(server, "destinations.merge", merge, salesperson))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    expect(
      await dataOf<Destination[]>(await query(server, "destinations.search", salesperson, { query: "goa" })),
    ).toEqual([
      { id: goa.id, name: "Goa" },
      { id: northGoa.id, name: "North Goa" },
    ]);

    expect(await dataOf<Destination>(await mutate(server, "destinations.rename", rename, owner))).toEqual({
      id: goa.id,
      name: "Goa beaches",
    });
    expect(await dataOf<MergedDestinations>(await mutate(server, "destinations.merge", merge, owner))).toEqual({
      leadsMoved: 0,
    });

    const withoutCrm = await server.platform.plan.create({
      data: {
        key: `no-crm-${agency.code.toLowerCase()}`,
        name: "Without crm",
        monthlyPricePaise: 0,
        seatLimit: 10,
        whatsappNumberLimit: 1,
        storageLimitBytes: 1_000_000n,
        modules: [],
      },
    });
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { planId: withoutCrm.id },
    });
    expect(await refusalOf(await mutate(server, "destinations.rename", { ...rename, name: "Goa" }, owner))).toEqual({
      status: 403,
      reason: "MODULE_NOT_ON_PLAN",
    });
    expect(await refusalOf(await query(server, "destinations.search", owner, { query: "goa" }))).toEqual({
      status: 403,
      reason: "MODULE_NOT_ON_PLAN",
    });
  });
});

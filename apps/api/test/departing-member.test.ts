// The worker's hand-over when someone leaves (spec 4, R15, R37): removing a salesperson publishes staff.removed, and
// the worker's crm listener gives their open leads, with those leads' follow-ups, and their open standalone tasks to
// the agency's Owner, the earliest-joined active Owner identity names.
import { runListenerJob } from "@travel-crm/domain/jobs";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerJobs } from "../src/worker-jobs.js";
import { addStaff, ownerAccess } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";

const HOUR_MS = 60 * 60 * 1000;

describe("a departing member's work, through the worker", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("gives a removed salesperson's open leads, follow-ups and tasks to the Owner", async () => {
    const zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    const inAgency = <T>(work: Parameters<typeof server.db.forOrg<T>>[1]) =>
      server.db.forOrg(agency.organizationId, work);
    const ids = await inAgency(async (tx) => {
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876500088" } });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "walk_in", ownerUserId: zara.userId } });
      const dueAt = new Date(Date.now() + HOUR_MS);
      const task = (recordId: string | null) =>
        tx.task.create({
          data: {
            kind: recordId === null ? "task" : "follow-up",
            title: "Call back",
            dueAt,
            firstDueAt: dueAt,
            assigneeUserId: zara.userId,
            recordType: recordId === null ? null : "lead",
            recordId,
          },
        });
      return { lead: lead.id, followUp: (await task(lead.id)).id, standalone: (await task(null)).id };
    });

    await server.identity.staff.remove(await ownerAccess(server, agency), { memberId: zara.memberId });
    const removal = await inAgency((tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "staff.removed", payload: { path: ["userId"], equals: zara.userId } },
      }),
    );
    const { listeners } = workerJobs({
      db: server.db,
      identity: server.identity,
      files: server.files,
      email: createMemoryEmailSender(),
      push: createMemoryPushSender(),
      appUrl: "https://app.example.in",
      webhookProviders: [],
      rateLimiter: createRateLimiter(server.db, { keySecret: "departing-member-test-rate-limit-secret-32b" }),
      log: () => undefined,
    });
    const handOver = listeners.find((listener) => listener.name === "crm.hand-over-departing-member");
    if (handOver === undefined) throw new Error("The worker has no crm.hand-over-departing-member listener");

    const data = { organizationId: agency.organizationId, eventId: removal.id, eventType: "staff.removed" };
    expect(await runListenerJob({ db: server.db, listener: handOver, data })).toBe("handled");

    const owner = agency.owner.userId;
    expect(await inAgency((tx) => tx.lead.findUniqueOrThrow({ where: { id: ids.lead } }))).toMatchObject({
      ownerUserId: owner,
    });
    expect(
      await inAgency((tx) =>
        tx.task.findMany({ where: { id: { in: [ids.followUp, ids.standalone] } }, select: { assigneeUserId: true } }),
      ),
    ).toEqual([{ assigneeUserId: owner }, { assigneeUserId: owner }]);
  });
});

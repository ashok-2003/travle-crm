// The New leads nobody has contacted yet (leads show spec, 2026-11-21): still in New, no call logged on the lead and no
// message a person or the AI wrote to its person since it came in. Automatic messages (a welcome, away or keyword
// answer, the sales cadence's first WhatsApp and its nudges, a broadcast) and a failed send are no contact. Longest
// waiting first, a page at a time, and counted the same way.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { countUncontactedLeads, uncontactedLeads } from "../../src/inbox/index.js";
import { aLead } from "../crm/support/records.js";
import { aChat, aMessage } from "./chat-records.js";

const HOUR = 60 * 60 * 1000;

describe("the New leads nobody has contacted yet", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Uncontacted leads");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("leaves out a lead with a call logged or a message sent since it came in, and keeps the rest", async () => {
    const me = randomUUID();
    const cameIn = new Date(Date.now() - 2 * HOUR);
    const after = new Date(cameIn.getTime() + HOUR);
    const before = new Date(cameIn.getTime() - HOUR);
    const ids = await inOrg(async (tx) => {
      const newLead = () => aLead(tx, { ownerUserId: me, createdAt: cameIn });
      const withMessage = async (seed: Parameters<typeof aMessage>[2]) => {
        const lead = await newLead();
        await aMessage(tx, await aChat(tx, lead.personId), seed);
        return lead.id;
      };
      const waiting = (await newLead()).id;
      const called = await newLead();
      await tx.leadCall.create({ data: { leadId: called.id, outcome: "no_answer" } });
      const callRemoved = await newLead();
      await tx.leadCall.create({ data: { leadId: callRemoved.id, outcome: "busy", deletedAt: after } });
      const kept = {
        waiting,
        callRemoved: callRemoved.id,
        welcomeOnly: await withMessage({
          origin: "automation",
          clientToken: `auto:welcome:${randomUUID()}`,
          occurredAt: after,
        }),
        greetingOnly: await withMessage({
          origin: "automation",
          clientToken: `speed:${randomUUID()}`,
          occurredAt: after,
        }),
        nudgeOnly: await withMessage({
          origin: "automation",
          clientToken: `follow:${randomUUID()}:1`,
          status: "delivered",
          occurredAt: after,
        }),
        failedReply: await withMessage({ status: "failed", occurredAt: after }),
        messagedBefore: await withMessage({ occurredAt: before }),
        theyWrote: await withMessage({ direction: "in", occurredAt: after }),
      };
      const left = {
        called: called.id,
        replied: await withMessage({ occurredAt: after }),
        fromPhone: await withMessage({ origin: "staff_phone", status: "delivered", occurredAt: after }),
        scheduledByStaff: await withMessage({ clientToken: `scheduled:${randomUUID()}`, occurredAt: after }),
        byAi: await withMessage({ origin: "automation", clientToken: `ai:${randomUUID()}`, occurredAt: after }),
        contacted: (await aLead(tx, { ownerUserId: me, stage: "contacted", createdAt: cameIn })).id,
      };
      const someoneElses = (await aLead(tx, { ownerUserId: randomUUID(), createdAt: cameIn })).id;
      return { kept, left, someoneElses };
    });
    const keptInOrder = Object.values(ids.kept).sort();

    const mine = await inOrg((tx) => uncontactedLeads(tx, { ownerUserId: me }));
    expect(mine.map((row) => row.leadId)).toEqual(keptInOrder);
    expect(mine[0]?.waitingSince).toEqual(cameIn);
    expect(await inOrg((tx) => countUncontactedLeads(tx, me))).toBe(keptInOrder.length);

    const everyone = (await inOrg((tx) => uncontactedLeads(tx, {}))).map((row) => row.leadId);
    expect(everyone).toEqual(expect.arrayContaining([...keptInOrder, ids.someoneElses]));
    for (const left of Object.values(ids.left)) expect(everyone).not.toContain(left);

    const first = await inOrg((tx) => uncontactedLeads(tx, { ownerUserId: me, limit: 2 }));
    expect(first.map((row) => row.leadId)).toEqual(keptInOrder.slice(0, 2));
    const rest = await inOrg((tx) => uncontactedLeads(tx, { ownerUserId: me, after: keptInOrder[1] ?? "" }));
    expect(rest.map((row) => row.leadId)).toEqual(keptInOrder.slice(2));
  });
});

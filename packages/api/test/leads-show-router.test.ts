// leads.list and leads.counts with a Show (leads show spec, 2026-11-21), on a real database: the router asks today for
// the Show's leads and crm lists and counts them within the caller's tab and scope, so a member who sees only their own
// leads never gets another's, whatever they ask for.
import { randomUUID } from "node:crypto";
import { PermissionSet } from "@travel-crm/domain/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, memberOf, type Harness } from "./forms-support.js";

const HOUR = 60 * 60 * 1000;

describe("the leads router's Show", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("lists and counts the Show's leads in its order, within the tab and the caller's scope", async () => {
    const organizationId = await anAgency(harness);
    const manager = callerOf(harness, { organizationId });
    const ownOnly = {
      ...memberOf(organizationId, []),
      permissions: PermissionSet.of([{ permission: "leads:view", scope: "own" as const }]),
    };
    const seller = callerOf(harness, { organizationId }, ownOnly);
    const now = Date.now();
    const leadIds = await harness.db.forOrg(organizationId, async (tx) => {
      const lead = async (ownerUserId: string, dueHoursAgo: number) => {
        const phoneE164 = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
        const person = await tx.person.create({ data: { name: "Meera", phoneE164 } });
        const made = await tx.lead.create({ data: { personId: person.id, source: "phone_call", ownerUserId } });
        const dueAt = new Date(now - dueHoursAgo * HOUR);
        await tx.task.create({
          data: {
            kind: "follow-up",
            title: "Call back",
            dueAt,
            firstDueAt: dueAt,
            recordType: "lead",
            recordId: made.id,
          },
        });
        return made.id;
      };
      const ids = {
        someoneElses: await lead(randomUUID(), 9),
        managers: await lead(manager.member.userId, 2),
        sellers: await lead(ownOnly.userId, 5),
      };
      // Due in an hour: not overdue, so in no Show: Follow-up overdue.
      await lead(manager.member.userId, -1);
      await lead(ownOnly.userId, -1);
      return ids;
    });

    const everyone = await manager.caller.leads.list({ view: "everyone", show: "overdue", page: 1 });
    expect(everyone.items.map((item) => item.id)).toEqual([leadIds.someoneElses, leadIds.sellers, leadIds.managers]);
    expect(everyone.total).toBe(3);
    expect((await manager.caller.leads.counts({ view: "everyone", show: "overdue" })).new).toBe(3);
    const mine = await manager.caller.leads.list({ show: "overdue", page: 1 });
    expect(mine.items.map((item) => item.id)).toEqual([leadIds.managers]);

    const theirs = await seller.caller.leads.list({ view: "everyone", show: "overdue", page: 1 });
    expect(theirs.items.map((item) => item.id)).toEqual([leadIds.sellers]);
    expect((await seller.caller.leads.counts({ view: "everyone", show: "overdue" })).open).toBe(1);
  });
});

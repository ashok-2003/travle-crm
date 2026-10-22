// Changes to many leads at once (release C): each lead in a transaction of its own, through the one-lead function, so
// each lead's own scope check applies; a refused lead is skipped with its reason and the rest go ahead; another failure
// stops the run, keeping what was changed; a lead chosen twice changes once; and a call takes at most 200 leads.
import { randomUUID } from "node:crypto";
import { bulkAddWorkInput, bulkMoveStageInput, bulkReassignInput, MAX_BULK_LEADS } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { moveLeadStage } from "../../src/crm/index.js";
import { changeEachLead } from "../../src/crm/bulk-changes.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead } from "./support/records.js";

describe("changing many leads at once", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  let colleague: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const leadOf = (owner: MemberAccess) => inOrg((tx) => aLead(tx, { ownerUserId: owner.userId }));
  const stageOf = async (leadId: string) =>
    (await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: leadId } }))).stage;
  const moveEach = (access: MemberAccess, leadIds: readonly string[]) =>
    changeEachLead(db, access, leadIds, (tx, leadId) =>
      moveLeadStage(tx, access, { leadId, stage: "contacted" }, new Date()),
    );

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Bulk changes");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    colleague = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("checks each lead against the person's own scope: a salesperson's colleague's lead is skipped, theirs change", async () => {
    const mine = await leadOf(salesperson);
    const alsoMine = await leadOf(salesperson);
    const theirs = await leadOf(colleague);
    const result = await moveEach(salesperson, [mine.id, theirs.id, alsoMine.id]);
    expect(result.changed).toBe(2);
    expect(result.skipped).toEqual([{ leadId: theirs.id, reason: "NOT_FOUND" }]);
    expect(await stageOf(mine.id)).toBe("contacted");
    expect(await stageOf(alsoMine.id)).toBe("contacted");
    expect(await stageOf(theirs.id)).toBe("new");
  });

  it("lets a manager, who sees all leads, change them all", async () => {
    const leads = [await leadOf(salesperson), await leadOf(colleague)];
    const result = await moveEach(
      manager,
      leads.map((lead) => lead.id),
    );
    expect(result).toEqual({ changed: 2, skipped: [] });
  });

  it("skips a lead that does not exist and carries on with the rest", async () => {
    const lead = await leadOf(salesperson);
    const missing = randomUUID();
    const result = await moveEach(salesperson, [missing, lead.id]);
    expect(result).toEqual({ changed: 1, skipped: [{ leadId: missing, reason: "NOT_FOUND" }] });
  });

  it("changes a lead chosen twice once", async () => {
    const lead = await leadOf(salesperson);
    let calls = 0;
    const result = await changeEachLead(db, salesperson, [lead.id, lead.id], () => {
      calls += 1;
      return Promise.resolve();
    });
    expect(result).toEqual({ changed: 1, skipped: [] });
    expect(calls).toBe(1);
  });

  it("stops on a failure that is not a refusal, keeping the leads already changed", async () => {
    const first = await leadOf(salesperson);
    const second = await leadOf(salesperson);
    const third = await leadOf(salesperson);
    const run = changeEachLead(db, salesperson, [first.id, second.id, third.id], async (tx, leadId) => {
      if (leadId === second.id) throw new Error("the database went away");
      await moveLeadStage(tx, salesperson, { leadId, stage: "contacted" }, new Date());
    });
    await expect(run).rejects.toThrow("the database went away");
    expect(await stageOf(first.id)).toBe("contacted");
    expect(await stageOf(third.id)).toBe("new");
  });

  it("takes at most 200 leads a call, whichever change it is", () => {
    expect(MAX_BULK_LEADS).toBe(200);
    const ids = (count: number) => Array.from({ length: count }, () => randomUUID());
    const owner = randomUUID();
    const due = { kind: "task", title: "Call", due: { on: "2026-10-23", at: "10:00" } };
    for (const parse of [
      (leadIds: string[]) => bulkMoveStageInput.safeParse({ leadIds, stage: "contacted" }),
      (leadIds: string[]) => bulkReassignInput.safeParse({ leadIds, ownerUserId: owner }),
      (leadIds: string[]) => bulkAddWorkInput.safeParse({ leadIds, ...due }),
    ]) {
      expect(parse(ids(0)).success).toBe(false);
      expect(parse(ids(201)).success).toBe(false);
    }
    expect(bulkMoveStageInput.safeParse({ leadIds: ids(200), stage: "contacted" }).success).toBe(true);
    expect(bulkReassignInput.safeParse({ leadIds: ids(200), ownerUserId: owner }).success).toBe(true);
    expect(bulkAddWorkInput.safeParse({ leadIds: ids(200), ...due }).success).toBe(true);
  });
});

// The Leads list's Show (leads show spec, 2026-11-21): each option holds exactly Home's leads of its kind, by its own
// module's rule and in its own order, within the tab (Mine, Everyone, Unassigned) and the member's scope, and the
// stage counts follow it: Hot hottest first, Follow-up overdue longest overdue first, Not contacted yet longest waiting
// first, AI needs a person newest first (Mine holding the unowned leads for whoever manages the AI).
import { randomUUID } from "node:crypto";
import { leadCountsInput, listLeadsInput, type LeadShow } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { countLeads, listLeads } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { leadsToShow } from "../../src/today/index.js";
import { aLead, aTask } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aChat } from "../inbox/chat-records.js";

const HOUR = 60 * 60 * 1000;
type View = "mine" | "everyone" | "unassigned";

describe("the Leads list's Show", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;
  let seller: MemberAccess;
  const now = new Date();
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const shown = (access: MemberAccess, show: LeadShow, view: View = "mine") =>
    inOrg(async (tx) => {
      const chosen = await leadsToShow(tx, access, { show, view }, now);
      const page = await listLeads(tx, access, listLeadsInput.parse({ view, show, page: 1 }), now, chosen);
      return page.items.map((item) => item.id);
    });

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Leads show");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    seller = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("Hot: every hot lead the tab and scope hold, hottest first, and the counts follow", async () => {
    const ids = await inOrg(async (tx) => {
      const quoted = async (ownerUserId: string | null, openedHoursAgo: number) => {
        const lead = await aLead(tx, { ownerUserId, stage: "quote_sent" });
        await tx.leadSignal.create({
          data: { leadId: lead.id, kind: "quote_opened", sourceKey: randomUUID(), at: ago(openedHoursAgo) },
        });
        return lead.id;
      };
      const owners = await quoted(owner.userId, 5);
      await tx.leadSignal.create({
        data: { leadId: owners, kind: "asked_price", sourceKey: randomUUID(), at: ago(4) },
      });
      return { owners, sellers: await quoted(seller.userId, 1), nobodys: await quoted(null, 2) };
    });
    expect(await shown(owner, "hot", "everyone")).toEqual([ids.owners, ids.sellers, ids.nobodys]);
    expect(await shown(owner, "hot")).toEqual([ids.owners]);
    expect(await shown(owner, "hot", "unassigned")).toEqual([ids.nobodys]);
    for (const view of ["mine", "everyone", "unassigned"] as const) {
      expect(await shown(seller, "hot", view)).toEqual([ids.sellers]);
    }
    const counts = await inOrg(async (tx) =>
      countLeads(
        tx,
        owner,
        leadCountsInput.parse({ view: "everyone", show: "hot" }),
        now,
        await leadsToShow(tx, owner, { show: "hot", view: "everyone" }, now),
      ),
    );
    expect(counts).toMatchObject({ open: 3, quote_sent: 3, new: 0 });
  });

  it("Follow-up overdue: leads with an open follow-up past due, longest overdue first", async () => {
    const ids = await inOrg(async (tx) => {
      const following = async (ownerUserId: string, dueAt: Date, done = false) => {
        const lead = await aLead(tx, { ownerUserId, stage: "contacted" });
        await aTask(tx, {
          kind: "follow-up",
          record: { recordType: "lead", recordId: lead.id },
          assigneeUserId: ownerUserId,
          dueAt,
          ...(done && { doneAt: now }),
        });
        return lead.id;
      };
      await following(owner.userId, new Date(now.getTime() + HOUR));
      await following(owner.userId, ago(72), true);
      return { owners: await following(owner.userId, ago(48)), sellers: await following(seller.userId, ago(24)) };
    });
    expect(await shown(owner, "overdue", "everyone")).toEqual([ids.owners, ids.sellers]);
    expect(await shown(owner, "overdue")).toEqual([ids.owners]);
    expect(await shown(seller, "overdue", "everyone")).toEqual([ids.sellers]);
  });

  it("Not contacted yet: New leads with no call logged and no message sent, longest waiting first", async () => {
    const ids = await inOrg(async (tx) => {
      const waiting = (await aLead(tx, { ownerUserId: owner.userId })).id;
      const called = await aLead(tx, { ownerUserId: owner.userId });
      await tx.leadCall.create({ data: { leadId: called.id, outcome: "spoke" } });
      return { waiting, sellers: (await aLead(tx, { ownerUserId: seller.userId })).id };
    });
    expect(await shown(owner, "uncontacted", "everyone")).toEqual([ids.waiting, ids.sellers]);
    expect(await shown(owner, "uncontacted")).toEqual([ids.waiting]);
    expect(await shown(seller, "uncontacted", "everyone")).toEqual([ids.sellers]);
  });

  it("AI needs a person: hand-overs and open suggestions, newest first; Mine holds the unowned for an AI manager", async () => {
    const ids = await inOrg(async (tx) => {
      const suggested = async (ownerUserId: string | null, createdAt: Date) => {
        const lead = await aLead(tx, { ownerUserId, stage: "contacted" });
        await tx.leadAiSuggestion.create({ data: { leadId: lead.id, kind: "lost", reason: "Booked", createdAt } });
        return lead.id;
      };
      const handedOver = await aLead(tx, { ownerUserId: owner.userId, stage: "contacted" });
      const conversationId = await aChat(tx, handedOver.personId, { needsReply: true });
      await tx.aiChat.create({ data: { conversationId, handedOffAt: ago(1), handoffReason: "Wants a call" } });
      return {
        handedOver: handedOver.id,
        nobodys: await suggested(null, ago(2)),
        sellers: await suggested(seller.userId, ago(3)),
      };
    });
    expect(await shown(owner, "ai")).toEqual([ids.handedOver, ids.nobodys]);
    expect(await shown(owner, "ai", "everyone")).toEqual([ids.handedOver, ids.nobodys, ids.sellers]);
    expect(await shown(owner, "ai", "unassigned")).toEqual([ids.nobodys]);
    expect(await shown(seller, "ai")).toEqual([ids.sellers]);
    expect(await shown(seller, "ai", "everyone")).toEqual([ids.sellers]);
  });
});

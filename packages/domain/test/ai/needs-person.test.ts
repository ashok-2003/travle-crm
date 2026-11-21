// The leads the AI needs a person on (leads show spec, 2026-11-21): those of the chats it handed over and its open
// Lost / Not a lead suggestions, by "Needs you"'s own rules, newest need first. Mine is the member's own and, for
// someone who manages the AI, the unowned ones; everyone's is every lead in the member's scope.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { leadsNeedingPerson } from "../../src/ai/index.js";
import { PermissionSet, type MemberAccess } from "../../src/identity/index.js";
import { aLead } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aChat } from "../inbox/chat-records.js";

const at = (iso: string) => new Date(iso);

describe("the leads the AI needs a person on", () => {
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("holds the hand-overs' leads and the open suggestions' leads, newest need first, within Mine and the scope", async () => {
    const organizationId = await createTestOrganization(platform, "AI needs");
    const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
    const owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    const seller = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    // Sees every lead and every chat, but doesn't manage the AI.
    const manager: MemberAccess = {
      ...owner,
      userId: randomUUID(),
      permissions: PermissionSet.of([
        { permission: "leads:view", scope: "all" },
        { permission: "inbox:view", scope: "all" },
      ]),
    };
    const ids = await inOrg(async (tx) => {
      const suggest = async (leadId: string, createdAt: Date, state = "open") => {
        const decided = state === "open" ? {} : { decidedBy: owner.userId, decidedAt: createdAt };
        await tx.leadAiSuggestion.create({
          data: { leadId, kind: "lost", reason: "Went with another agent", state, createdAt, ...decided },
        });
      };
      const handOver = async (personId: string, handedOffAt: Date, chat: { needsReply?: boolean } = {}) => {
        const conversationId = await aChat(tx, personId, { needsReply: true, ...chat });
        await tx.aiChat.create({ data: { conversationId, handedOffAt, handoffReason: "Wants a discount" } });
      };
      const sellers = await aLead(tx, { ownerUserId: seller.userId, stage: "contacted" });
      await suggest(sellers.id, at("2026-11-01T10:00:00Z"));
      const nobodys = await aLead(tx, { ownerUserId: null });
      await suggest(nobodys.id, at("2026-11-02T10:00:00Z"));
      const owners = await aLead(tx, { ownerUserId: owner.userId, stage: "contacted" });
      await handOver(owners.personId, at("2026-11-03T10:00:00Z"));
      // Their older lead, closed, is the same person's: the hand-over is on it too.
      const ownersOld = await aLead(tx, { ownerUserId: owner.userId, personId: owners.personId, stage: "lost" });
      const declined = await aLead(tx, { ownerUserId: owner.userId });
      await suggest(declined.id, at("2026-11-04T10:00:00Z"), "declined");
      const pastBooking = await aLead(tx, { ownerUserId: owner.userId, stage: "booking_requested" });
      await suggest(pastBooking.id, at("2026-11-04T10:00:00Z"));
      const answered = await aLead(tx, { ownerUserId: owner.userId });
      await handOver(answered.personId, at("2026-11-05T10:00:00Z"), { needsReply: false });
      return { sellers: sellers.id, nobodys: nobodys.id, owners: owners.id, ownersOld: ownersOld.id };
    });
    const needs = (access: MemberAccess, mine: boolean) => inOrg((tx) => leadsNeedingPerson(tx, access, { mine }));

    const handedOver = [ids.owners, ids.ownersOld].sort().reverse();
    expect(await needs(owner, false)).toEqual([...handedOver, ids.nobodys, ids.sellers]);
    expect(await needs(owner, true)).toEqual([...handedOver, ids.nobodys]);
    expect(await needs(manager, true)).toEqual([]);
    expect(await needs(manager, false)).toEqual([...handedOver, ids.nobodys, ids.sellers]);
    expect(await needs(seller, true)).toEqual([ids.sellers]);
    expect(await needs(seller, false)).toEqual([ids.sellers]);
    // Without the inbox, the hand-overs aren't the member's to see; the suggestions still are.
    const noInbox = { ...manager, permissions: PermissionSet.of([{ permission: "leads:view", scope: "all" }]) };
    expect(await needs(noInbox, false)).toEqual([ids.nobodys, ids.sellers]);
  });
});

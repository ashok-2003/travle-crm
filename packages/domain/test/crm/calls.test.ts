// Calls on a lead (release 5): written up with an outcome, a note and the next follow-up in one transaction; a call
// that spoke marks a New lead contacted; the note never reaches the audit log or an event; a call is changed by its
// writer in the first day and by a manager after; "Send to my phone" tells the person's own device only.
import { randomUUID } from "node:crypto";
import { timelineInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  deleteCall,
  DEFAULT_FOLLOW_UP_TITLE,
  editCall,
  getLead,
  limitDials,
  listLeadTimeline,
  logCall,
  sendCallToMyPhone,
} from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead } from "./support/records.js";

const HOUR = 3_600_000;
const tomorrow = () => {
  const day = new Date(Date.now() + 26 * HOUR).toISOString().slice(0, 10);
  return { on: day, at: "11:00" };
};

describe("calls on a lead", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  let colleague: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const timeline = (access: MemberAccess, leadId: string) =>
    inOrg((tx) => listLeadTimeline(tx, access, timelineInput.parse({ leadId })));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Calls");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    colleague = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const aLeadOf = (access: MemberAccess) => inOrg((tx) => aLead(tx, { ownerUserId: access.userId }));

  it("writes a call up on the timeline, newest first, and counts it on the lead", async () => {
    const lead = await aLeadOf(salesperson);
    const now = new Date();
    await inOrg((tx) =>
      logCall(tx, salesperson, { leadId: lead.id, outcome: "busy", note: "Call after the meeting" }, now),
    );
    const { entries } = await timeline(salesperson, lead.id);
    expect(entries[0]).toMatchObject({
      kind: "call",
      outcome: "busy",
      note: "Call after the meeting",
      actorUserId: salesperson.userId,
    });
    expect((await inOrg((tx) => getLead(tx, salesperson, lead.id))).callCount).toBe(1);
  });

  it("keeps the note out of the audit log and of every event", async () => {
    const lead = await aLeadOf(salesperson);
    await inOrg((tx) =>
      logCall(tx, salesperson, { leadId: lead.id, outcome: "spoke", note: "Mentioned a houseboat night" }, new Date()),
    );
    const audit = await inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: lead.id } }));
    expect(audit.map((entry) => entry.action)).toContain("lead.call-logged");
    expect(JSON.stringify(audit)).not.toContain("houseboat");
    const events = await inOrg((tx) => tx.outboxEvent.findMany());
    const ours = events.filter((event) => JSON.stringify(event.payload).includes(lead.id));
    expect(ours.map((event) => event.type)).toContain("lead.call-logged");
    expect(JSON.stringify(ours)).not.toContain("houseboat");
  });

  it("marks a New lead contacted when the customer was spoken to, and not when they did not answer", async () => {
    const spoken = await aLeadOf(salesperson);
    const silent = await aLeadOf(salesperson);
    await inOrg((tx) => logCall(tx, salesperson, { leadId: spoken.id, outcome: "spoke" }, new Date()));
    await inOrg((tx) => logCall(tx, salesperson, { leadId: silent.id, outcome: "no_answer" }, new Date()));
    expect((await inOrg((tx) => getLead(tx, salesperson, spoken.id))).stage).toBe("contacted");
    expect((await inOrg((tx) => getLead(tx, salesperson, silent.id))).stage).toBe("new");
  });

  it("adds the next follow-up with the call, for the lead's owner, under a default title", async () => {
    const lead = await aLeadOf(salesperson);
    await inOrg((tx) =>
      logCall(tx, manager, { leadId: lead.id, outcome: "no_answer", followUp: { due: tomorrow() } }, new Date()),
    );
    const detail = await inOrg((tx) => getLead(tx, manager, lead.id));
    expect(detail.work).toMatchObject([
      { kind: "follow-up", title: DEFAULT_FOLLOW_UP_TITLE, assigneeUserId: salesperson.userId },
    ]);
    const kinds = (await timeline(manager, lead.id)).entries.map((entry) => entry.kind);
    expect(kinds).toEqual(expect.arrayContaining(["call", "follow-up-added"]));
  });

  it("refuses a lead the member may not see, writing nothing", async () => {
    const lead = await aLeadOf(salesperson);
    await expect(
      inOrg((tx) => logCall(tx, colleague, { leadId: lead.id, outcome: "spoke" }, new Date())),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await inOrg((tx) => tx.leadCall.count({ where: { leadId: lead.id } }))).toBe(0);
  });

  describe("changing a call", () => {
    const callOf = async (lead: { id: string }, at: Date) => {
      const callId = await inOrg((tx) =>
        logCall(tx, salesperson, { leadId: lead.id, outcome: "busy", note: "First" }, at),
      );
      return callId;
    };

    it("lets its writer change and delete it in the first day; a deleted call leaves the timeline and the count", async () => {
      const lead = await aLeadOf(salesperson);
      const callId = await callOf(lead, new Date());
      await inOrg((tx) => editCall(tx, salesperson, { callId, outcome: "spoke", note: "Second" }, new Date()));
      expect((await timeline(salesperson, lead.id)).entries[0]).toMatchObject({ kind: "call", note: "Second" });
      await inOrg((tx) => deleteCall(tx, salesperson, callId, new Date()));
      const kinds = (await timeline(salesperson, lead.id)).entries.map((entry) => entry.kind);
      expect(kinds).not.toContain("call");
      expect((await inOrg((tx) => getLead(tx, salesperson, lead.id))).callCount).toBe(0);
    });

    it("refuses its writer after a day, but not a manager; and never someone else's", async () => {
      const lead = await aLeadOf(salesperson);
      const callId = await callOf(lead, new Date(Date.now() - 30 * HOUR));
      await expect(
        inOrg((tx) => editCall(tx, salesperson, { callId, outcome: "spoke", note: null }, new Date())),
      ).rejects.toMatchObject({ reason: "CALL_LOCKED" });
      await inOrg((tx) => editCall(tx, manager, { callId, outcome: "spoke", note: null }, new Date()));
      const fresh = await callOf(lead, new Date());
      await expect(inOrg((tx) => deleteCall(tx, colleague, fresh, new Date()))).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("send to my phone", () => {
    const person = (access: MemberAccess) =>
      inOrg((tx) => tx.pushSubscription.count({ where: { userId: access.userId } }));

    it("needs a phone registered for push", async () => {
      const lead = await aLeadOf(salesperson);
      await expect(inOrg((tx) => sendCallToMyPhone(tx, salesperson, lead.id))).rejects.toMatchObject({
        reason: "NO_PUSH_DEVICE",
      });
      expect(await person(salesperson)).toBe(0);
    });

    it("notifies the person themselves by push, with the name and a link to the dialling page, never the number", async () => {
      const lead = await aLeadOf(salesperson);
      await inOrg((tx) =>
        tx.pushSubscription.create({
          data: {
            userId: salesperson.userId,
            endpoint: `https://push.example/${randomUUID()}`,
            p256dh: "k",
            auth: "s",
          },
        }),
      );
      await inOrg((tx) => sendCallToMyPhone(tx, salesperson, lead.id));
      const rows = await inOrg((tx) =>
        tx.notification.findMany({ where: { recipientUserId: salesperson.userId, kind: "call.dial" } }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: "Call Rahul Sharma", link: `/call/${lead.id}` });
      expect(JSON.stringify(rows[0])).not.toContain("+91");
      const events = await inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "notification.created" } }));
      expect(JSON.stringify(events)).toContain(rows[0]?.id);
    });

    it("is limited by the rate limiter, counted for the person", async () => {
      const keys: string[] = [];
      const refusing = {
        hit: (key: string) => {
          keys.push(key);
          return Promise.resolve({ allowed: false });
        },
      };
      await expect(limitDials(refusing, salesperson, new Date())).rejects.toMatchObject({
        reason: "DIALING_TOO_FAST",
      });
      expect(keys).toEqual([`call-dial:${organizationId}:${salesperson.userId}`]);
      await expect(limitDials(undefined, salesperson, new Date())).resolves.toBeUndefined();
    });

    it("refuses a lead with no phone number", async () => {
      const lead = await inOrg(async (tx) => {
        const made = await aLead(tx, { ownerUserId: salesperson.userId });
        await tx.person.update({ where: { id: made.personId }, data: { phoneE164: null, email: "x@example.test" } });
        return made;
      });
      await expect(inOrg((tx) => sendCallToMyPhone(tx, salesperson, lead.id))).rejects.toMatchObject({
        reason: "LEAD_HAS_NO_PHONE",
      });
    });
  });
});

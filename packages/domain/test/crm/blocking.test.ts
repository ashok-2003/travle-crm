// Blocking a lead's contact (spec 3.4, 3.6, 4; R28, R33): the phone, else the email, else the handle goes on the
// blocked list (once, however often it is blocked) and the lead becomes Not a lead, leaving the person's other leads
// alone; the list reads newest first, and an unblocked contact can be blocked again. The audit log never holds the
// blocked value.
import { randomUUID } from "node:crypto";
import { blockedContactsInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { addBlockedContact, blockLeadContact, listBlockedContacts, unblockContact } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, aTask, freshPhone, type PersonSeed } from "./support/records.js";

describe("blocking a lead's contact", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const block = (leadId: string) => inOrg((tx) => blockLeadContact(tx, manager, { leadId }, new Date()));
  const blockedValues = () =>
    inOrg(async (tx) =>
      (await tx.blockedContact.findMany({ orderBy: { id: "asc" } })).map((row) => [row.kind, row.value]),
    );
  const list = (input: Record<string, unknown> = {}) =>
    inOrg((tx) => listBlockedContacts(tx, blockedContactsInput.parse(input)));
  const leadFor = (person: PersonSeed) =>
    inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx, person)).id, ownerUserId: manager.userId }));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Blocking");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("blocks the phone (else the email, else the handle), marks the lead Not a lead and leaves the person's other leads", async () => {
    const phone = freshPhone();
    const { blocked, other } = await inOrg(async (tx) => {
      const person = await aPerson(tx, { phoneE164: phone, email: "spam@example.com" });
      const first = await aLead(tx, { personId: person.id, ownerUserId: manager.userId, stage: "contacted" });
      await aTask(tx, { kind: "follow-up", record: { recordType: "lead", recordId: first.id } });
      const second = await aLead(tx, { personId: person.id, ownerUserId: manager.userId });
      return { blocked: first, other: second };
    });
    await block(blocked.id);
    expect(await blockedValues()).toEqual([["phone", phone]]);
    const leads = await inOrg((tx) =>
      tx.lead.findMany({ where: { personId: blocked.personId }, orderBy: { id: "asc" } }),
    );
    expect(leads.map((lead) => [lead.id, lead.stage])).toEqual([
      [blocked.id, "not_a_lead"],
      [other.id, "new"],
    ]);
    expect(await inOrg((tx) => tx.task.count({ where: { recordId: blocked.id, cancelledAt: null } }))).toBe(0);
    const [entry] = await inOrg((tx) => tx.blockedContact.findMany());
    const audit = await inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: entry?.id ?? "" } }));
    expect(audit).toMatchObject([
      { action: "blocked-contact.added", entityType: "blocked_contact", after: { kind: "phone" } },
    ]);
    expect(JSON.stringify(audit)).not.toContain(phone);
    const events = await inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "blocked-contact.added" } }));
    expect(events.map((event) => event.payload)).toEqual([{ blockedContactId: entry?.id }]);

    await block(
      (await leadFor({ phoneE164: null, email: "only.email@example.com", instagramHandle: "only.email" })).id,
    );
    await block((await leadFor({ phoneE164: null, instagramHandle: "just.a.handle" })).id);
    expect((await blockedValues()).slice(1)).toEqual([
      ["email", "only.email@example.com"],
      ["instagram", "just.a.handle"],
    ]);
  });

  it("adds nothing when the value is already blocked", async () => {
    const phone = freshPhone();
    const lead = await leadFor({ phoneE164: phone });
    await block(lead.id);
    await inOrg((tx) => tx.lead.update({ where: { id: lead.id }, data: { stage: "contacted" } }));
    await block(lead.id);
    const entries = await inOrg((tx) => tx.blockedContact.findMany({ where: { value: phone } }));
    expect(entries).toHaveLength(1);
    expect(await inOrg((tx) => addBlockedContact(tx, manager, { kind: "phone", value: phone }))).toBe(false);
    expect(await inOrg((tx) => tx.auditEntry.count({ where: { entityId: entries[0]?.id ?? "" } }))).toBe(1);
    expect((await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }))).stage).toBe("not_a_lead");
  });

  it("lists blocked contacts newest first and unblocks one, which can be blocked again", async () => {
    await block((await leadFor({ phoneE164: null, instagramHandle: "twin" })).id);
    const all = await list({ limit: 50 });
    expect(all.items.map((item) => item.value)).toEqual(
      [...(await blockedValues())].reverse().map(([, value]) => value),
    );
    expect(all.items[0]).toMatchObject({ kind: "instagram", value: "twin", blockedBy: manager.userId });
    const first = await list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    const rest = await list({ limit: 50, before: first.nextCursor });
    expect([...first.items, ...rest.items]).toEqual(all.items);
    expect(rest.nextCursor).toBeNull();

    const twin = all.items[0]?.id ?? "";
    await inOrg((tx) => unblockContact(tx, manager, { blockedContactId: twin }));
    expect((await list({ limit: 50 })).items.map((item) => item.id)).not.toContain(twin);
    expect(
      await inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: twin }, orderBy: { id: "asc" } })),
    ).toMatchObject([
      { action: "blocked-contact.added" },
      { action: "blocked-contact.removed", before: { kind: "instagram" } },
    ]);
    await expect(inOrg((tx) => unblockContact(tx, manager, { blockedContactId: twin }))).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
    expect(await inOrg((tx) => addBlockedContact(tx, manager, { kind: "instagram", value: "twin" }))).toBe(true);
    expect((await list({ limit: 1 })).items).toMatchObject([{ kind: "instagram", value: "twin" }]);
  });
});

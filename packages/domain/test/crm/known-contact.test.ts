// The known-contact check (spec 3.2; R4, R24, R33): who a phone, email or handle belongs to, however it is typed; their
// newest open lead, named by its destination and owner, its id only for someone who can see it; and whether any
// contact given is on the blocked list.
import { randomUUID } from "node:crypto";
import { knownContactInput } from "@travel-crm/contracts/crm";
import { createDatabase, softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { findKnownContact } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, freshPhone } from "./support/records.js";

describe("the known-contact check", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  /** Asks about contacts as the form types them. */
  const known = (access: MemberAccess, typed: Record<string, string>) =>
    inOrg((tx) => findKnownContact(tx, access, knownContactInput.parse(typed)));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Known contacts");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("matches a phone however it is typed", async () => {
    const rahul = await inOrg((tx) => aPerson(tx, { phoneE164: "+919876543210" }));
    for (const phone of ["98765 43210", "098765-43210", "+91 98765 43210"]) {
      expect((await known(manager, { phone })).match).toEqual({
        personId: rahul.id,
        personName: "Rahul Sharma",
        matchedBy: "phone",
        openLead: null,
      });
    }
  });

  it("keeps a foreign number's own country", async () => {
    const jane = await inOrg((tx) => aPerson(tx, { name: "Jane Doe", phoneE164: "+14155552671" }));
    const indian = await inOrg((tx) => aPerson(tx, { name: "Ravi Rao", phoneE164: "+914155552671" }));
    expect(knownContactInput.parse({ phone: "+1 415 555 2671" }).phone).toBe("+14155552671");
    expect((await known(manager, { phone: "+1 415 555 2671" })).match?.personId).toBe(jane.id);
    expect((await known(manager, { phone: "415 555 2671" })).match?.personId).toBe(indian.id);
    expect((await known(manager, { phone: "+44 20 7946 0958" })).match).toBeNull();
  });

  it("matches by email, then handle, when no phone matches", async () => {
    const byEmail = await inOrg((tx) => aPerson(tx, { name: "Priya Patel", email: "priya@example.com" }));
    const byHandle = await inOrg((tx) =>
      aPerson(tx, { name: "Neha Iyer", phoneE164: null, instagramHandle: "neha.travels" }),
    );
    const unknownPhone = freshPhone();
    expect(
      (await known(manager, { phone: unknownPhone, email: " Priya@Example.com", instagramHandle: "@Neha.Travels" }))
        .match,
    ).toMatchObject({ personId: byEmail.id, matchedBy: "email" });
    expect((await known(manager, { phone: unknownPhone, instagramHandle: "@Neha.Travels" })).match).toMatchObject({
      personId: byHandle.id,
      personName: "Neha Iyer",
      matchedBy: "instagram",
    });
  });

  it("tells of the newest open lead with its destination and owner", async () => {
    const owner = randomUUID();
    const phone = freshPhone();
    const { person, newest } = await inOrg(async (tx) => {
      const kashmir = await tx.destination.create({ data: { name: "Kashmir" } });
      const goa = await tx.destination.create({ data: { name: "Goa" } });
      const someone = await aPerson(tx, { phoneE164: phone });
      await aLead(tx, { personId: someone.id, ownerUserId: owner, destinationId: goa.id, stage: "contacted" });
      const open = await aLead(tx, { personId: someone.id, ownerUserId: owner, destinationId: kashmir.id });
      await aLead(tx, { personId: someone.id, ownerUserId: owner, destinationId: goa.id, stage: "lost" });
      return { person: someone, newest: open };
    });
    expect((await known(manager, { phone })).match).toEqual({
      personId: person.id,
      personName: "Rahul Sharma",
      matchedBy: "phone",
      openLead: { leadId: newest.id, destinationName: "Kashmir", ownerUserId: owner },
    });
  });

  it("names the owner and destination of a lead the salesperson can't see, never its id", async () => {
    const asha = randomUUID();
    const [theirs, mine] = [freshPhone(), freshPhone()];
    const own = await inOrg(async (tx) => {
      const manali = await tx.destination.create({ data: { name: "Manali" } });
      await aLead(tx, {
        personId: (await aPerson(tx, { phoneE164: theirs })).id,
        ownerUserId: asha,
        destinationId: manali.id,
      });
      return aLead(tx, { personId: (await aPerson(tx, { phoneE164: mine })).id, ownerUserId: salesperson.userId });
    });
    expect((await known(salesperson, { phone: theirs })).match?.openLead).toEqual({
      leadId: null,
      destinationName: "Manali",
      ownerUserId: asha,
    });
    expect((await known(salesperson, { phone: mine })).match?.openLead).toEqual({
      leadId: own.id,
      destinationName: null,
      ownerUserId: salesperson.userId,
    });
  });

  it("says blocked when any contact given is blocked", async () => {
    const phone = freshPhone();
    const entry = await inOrg((tx) => tx.blockedContact.create({ data: { kind: "email", value: "spam@example.com" } }));
    expect(await known(manager, { phone, email: "SPAM@example.com" })).toEqual({ match: null, blocked: true });
    await inOrg((tx) => tx.blockedContact.update({ where: { id: entry.id }, data: softDeleted(manager.userId) }));
    expect((await known(manager, { phone, email: "spam@example.com" })).blocked).toBe(false);
    await inOrg((tx) => tx.blockedContact.create({ data: { kind: "phone", value: phone } }));
    expect((await known(manager, { phone })).blocked).toBe(true);
  });

  it("answers null for nobody known", async () => {
    expect(
      await known(manager, { phone: freshPhone(), email: "nobody@example.com", instagramHandle: "no.body" }),
    ).toEqual({ match: null, blocked: false });
  });
});

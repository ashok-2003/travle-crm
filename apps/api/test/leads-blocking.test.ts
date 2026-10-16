// Blocking over HTTP (spec 3.4, 3.6; R17, R33): only leads:assign blocks a lead's number, lists the blocked contacts
// (naming who blocked each) and unblocks them; the known-contact check then warns, and saving still works.
import type { BlockedContactsPage, KnownContactResult, LeadDetail } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("blocking a number", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let salesperson: CookieJar;
  let leadId: string;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    const zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    salesperson = await signedInStaff(server, agency, zara);
    leadId = await server.db.forOrg(agency.organizationId, async (tx) => {
      const person = await tx.person.create({ data: { name: "Spam Caller", phoneE164: "+919876543210" } });
      const lead = await tx.lead.create({
        data: { personId: person.id, source: "phone_call", ownerUserId: zara.userId },
      });
      return lead.id;
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("lets only leads:assign block, list and unblock", async () => {
    const forbidden = { status: 403, reason: "MISSING_PERMISSION" };
    expect(await refusalOf(await mutate(server, "leads.block", { leadId }, salesperson))).toEqual(forbidden);
    expect(await refusalOf(await query(server, "blockedContacts.list", salesperson, {}))).toEqual(forbidden);

    await dataOf(await mutate(server, "leads.block", { leadId }, owner));
    expect((await dataOf<LeadDetail>(await query(server, "leads.get", owner, { leadId }))).stage).toBe("not_a_lead");
    const page = await dataOf<BlockedContactsPage>(await query(server, "blockedContacts.list", owner, {}));
    expect(page).toMatchObject({
      items: [{ kind: "phone", value: "+919876543210", blockedBy: agency.owner.userId }],
      nextCursor: null,
      people: { [agency.owner.userId]: "Asha Owner" },
    });
    const known = await dataOf<KnownContactResult>(
      await query(server, "leads.knownContact", salesperson, { phone: "98765 43210" }),
    );
    expect(known.blocked).toBe(true);

    const blockedContactId = page.items[0]?.id ?? "";
    expect(await refusalOf(await mutate(server, "blockedContacts.unblock", { blockedContactId }, salesperson))).toEqual(
      forbidden,
    );
    await dataOf(await mutate(server, "blockedContacts.unblock", { blockedContactId }, owner));
    expect((await dataOf<BlockedContactsPage>(await query(server, "blockedContacts.list", owner, {}))).items).toEqual(
      [],
    );
    expect(await refusalOf(await mutate(server, "blockedContacts.unblock", { blockedContactId }, owner))).toEqual({
      status: 404,
      reason: "NOT_FOUND",
    });
  });
});

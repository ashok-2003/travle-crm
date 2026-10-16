// The known-contact check over HTTP (spec 3.2; R19, R24): the contacts travel in the query's address however they are
// typed, a salesperson learns only the destination and owner of a lead they can't see (never its id: a side door to
// another's lead), and the owner is named from the members, not the sign-in tables.
import type { KnownContactResult } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";

describe("the known-contact check", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let zara: TestStaff;
  let salesperson: CookieJar;
  let leadId: string;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    salesperson = await signedInStaff(server, agency, zara);
    leadId = await server.db.forOrg(agency.organizationId, async (tx) => {
      const kashmir = await tx.destination.create({ data: { name: "Kashmir" } });
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876543210" } });
      const lead = await tx.lead.create({
        data: { personId: person.id, source: "walk_in", ownerUserId: agency.owner.userId, destinationId: kashmir.id },
      });
      return lead.id;
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("names the owner and destination of a lead the salesperson can't see, never its id", async () => {
    const known = await dataOf<KnownContactResult>(
      await query(server, "leads.knownContact", salesperson, { phone: "098765-43210" }),
    );
    expect(known).toMatchObject({
      match: {
        personName: "Rahul Sharma",
        matchedBy: "phone",
        openLead: { leadId: null, destinationName: "Kashmir", ownerUserId: agency.owner.userId },
      },
      blocked: false,
      people: { [agency.owner.userId]: "Asha Owner" },
    });
    expect(JSON.stringify(known)).not.toContain(leadId);
  });

  it("gives the lead's id to someone who can see it", async () => {
    const known = await dataOf<KnownContactResult>(
      await query(server, "leads.knownContact", owner, { phone: "+91 98765 43210" }),
    );
    expect(known.match?.openLead?.leadId).toBe(leadId);
  });

  it("asks for at least one contact", async () => {
    expect(await refusalOf(await query(server, "leads.knownContact", salesperson, {}))).toMatchObject({ status: 400 });
  });
});

// The lead list over HTTP (spec 3.3; R13): a salesperson gets only their own leads whatever view or owner the address
// asks for, a manager gets everyone's with the owners named from the members, and the counts follow the same view.
import type { LeadCounts, LeadListPage } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, query } from "./support/trpc.js";

describe("the lead list", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let zara: TestStaff;
  let salesperson: CookieJar;
  let zaraLead: string;
  let ownerLead: string;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    salesperson = await signedInStaff(server, agency, zara);
    [zaraLead, ownerLead] = await server.db.forOrg(agency.organizationId, async (tx) => {
      const leadFor = async (name: string, phoneE164: string, ownerUserId: string) => {
        const person = await tx.person.create({ data: { name, phoneE164 } });
        return (await tx.lead.create({ data: { personId: person.id, source: "walk_in", ownerUserId } })).id;
      };
      return [
        await leadFor("Rahul Sharma", "+919876543210", zara.userId),
        await leadFor("Priya Patel", "+919876500000", agency.owner.userId),
      ];
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("shows a salesperson only their own leads, whatever view or owner they send", async () => {
    for (const input of [{}, { view: "everyone" }, { view: "everyone", ownerUserId: agency.owner.userId }]) {
      const page = await dataOf<LeadListPage>(await query(server, "leads.list", salesperson, input));
      expect(page.items.map((item) => item.id)).toEqual([zaraLead]);
      expect(page.people).toEqual({ [zara.userId]: "zara" });
    }
    expect(
      await dataOf<LeadCounts>(await query(server, "leads.counts", salesperson, { view: "everyone", search: "98765" })),
    ).toMatchObject({ open: 1, new: 1 });
  });

  it("lists everyone's for a manager, naming the owners, and searches by digits typed with spaces", async () => {
    const page = await dataOf<LeadListPage>(await query(server, "leads.list", owner, { view: "everyone" }));
    expect(page.items.map((item) => item.id)).toEqual([ownerLead, zaraLead]);
    expect(page.people).toEqual({ [zara.userId]: "zara", [agency.owner.userId]: "Asha Owner" });
    const found = await dataOf<LeadListPage>(
      await query(server, "leads.list", owner, { view: "everyone", search: "43 210" }),
    );
    expect(found.items).toMatchObject([{ id: zaraLead, person: { name: "Rahul Sharma", phone: "+919876543210" } }]);
    expect(await dataOf<LeadCounts>(await query(server, "leads.counts", owner, { view: "everyone" }))).toEqual({
      open: 2,
      new: 2,
      contacted: 0,
      quote_sent: 0,
      booking_requested: 0,
    });
  });
});

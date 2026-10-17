// Changes from a lead's page over HTTP (spec 3.4, 4; R14, R30-R32): a stage moved and a lost lead reopened, the lead
// reassigned to someone who can work leads (operations staff refused with NOT_A_LEAD_WORKER), the trip replaced, and a
// person's contact that another customer holds refused with CONTACT_ON_ANOTHER_PERSON.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("changes from a lead's page", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let zara: TestStaff;
  let om: TestStaff;
  let salesperson: CookieJar;
  let leadId: string;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    om = await addStaff(server, agency, { username: "om", roleKey: "operations" });
    salesperson = await signedInStaff(server, agency, zara);
    leadId = await server.db.forOrg(agency.organizationId, async (tx) => {
      await tx.person.create({ data: { name: "Priya Patel", phoneE164: "+919876500000" } });
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876543210" } });
      const lead = await tx.lead.create({
        data: { personId: person.id, source: "walk_in", ownerUserId: agency.owner.userId, stage: "contacted" },
      });
      return lead.id;
    });
  });

  afterAll(async () => {
    await server.close();
  });

  const lead = async () => dataOf<LeadDetail>(await query(server, "leads.get", owner, { leadId }));

  it("moves a lead to Lost and reopens it where it was", async () => {
    await dataOf(await mutate(server, "leads.moveStage", { leadId, stage: "lost" }, owner));
    expect(await lead()).toMatchObject({ stage: "lost", reopenStage: "contacted" });
    await dataOf(await mutate(server, "leads.reopen", { leadId }, owner));
    expect((await lead()).stage).toBe("contacted");
  });

  it("reassigns to someone who can work leads and tells them; refuses anyone else", async () => {
    expect(await refusalOf(await mutate(server, "leads.reassign", { leadId, ownerUserId: om.userId }, owner))).toEqual({
      status: 400,
      reason: "NOT_A_LEAD_WORKER",
    });
    await dataOf(await mutate(server, "leads.reassign", { leadId, ownerUserId: zara.userId }, owner));
    const detail = await dataOf<LeadDetail>(await query(server, "leads.get", salesperson, { leadId }));
    expect(detail).toMatchObject({ ownerUserId: zara.userId, people: { [zara.userId]: "zara" } });
    const told = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.notification.findMany({ where: { link: `/leads/${leadId}` } }),
    );
    expect(told).toMatchObject([{ recipientUserId: zara.userId, kind: "lead.assigned" }]);
  });

  it("replaces the trip, and refuses a contact another customer holds", async () => {
    const trip = {
      destination: { kind: "new", name: "  Kashmir  " },
      when: { kind: "month", month: "2026-12" },
      adults: 2,
      childrenAges: [],
      budget: null,
      departureCity: null,
      tripType: "honeymoon",
      hotelCategory: null,
      food: null,
      roomType: null,
    };
    await dataOf(await mutate(server, "leads.editTrip", { leadId, trip }, salesperson));
    expect((await lead()).trip).toMatchObject({
      destination: { name: "Kashmir" },
      when: { kind: "month", month: "2026-12" },
      tripType: "honeymoon",
    });
    const taken = { leadId, person: { name: "Rahul Sharma", phone: "98765 00000" } };
    expect(await refusalOf(await mutate(server, "leads.editPerson", taken, salesperson))).toEqual({
      status: 409,
      reason: "CONTACT_ON_ANOTHER_PERSON",
    });
    const edited = { leadId, person: { name: "Rahul K. Sharma", phone: "98765 43210", email: "Rahul@Example.com" } };
    await dataOf(await mutate(server, "leads.editPerson", edited, salesperson));
    expect((await lead()).person).toMatchObject({
      name: "Rahul K. Sharma",
      phone: "+919876543210",
      email: "rahul@example.com",
    });
  });
});

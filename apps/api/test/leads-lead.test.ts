// A lead over HTTP (spec 3.4; R13, R26; Review Focus 1): its page names the people it mentions from the members, and a
// salesperson reaching another's lead by its id, from any procedure, is answered 404 NOT_FOUND and changes nothing.
import type { LeadDetail, TimelinePage } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("a lead", () => {
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
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876543210" } });
      const lead = await tx.lead.create({
        data: { personId: person.id, source: "walk_in", ownerUserId: agency.owner.userId, createdBy: zara.userId },
      });
      return lead.id;
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("reads a lead and its timeline, naming its owner and who added it", async () => {
    await dataOf(await mutate(server, "leads.addNote", { leadId, body: "Wants Kashmir in December" }, owner));
    const lead = await dataOf<LeadDetail>(await query(server, "leads.get", owner, { leadId }));
    expect(lead).toMatchObject({ id: leadId, stage: "new", person: { name: "Rahul Sharma" }, work: [] });
    expect(lead.people).toEqual({ [agency.owner.userId]: "Asha Owner", [zara.userId]: "zara" });
    const page = await dataOf<TimelinePage>(await query(server, "leads.timeline", owner, { leadId }));
    expect(page).toMatchObject({
      entries: [{ kind: "note", body: "Wants Kashmir in December", actorUserId: agency.owner.userId }],
      nextCursor: null,
      people: { [agency.owner.userId]: "Asha Owner" },
    });
  });

  it("answers NOT_FOUND for another salesperson's lead, from every procedure", async () => {
    const notFound = { status: 404, reason: "NOT_FOUND" };
    expect(await refusalOf(await query(server, "leads.get", salesperson, { leadId }))).toEqual(notFound);
    expect(await refusalOf(await query(server, "leads.timeline", salesperson, { leadId }))).toEqual(notFound);
    expect(await refusalOf(await mutate(server, "leads.addNote", { leadId, body: "Called" }, salesperson))).toEqual(
      notFound,
    );
    expect(await server.db.forOrg(agency.organizationId, (tx) => tx.leadNote.count({ where: { leadId } }))).toBe(1);
  });
});

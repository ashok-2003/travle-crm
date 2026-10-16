// A lead over HTTP (spec 3.4; R13, R26; Review Focus 1, P6): its page names the people it mentions from the members,
// and a member who sees only their own leads, reaching another's lead by its id from any procedure, is answered 404
// NOT_FOUND and changes nothing.
import type { LeadDetail, TimelinePage } from "@travel-crm/contracts/crm";
import type { Task } from "@travel-crm/contracts/tasks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, ownerAccess, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const noTrip = {
  destination: null,
  when: { kind: "unknown" },
  adults: null,
  childrenAges: [],
  budget: null,
  departureCity: null,
  tripType: null,
  hotelCategory: null,
  food: null,
  roomType: null,
};

describe("a lead", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let zara: TestStaff;
  let salesperson: CookieJar;
  /** A role that may reassign and block, but sees only its own leads. */
  let teamLead: CookieJar;
  let leadId: string;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    salesperson = await signedInStaff(server, agency, zara);
    const role = await server.identity.roles.create(await ownerAccess(server, agency), {
      name: "Team lead",
      permissions: [
        { permission: "leads:view", scope: "own" },
        { permission: "leads:edit" },
        { permission: "leads:assign" },
      ],
    });
    teamLead = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "tara", roleKey: role.key }),
    );
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
    const changes: [string, unknown][] = [
      ["leads.addNote", { leadId, body: "Called" }],
      ["leads.moveStage", { leadId, stage: "lost" }],
      ["leads.reopen", { leadId }],
      ["leads.editTrip", { leadId, trip: noTrip }],
      ["leads.editPerson", { leadId, person: { name: "Someone", phone: "98765 11111" } }],
      ["leads.addWork", { leadId, kind: "follow-up", title: "Call", due: { on: "2027-01-15", at: "10:00" } }],
    ];
    for (const [path, input] of changes) {
      expect(await refusalOf(await mutate(server, path, input, salesperson)), path).toEqual(notFound);
    }
    const reassign = { leadId, ownerUserId: zara.userId };
    expect(await refusalOf(await mutate(server, "leads.reassign", reassign, teamLead))).toEqual(notFound);
    expect(await refusalOf(await mutate(server, "leads.block", { leadId }, teamLead))).toEqual(notFound);
    expect(await dataOf<LeadDetail>(await query(server, "leads.get", owner, { leadId }))).toMatchObject({
      stage: "new",
      ownerUserId: agency.owner.userId,
      person: { name: "Rahul Sharma", phone: "+919876543210" },
      trip: { when: { kind: "unknown" } },
    });
    expect(await server.db.forOrg(agency.organizationId, (tx) => tx.leadNote.count({ where: { leadId } }))).toBe(1);
    expect(await server.db.forOrg(agency.organizationId, (tx) => tx.blockedContact.count())).toBe(0);
  });

  it("adds a follow-up for the lead's owner, whoever adds it", async () => {
    const followUp = { leadId, kind: "follow-up", title: "Send the quote", due: { on: "2027-01-15", at: "10:00" } };
    expect(await dataOf<Task>(await mutate(server, "leads.addWork", followUp, owner))).toMatchObject({
      dueAt: "2027-01-15T04:30:00.000Z",
      assigneeUserId: agency.owner.userId,
      record: { recordType: "lead", recordId: leadId },
    });
    const lead = await dataOf<LeadDetail>(await query(server, "leads.get", owner, { leadId }));
    expect(lead.work).toMatchObject([{ title: "Send the quote", assigneeUserId: agency.owner.userId }]);
  });
});

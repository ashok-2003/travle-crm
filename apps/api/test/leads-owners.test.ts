// Who can own leads, over HTTP (spec 6, R14): the owner picker lists every lead worker for someone who may choose an
// owner (leads:assign), and only themselves for a salesperson; and reassigning a lead needs leads:assign.
import type { LeadWorker } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("the people who own leads", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let zara: TestStaff;
  let salesperson: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    await addStaff(server, agency, { username: "om", roleKey: "operations" });
    salesperson = await signedInStaff(server, agency, zara);
  });

  afterAll(async () => {
    await server.close();
  });

  it("lists every lead worker for an Owner, and only themselves for a salesperson", async () => {
    expect(await dataOf<LeadWorker[]>(await query(server, "leads.owners", owner))).toEqual([
      { userId: agency.owner.userId, name: "Asha Owner" },
      { userId: zara.userId, name: "zara" },
    ]);
    expect(await dataOf<LeadWorker[]>(await query(server, "leads.owners", salesperson))).toEqual([
      { userId: zara.userId, name: "zara" },
    ]);
  });

  it("refuses leads.reassign to a salesperson: MISSING_PERMISSION", async () => {
    const leadId = await server.db.forOrg(agency.organizationId, async (tx) => {
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876543210" } });
      return (await tx.lead.create({ data: { personId: person.id, source: "walk_in", ownerUserId: zara.userId } })).id;
    });
    const reassign = { leadId, ownerUserId: agency.owner.userId };
    expect(await refusalOf(await mutate(server, "leads.reassign", reassign, salesperson))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    expect(await refusalOf(await mutate(server, "leads.block", { leadId }, salesperson))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });
});

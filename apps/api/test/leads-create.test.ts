// Adding leads over HTTP (spec 3.2; R14, R24): a lead from the form, a known person's open lead asked about with
// OPEN_LEAD_EXISTS and then added to (its id kept from a salesperson who can't see it), and the owner the form names:
// only with leads:assign, only someone who can work leads, who is then told.
import type { CreatedLead } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, refusalOf } from "./support/trpc.js";

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

function newLead(phone: string, rest: Record<string, unknown> = {}) {
  return {
    person: { name: "Rahul Sharma", phone },
    trip: noTrip,
    note: null,
    source: "phone_call",
    sourceDetail: null,
    ownerUserId: null,
    whenOpenLead: null,
    ...rest,
  };
}

describe("adding leads", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let zara: TestStaff;
  let om: TestStaff;
  let salesperson: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    zara = await addStaff(server, agency, { username: "zara", roleKey: "sales" });
    om = await addStaff(server, agency, { username: "om", roleKey: "operations" });
    salesperson = await signedInStaff(server, agency, zara);
  });

  afterAll(async () => {
    await server.close();
  });

  const inAgency = <T>(work: Parameters<typeof server.db.forOrg<T>>[1]) =>
    server.db.forOrg(agency.organizationId, work);

  it("adds a lead, its phone typed any way, owned by whoever adds it", async () => {
    const created = await dataOf<CreatedLead>(
      await mutate(server, "leads.create", newLead("98765 43210"), salesperson),
    );
    expect(created).toMatchObject({ outcome: "created", returning: false });
    const lead = await inAgency((tx) =>
      tx.lead.findUniqueOrThrow({ where: { id: created.leadId ?? "" }, include: { person: true } }),
    );
    expect(lead).toMatchObject({ stage: "new", ownerUserId: zara.userId, person: { phoneE164: "+919876543210" } });
  });

  it("asks with OPEN_LEAD_EXISTS, then adds to the open lead without telling a salesperson its id", async () => {
    const open = await dataOf<CreatedLead>(await mutate(server, "leads.create", newLead("98765 11111"), owner));
    expect(await refusalOf(await mutate(server, "leads.create", newLead("+91 98765 11111"), salesperson))).toEqual({
      status: 409,
      reason: "OPEN_LEAD_EXISTS",
    });
    const added = await dataOf<CreatedLead>(
      await mutate(server, "leads.create", newLead("098765-11111", { whenOpenLead: "add-to-it" }), salesperson),
    );
    expect(added).toEqual({ outcome: "added-to-open-lead", leadId: null, returning: false });
    expect(await inAgency((tx) => tx.leadEnquiry.count({ where: { leadId: open.leadId ?? "" } }))).toBe(1);
  });

  it("lets only leads:assign choose another owner, who must work leads and is then told", async () => {
    const forZara = newLead("98765 22222", { ownerUserId: zara.userId });
    expect(
      await refusalOf(
        await mutate(server, "leads.create", { ...forZara, ownerUserId: agency.owner.userId }, salesperson),
      ),
    ).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
    expect(
      await refusalOf(await mutate(server, "leads.create", { ...forZara, ownerUserId: om.userId }, owner)),
    ).toEqual({ status: 400, reason: "NOT_A_LEAD_WORKER" });
    const created = await dataOf<CreatedLead>(await mutate(server, "leads.create", forZara, owner));
    const told = await inAgency((tx) =>
      tx.notification.findMany({ where: { link: `/leads/${created.leadId ?? ""}` } }),
    );
    expect(told).toMatchObject([{ recipientUserId: zara.userId, kind: "lead.assigned" }]);
  });
});

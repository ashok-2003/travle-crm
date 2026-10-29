// Today over HTTP (spec 3.5, R35): the signed-in person's day, its counts, top three and sections a page at a time,
// passing the output schemas; always their own items, even for a manager who sees every lead.
import type { TodaySectionPage, TodaySummary } from "@travel-crm/contracts/today";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, query } from "./support/trpc.js";

const HOUR_MS = 60 * 60 * 1000;

describe("today over HTTP", () => {
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
    salesperson = await signedInStaff(server, agency, zara);
  });

  afterAll(async () => {
    await server.close();
  });

  it("answers the salesperson's own day, and only the manager's own to the manager", async () => {
    const { leadId, followUpId } = await server.db.forOrg(agency.organizationId, async (tx) => {
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876500077" } });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "walk_in", ownerUserId: zara.userId } });
      const dueAt = new Date(Date.now() - HOUR_MS);
      const followUp = await tx.task.create({
        data: {
          kind: "follow-up",
          title: "Call back about Kashmir",
          dueAt,
          firstDueAt: dueAt,
          assigneeUserId: zara.userId,
          recordType: "lead",
          recordId: lead.id,
        },
      });
      return { leadId: lead.id, followUpId: followUp.id };
    });

    const summary = await dataOf<TodaySummary>(await query(server, "today.summary", salesperson));
    expect(summary.counts).toEqual({ overdue: 1, newLeads: 1, dueToday: 0, quoteOpened: 0, paymentsDue: 0 });
    expect(summary.top).toMatchObject([
      {
        kind: "task",
        task: { id: followUpId, title: "Call back about Kashmir" },
        lead: { id: leadId, personName: "Rahul Sharma", phone: "+919876500077", source: "walk_in" },
      },
      { kind: "new-lead", lead: { id: leadId } },
    ]);

    const page = await dataOf<TodaySectionPage>(
      await query(server, "today.section", salesperson, { section: "new-leads" }),
    );
    expect(page).toMatchObject({ items: [{ kind: "new-lead", lead: { id: leadId } }], nextCursor: null });

    const managers = await dataOf<TodaySummary>(await query(server, "today.summary", owner));
    expect(managers).toMatchObject({
      counts: { overdue: 0, newLeads: 0, dueToday: 0, quoteOpened: 0, paymentsDue: 0 },
      top: [],
    });
  });
});

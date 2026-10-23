// Erasing a customer who came from a Meta lead ad (spec 10): their ledger row keeps the Meta lead id and form id and loses
// the lead, the person and the example, every example in the agency is emptied, the Meta lead id is then settled so the
// catch-up never brings it back, and the platform log counts what was withdrawn.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { exportSubject, eraseSubject, requestErasure, ERASE_SUBJECT_QUEUE } from "../../src/platform/index.js";
import { erasureJobOf } from "../../src/platform/erasure.js";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { deletionAgency } from "../platform/test-deletion.js";
import { createTestPlan, createTestPlatform, support, type TestPlatform } from "../platform/test-platform.js";

describe("erasing a customer who came from a Meta lead ad", () => {
  let platformTest: TestPlatform;
  let plan: PlanSummary;
  let platform: PlatformClient;

  beforeAll(async () => {
    platformTest = createTestPlatform();
    plan = await createTestPlan(platformTest);
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
    await platformTest.close();
  });

  it("settles the person's ledger rows, empties the examples, counts it, and leaves a stranger's row", async () => {
    const agency = await deletionAgency(platformTest, plan);
    const seeded = await platformTest.services.db.forOrg(agency.organizationId, async (tx) => {
      const person = await aPerson(tx, { name: "Neha Joshi", phoneE164: freshPhone() });
      const lead = await aLead(tx, { personId: person.id, ownerUserId: agency.owner.userId });
      const stranger = await aPerson(tx, { name: "Ravi Kumar", phoneE164: freshPhone() });
      const strangerLead = await aLead(tx, { personId: stranger.id });
      await tx.metaLead.create({
        data: { metaLeadId: "ML-NEHA", formId: "F1", status: "added", leadId: lead.id, personId: person.id },
      });
      await tx.metaLead.create({
        data: { metaLeadId: "ML-RAVI", formId: "F1", status: "merged", leadId: strangerLead.id, personId: stranger.id },
      });
      await tx.metaLead.create({
        data: {
          metaLeadId: "ML-BAD",
          formId: "F1",
          status: "not_added",
          reasons: ["no_contact"],
          exampleName: "Third Person",
        },
      });
      return { person, stranger };
    });
    const subject = { kind: "record" as const, recordType: "person", recordId: seeded.person.id };
    const { organizationId, code } = agency;
    await exportSubject(platformTest.services, support, { organizationId, subject });
    await requestErasure(platformTest.services, support, { organizationId, subject, confirmation: code });
    const sent = platformTest.queue.sent.at(-1);
    if (sent?.queue !== ERASE_SUBJECT_QUEUE) throw new Error("no erasure job was queued");
    await eraseSubject(platformTest.services, erasureJobOf(sent.data));

    const rows = await platform.metaLead.findMany({ where: { organizationId }, orderBy: { metaLeadId: "asc" } });
    expect(
      rows.map((row) => [row.metaLeadId, row.formId, row.status, row.leadId, row.personId, row.exampleName]),
    ).toEqual([
      ["ML-BAD", "F1", "not_added", null, null, null],
      ["ML-NEHA", "F1", "erased", null, null, null],
      ["ML-RAVI", "F1", "merged", rows[2]?.leadId ?? null, seeded.stranger.id, null],
    ]);
    const log = await platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.erased", targetOrganizationId: organizationId },
    });
    expect(log.after).toMatchObject({ customer: { metaLeadsWithdrawn: 1 } });
  });
});

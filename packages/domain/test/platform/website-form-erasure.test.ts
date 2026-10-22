// Erasing a customer also takes the website form's trace of them: their consent rows go, and their ledger rows keep
// only the outcome (person and lead ids emptied); nobody else's rows change, and the counts reach the platform log.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { withDeleted, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { eraseSubject, ERASE_SUBJECT_QUEUE, exportSubject, requestErasure } from "../../src/platform/index.js";
import { erasureJobOf } from "../../src/platform/erasure.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { deletionAgency, type DeletionAgency } from "./test-deletion.js";
import { createTestPlan, createTestPlatform, support, type TestPlatform } from "./test-platform.js";

describe("erasing a customer who used the website form", () => {
  let test: TestPlatform;
  let plan: PlanSummary;
  let platform: PlatformClient;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  /** Two people who enquired through the form, each with a lead, a consent row and a ledger row. */
  async function twoEnquirers(agency: DeletionAgency) {
    return test.services.db.forOrg(agency.organizationId, async (tx: OrgTx) => {
      const form = await tx.websiteForm.create({ data: { keySecret: "abcdefghijklmnop" }, select: { id: true } });
      const enquirer = async (name: string, submissionId: string) => {
        const person = await aPerson(tx, { name });
        const lead = await aLead(tx, { personId: person.id, source: "web_form" });
        await tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "marketing",
            action: "granted",
            wording: "Send me offers",
            wordingVersion: 1,
            source: "web_form",
            sourceFormId: form.id,
          },
        });
        await tx.websiteFormSubmission.create({
          data: {
            formId: form.id,
            submissionId,
            outcome: "new_lead",
            leadId: lead.id,
            personId: person.id,
          },
        });
        return { person, lead };
      };
      return {
        erased: await enquirer("Priya Nair", "0199e7a0-0000-7000-8000-0000000000a1"),
        kept: await enquirer("Asha Mehta", "0199e7a0-0000-7000-8000-0000000000a2"),
      };
    });
  }

  async function erase(agency: DeletionAgency, personId: string): Promise<void> {
    const subject = { kind: "record" as const, recordType: "person", recordId: personId };
    const { organizationId, code } = agency;
    await exportSubject(test.services, support, { organizationId, subject });
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    const sent = test.queue.sent.at(-1);
    if (sent?.queue !== ERASE_SUBJECT_QUEUE) throw new Error("no erasure job was queued");
    await eraseSubject(test.services, erasureJobOf(sent.data));
  }

  it("removes their consent rows and nulls their ledger ids and the lead and note with them", async () => {
    const agency = await deletionAgency(test, plan);
    const { erased } = await twoEnquirers(agency);
    const where = { organizationId: agency.organizationId };

    await erase(agency, erased.person.id);

    expect(await platform.personConsent.count({ where: { ...where, personId: erased.person.id } })).toBe(0);
    const ledger = await platform.websiteFormSubmission.findMany({
      where: { ...where, submissionId: "0199e7a0-0000-7000-8000-0000000000a1" },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ outcome: "new_lead", personId: null, leadId: null });
    const lead = await withDeleted(() => platform.lead.findUniqueOrThrow({ where: { id: erased.lead.id } }));
    expect(lead.sourceDetail).toBeNull();
    expect(lead.deletedAt).not.toBeNull();
  });

  it("leaves another person's rows untouched", async () => {
    const agency = await deletionAgency(test, plan);
    const { erased, kept } = await twoEnquirers(agency);
    const where = { organizationId: agency.organizationId };

    await erase(agency, erased.person.id);

    expect(await platform.personConsent.count({ where: { ...where, personId: kept.person.id } })).toBe(1);
    expect(
      await platform.websiteFormSubmission.findFirstOrThrow({ where: { ...where, personId: kept.person.id } }),
    ).toMatchObject({ leadId: kept.lead.id });
  });

  it("counts the new steps in the platform log", async () => {
    const agency = await deletionAgency(test, plan);
    const { erased } = await twoEnquirers(agency);

    await erase(agency, erased.person.id);

    const entry = await platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.erased", targetOrganizationId: agency.organizationId },
    });
    expect(entry.after).toMatchObject({ customer: { consentRows: 1, ledgerRows: 1 } });
  });

  it("is safe to repeat: a second erasure of the same person changes and counts nothing more", async () => {
    const agency = await deletionAgency(test, plan);
    const { erased, kept } = await twoEnquirers(agency);
    await erase(agency, erased.person.id);

    await erase(agency, erased.person.id);

    const entries = await platform.platformAuditEntry.findMany({
      where: { action: "subject.erased", targetOrganizationId: agency.organizationId },
      orderBy: { id: "desc" },
    });
    expect(entries[0]?.after).toMatchObject({ customer: { consentRows: 0, ledgerRows: 0 } });
    expect(await platform.personConsent.count({ where: { personId: kept.person.id } })).toBe(1);
  });

  it("treats a person who erased themselves and enquires again as a new person", async () => {
    const agency = await deletionAgency(test, plan);
    const { erased } = await twoEnquirers(agency);
    const phone = await platform.person.findUniqueOrThrow({ where: { id: erased.person.id } });
    await erase(agency, erased.person.id);

    const again = await test.services.db.forOrg(agency.organizationId, (tx: OrgTx) =>
      aPerson(tx, { name: "Priya Nair", phoneE164: phone.phoneE164 }),
    );

    expect(again.id).not.toBe(erased.person.id);
    expect(await platform.personConsent.count({ where: { personId: again.id } })).toBe(0);
  });
});

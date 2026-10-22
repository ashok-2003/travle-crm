// The submission ledger: one row for a submission id even when two race, counts over 30 days, and the 24-hour count
// that ignores what was stopped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findSubmission,
  formCounts,
  recentEnquiryCount,
  recordSubmission,
  type SubmissionOutcome,
} from "../../src/website-forms/index.js";
import { aPerson } from "../crm/support/records.js";
import { anAgency, anOpenForm, createTestForms, testNow, type TestForms } from "./support.js";
import { randomUUID } from "node:crypto";

const DAY = 86_400_000;
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("the submission ledger", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  async function agencyWithForm() {
    const organizationId = await anAgency(test);
    const { form } = await anOpenForm(test, organizationId);
    return { organizationId, formId: form.id };
  }

  const record = (organizationId: string, formId: string, outcome: SubmissionOutcome, at: Date, personId?: string) =>
    test.db.forOrg(organizationId, (tx) =>
      recordSubmission(tx, { formId, submissionId: randomUUID(), outcome, now: at, ...(personId ? { personId } : {}) }),
    );

  it("finds the row of a submission id it has recorded, with its outcome and no personal data", async () => {
    const { organizationId, formId } = await agencyWithForm();
    const submissionId = randomUUID();
    expect(await test.db.forOrg(organizationId, (tx) => findSubmission(tx, submissionId))).toBeNull();
    await test.db.forOrg(organizationId, (tx) =>
      recordSubmission(tx, { formId, submissionId, outcome: "spam", reason: "honeypot", now: testNow }),
    );
    expect(await test.db.forOrg(organizationId, (tx) => findSubmission(tx, submissionId))).toMatchObject({
      formId,
      submissionId,
      outcome: "spam",
      reason: "honeypot",
      leadId: null,
      personId: null,
    });
  });

  it("the ledger's unique submission id under a race: two at once leave one row, and the second finds the first", async () => {
    const { organizationId, formId } = await agencyWithForm();
    const submissionId = randomUUID();
    const attempt = (delay: number) =>
      test.db.forOrg(organizationId, async (tx) => {
        const found = await findSubmission(tx, submissionId);
        if (found !== null) return "found";
        await sleep(delay);
        await recordSubmission(tx, { formId, submissionId, outcome: "new_lead", now: testNow });
        return "recorded";
      });
    const first = attempt(300);
    await sleep(50);
    const second = attempt(0);
    expect((await Promise.all([first, second])).sort()).toEqual(["found", "recorded"]);
    expect(
      await test.db.forOrg(organizationId, (tx) => tx.websiteFormSubmission.count({ where: { submissionId } })),
    ).toBe(1);
  });

  it("recording one id twice leaves the first row as it was", async () => {
    const { organizationId, formId } = await agencyWithForm();
    const submissionId = randomUUID();
    await test.db.forOrg(organizationId, (tx) =>
      recordSubmission(tx, { formId, submissionId, outcome: "new_lead", now: testNow }),
    );
    await test.db.forOrg(organizationId, (tx) =>
      recordSubmission(tx, { formId, submissionId, outcome: "blocked", now: testNow }),
    );
    expect((await test.db.forOrg(organizationId, (tx) => findSubmission(tx, submissionId)))?.outcome).toBe("new_lead");
  });

  it("counts the last 30 days: enquiries, new leads, repeat enquiries and stopped", async () => {
    const { organizationId, formId } = await agencyWithForm();
    const ago = (days: number) => new Date(testNow.getTime() - days * DAY);
    for (const [outcome, days] of [
      ["new_lead", 1],
      ["new_lead", 29],
      ["new_lead", 31],
      ["repeat_enquiry", 2],
      ["blocked", 3],
      ["duplicate", 3],
      ["spam", 4],
      ["spam", 40],
    ] as const) {
      await record(organizationId, formId, outcome, ago(days));
    }
    expect(await test.db.forOrg(organizationId, (tx) => formCounts(tx, formId, testNow))).toEqual({
      enquiries: 3,
      newLeads: 2,
      repeatEnquiries: 1,
      stopped: 3,
    });
    expect(await test.db.forOrg(organizationId, (tx) => formCounts(tx, randomUUID(), testNow))).toEqual({
      enquiries: 0,
      newLeads: 0,
      repeatEnquiries: 0,
      stopped: 0,
    });
  });

  it("recentEnquiryCount ignores blocked, duplicate and spam, and anything over 24 hours old", async () => {
    const { organizationId, formId } = await agencyWithForm();
    const person = await test.db.forOrg(organizationId, (tx) => aPerson(tx));
    const hoursAgo = (hours: number) => new Date(testNow.getTime() - hours * 3_600_000);
    await record(organizationId, formId, "new_lead", hoursAgo(1), person.id);
    await record(organizationId, formId, "repeat_enquiry", hoursAgo(23), person.id);
    await record(organizationId, formId, "repeat_enquiry", hoursAgo(25), person.id);
    for (const outcome of ["blocked", "duplicate", "spam"] as const) {
      await record(organizationId, formId, outcome, hoursAgo(1), person.id);
    }
    expect(await test.db.forOrg(organizationId, (tx) => recentEnquiryCount(tx, person.id, testNow))).toBe(2);
  });
});

// Isolation fixtures for the website form: the form itself and its submission ledger. The ledger is append only for the
// runtime role (the platform role sweeps it); the form is changed by the agency but never deleted (it turns off).
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

/** An organization has one form, and every fixture may run in one organization: reuse it when it is there. */
export const aWebsiteForm = async (tx: OrgTx) =>
  (await tx.websiteForm.findFirst()) ?? (await tx.websiteForm.create({ data: { keySecret: "AbCdEfGh01234567" } }));

export const fixtures: OrgTableFixtures = {
  website_form: { create: aWebsiteForm, undeletable: true },
  website_form_submission: {
    create: async (tx) =>
      tx.websiteFormSubmission.create({
        data: { formId: (await aWebsiteForm(tx)).id, submissionId: randomUUID(), outcome: "new_lead" },
      }),
    appendOnly: true,
  },
};

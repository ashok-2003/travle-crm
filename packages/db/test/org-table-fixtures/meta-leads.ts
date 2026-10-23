// Isolation fixtures for the meta-leads module: a Page, a form, a question and a ledger row. The runtime role deletes
// questions (a form's match is replaced); a Page, a form and a ledger row stay (disconnecting keeps them, and a ledger row
// is what stops an erased Meta lead coming back). The Page route is not here: it has no row-level security
// (unscopedScheduleTables in org-table-fixtures.ts).
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aPage = (tx: OrgTx) =>
  tx.metaPage.create({
    data: {
      pageId: randomUUID().replaceAll("-", ""),
      pageName: "Isolation",
      metaUserId: "isolation-user",
      connectedBy: "0199e7a0-0000-7000-8000-0000000000b1",
    },
  });

const aForm = async (tx: OrgTx) =>
  tx.metaForm.create({
    data: { metaPageId: (await aPage(tx)).id, formId: randomUUID().replaceAll("-", ""), formName: "Isolation form" },
  });

export const fixtures: OrgTableFixtures = {
  meta_page: { create: aPage, undeletable: true },
  meta_form: { create: aForm, undeletable: true },
  meta_form_question: {
    create: async (tx) =>
      tx.metaFormQuestion.create({
        data: {
          formRowId: (await aForm(tx)).id,
          questionKey: "full_name",
          questionType: "full_name",
          label: "Full name",
        },
      }),
  },
  meta_lead: {
    create: (tx) =>
      tx.metaLead.create({
        data: { metaLeadId: randomUUID().replaceAll("-", ""), formId: "isolation-form", status: "pending" },
      }),
    undeletable: true,
  },
};

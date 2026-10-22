// Who a website lead goes to: the agency Owner while automatic assignment is off (a returning customer's too), and the
// assignment rules' choice once it is on (W7).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { receiveWebsiteEnquiry, type WebsiteEnquiryContext } from "../../src/crm/website-enquiry.js";
import { anAgency, anOpenForm, createTestForms, testNow, type TestForms } from "../website-forms/support.js";
import { aLead, aPerson, freshPhone } from "./support/records.js";

const flags = vi.hoisted(() => ({ marketingConsent: false, automaticAssignment: false }));
vi.mock("@travel-crm/contracts/features", () => ({ features: flags }));

describe("who a website lead goes to", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  async function returningCustomer() {
    const organizationId = await anAgency(test);
    const { form } = await anOpenForm(test, organizationId);
    const owner = randomUUID();
    const salesperson = randomUUID();
    const phone = freshPhone();
    await test.db.forOrg(organizationId, async (tx) =>
      aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id, ownerUserId: salesperson, stage: "won" }),
    );
    const context: WebsiteEnquiryContext = {
      organizationId,
      ownerUserId: owner,
      workers: new Set([owner, salesperson]),
      form,
      agencyName: "Asha Travels",
      via: "hosted",
      embeddedOn: null,
      now: testNow,
    };
    await test.db.forOrg(organizationId, (tx) =>
      receiveWebsiteEnquiry(tx, context, {
        submissionId: randomUUID(),
        openedToken: "t",
        via: "hosted",
        homepage: "",
        answers: { name: "Visitor", phone },
      }),
    );
    const lead = await test.db.forOrg(organizationId, (tx) => tx.lead.findFirstOrThrow({ orderBy: { id: "desc" } }));
    return { lead, owner, salesperson };
  }

  it("with the switch off, a returning customer's lead goes to the Owner, not the previous owner", async () => {
    flags.automaticAssignment = false;
    const { lead, owner } = await returningCustomer();
    expect(lead.returning).toBe(true);
    expect(lead.ownerUserId).toBe(owner);
  });

  it("with the switch on, a returning customer's lead goes to the previous owner", async () => {
    flags.automaticAssignment = true;
    try {
      const { lead, salesperson } = await returningCustomer();
      expect(lead.ownerUserId).toBe(salesperson);
    } finally {
      flags.automaticAssignment = false;
    }
  });
});

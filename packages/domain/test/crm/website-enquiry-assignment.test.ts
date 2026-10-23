// Who a website lead goes to (W7, release 4): a returning customer to the owner of their earlier lead, anyone else by
// the agency's rules and mode, the Owner while it keeps the default.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { receiveWebsiteEnquiry, type WebsiteEnquiryContext } from "../../src/crm/website-enquiry.js";
import { anAgency, anOpenForm, createTestForms, testNow, type TestForms } from "../website-forms/support.js";
import { aLead, aPerson, freshPhone } from "./support/records.js";

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

  it("a returning customer's lead goes to the previous owner", async () => {
    const { lead, salesperson } = await returningCustomer();
    expect(lead.returning).toBe(true);
    expect(lead.ownerUserId).toBe(salesperson);
  });

  it("a new customer's lead goes by the agency's mode: the Owner while it keeps the default", async () => {
    const organizationId = await anAgency(test);
    const { form } = await anOpenForm(test, organizationId);
    const owner = randomUUID();
    const context: WebsiteEnquiryContext = {
      organizationId,
      ownerUserId: owner,
      workers: new Set([owner, randomUUID()]),
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
        answers: { name: "Visitor", phone: freshPhone() },
      }),
    );
    const lead = await test.db.forOrg(organizationId, (tx) => tx.lead.findFirstOrThrow({ orderBy: { id: "desc" } }));
    expect(lead.ownerUserId).toBe(owner);
  });
});

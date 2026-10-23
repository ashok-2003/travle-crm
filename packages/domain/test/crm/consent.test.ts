// The consent ledger: a tick stores the exact words and version, no tick records nothing, staff withdrawal makes the latest
// row decide, a later tick grants again, and the audit says that consent changed, never the words.
import { randomUUID } from "node:crypto";
import { OFFERS_WORDING_VERSION, offersWording } from "@travel-crm/contracts/website-forms";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { consentStateOf, recordConsent, withdrawConsent } from "../../src/crm/consent.js";
import { receiveWebsiteEnquiry, type WebsiteEnquiryContext } from "../../src/crm/website-enquiry.js";
import { publicActor } from "../../src/kernel/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { anAgency, anOpenForm, createTestForms, testNow, type TestForms } from "../website-forms/support.js";
import { aPerson, freshPhone } from "./support/records.js";

vi.mock("@travel-crm/contracts/features", () => ({ features: { marketingConsent: true } }));

describe("consent", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  async function setup() {
    const organizationId = await anAgency(test);
    const { form } = await anOpenForm(test, organizationId, { offersTickbox: true });
    const owner = randomUUID();
    const context: WebsiteEnquiryContext = {
      organizationId,
      ownerUserId: owner,
      workers: new Set([owner]),
      form,
      agencyName: "Asha Travels",
      via: "hosted",
      embeddedOn: null,
      now: testNow,
    };
    const staff = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const send = (phone: string, offers?: boolean, now = testNow) =>
      inOrg((tx) =>
        receiveWebsiteEnquiry(
          tx,
          { ...context, now },
          {
            submissionId: randomUUID(),
            openedToken: "t",
            via: "hosted",
            homepage: "",
            answers: { name: "Visitor", phone, ...(offers === undefined ? {} : { offers }) },
          },
        ),
      );
    const personOf = (phone: string) => inOrg((tx) => tx.person.findFirstOrThrow({ where: { phoneE164: phone } }));
    return { organizationId, form, staff, inOrg, send, personOf };
  }

  it("the tick stores the exact words and version", async () => {
    const { send, personOf, inOrg, form } = await setup();
    const phone = freshPhone();
    await send(phone, true);
    const person = await personOf(phone);
    const rows = await inOrg((tx) => tx.personConsent.findMany({ where: { personId: person.id } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      purpose: "marketing",
      action: "granted",
      wording: offersWording("Asha Travels"),
      wordingVersion: OFFERS_WORDING_VERSION,
      source: "web_form",
      sourceFormId: form.id,
      recordedBy: null,
    });
    expect(await inOrg((tx) => consentStateOf(tx, person.id))).toEqual({
      state: "granted",
      at: testNow,
      fromForm: true,
    });
  });

  it("no tick records nothing and never withdraws", async () => {
    const { send, personOf, inOrg } = await setup();
    const phone = freshPhone();
    await send(phone, false);
    const person = await personOf(phone);
    expect(await inOrg((tx) => tx.personConsent.count())).toBe(0);
    await send(phone, true);
    await send(phone);
    await send(phone, false);
    expect(await inOrg((tx) => tx.personConsent.count({ where: { personId: person.id } }))).toBe(1);
    expect((await inOrg((tx) => consentStateOf(tx, person.id))).state).toBe("granted");
  });

  it("staff withdrawal makes the latest row decide, and a later tick grants again", async () => {
    const { send, personOf, inOrg, staff } = await setup();
    const phone = freshPhone();
    await send(phone, true);
    const person = await personOf(phone);
    const later = (minutes: number) => new Date(testNow.getTime() + minutes * 60_000);
    await inOrg((tx) => withdrawConsent(tx, staff, { personId: person.id, now: later(10) }));
    expect(await inOrg((tx) => consentStateOf(tx, person.id))).toEqual({
      state: "withdrawn",
      at: later(10),
      fromForm: false,
    });
    await send(phone, true, later(20));
    expect(await inOrg((tx) => consentStateOf(tx, person.id))).toMatchObject({ state: "granted", fromForm: true });
    expect(await inOrg((tx) => tx.personConsent.count({ where: { personId: person.id } }))).toBe(3);
  });

  it("withdrawing for a person who never agreed records nothing", async () => {
    const { inOrg, staff } = await setup();
    const person = await inOrg((tx) => aPerson(tx));
    await inOrg((tx) => withdrawConsent(tx, staff, { personId: person.id, now: testNow }));
    expect(await inOrg((tx) => tx.personConsent.count())).toBe(0);
    expect(await inOrg((tx) => consentStateOf(tx, person.id))).toEqual({ state: null, at: null, fromForm: false });
  });

  it("the audit has no wording", async () => {
    const { send, personOf, inOrg, staff } = await setup();
    const phone = freshPhone();
    await send(phone, true);
    const person = await personOf(phone);
    await inOrg((tx) => withdrawConsent(tx, staff, { personId: person.id, now: testNow }));
    const entries = await inOrg((tx) =>
      tx.auditEntry.findMany({ where: { action: { startsWith: "person.consent" } } }),
    );
    expect(entries.map((entry) => entry.action).sort()).toEqual([
      "person.consent-recorded",
      "person.consent-withdrawn",
    ]);
    expect(entries.map((entry) => entry.source).sort()).toEqual(["public", "web"]);
    expect(JSON.stringify(entries)).not.toContain("travel offers");
  });

  it("recordConsent can be called on its own for a person", async () => {
    const { inOrg, organizationId, form } = await setup();
    const person = await inOrg((tx) => aPerson(tx));
    await inOrg((tx) =>
      recordConsent(tx, publicActor(organizationId), {
        personId: person.id,
        wording: "Words",
        wordingVersion: 1,
        formId: form.id,
        now: testNow,
      }),
    );
    expect((await inOrg((tx) => consentStateOf(tx, person.id))).state).toBe("granted");
  });
});

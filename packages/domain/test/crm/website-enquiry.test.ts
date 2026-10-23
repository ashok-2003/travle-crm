// A website submission becomes a lead (W12-W24): one save path as an unverified enquiry by the public actor, the same
// answer for every outcome, blocked and over-limit enquiries saved nowhere, and a repeated submission id saving nothing.
import { randomUUID } from "node:crypto";
import type { WebsiteEnquiryInput } from "@travel-crm/contracts/website-forms";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addBlockedContact } from "../../src/crm/index.js";
import { answerOf, receiveWebsiteEnquiry, type WebsiteEnquiryContext } from "../../src/crm/website-enquiry.js";
import { findSubmission } from "../../src/website-forms/index.js";
import { anAgency, anOpenForm, createTestForms, testNow, type TestForms } from "../website-forms/support.js";
import { aLead, aPerson, freshPhone } from "./support/records.js";

vi.mock("@travel-crm/contracts/features", () => ({
  features: { marketingConsent: false, automaticAssignment: false },
}));

describe("receiving a website enquiry", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  async function setup(settings: Parameters<typeof anOpenForm>[2] = {}) {
    const organizationId = await anAgency(test);
    const { form } = await anOpenForm(test, organizationId, settings);
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
    const send = (
      answers: Partial<WebsiteEnquiryInput["answers"]> = {},
      extra: Partial<WebsiteEnquiryInput> = {},
      ctx = context,
    ) =>
      test.db.forOrg(organizationId, (tx) =>
        receiveWebsiteEnquiry(tx, ctx, {
          submissionId: randomUUID(),
          openedToken: "t",
          via: "hosted",
          homepage: "",
          answers: { name: "Visitor", phone: freshPhone(), ...answers },
          ...extra,
        }),
      );
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    return { organizationId, form, owner, context, send, inOrg };
  }

  it("a new person gets a New lead from the website form, dated now, owned by the Owner", async () => {
    const { send, inOrg, owner } = await setup();
    expect(await send({ name: "Meera", phone: "+919811100001", message: "Goa in December" })).toBe("new_lead");
    const lead = await inOrg((tx) => tx.lead.findFirstOrThrow({ include: { person: true } }));
    expect(lead).toMatchObject({
      source: "web_form",
      sourceDetail: "Hosted link",
      stage: "new",
      ownerUserId: owner,
      createdBy: null,
    });
    expect(lead.person.name).toBe("Meera");
    expect(lead.createdAt).toEqual(testNow);
    expect((await inOrg((tx) => tx.leadNote.findMany()))[0]?.body).toBe("Goa in December");
  });

  it("a person with an open lead gets a repeat enquiry and the lead's owner the usual notice", async () => {
    const { send, inOrg } = await setup();
    const holder = randomUUID();
    const phone = freshPhone();
    const lead = await inOrg(async (tx) =>
      aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id, ownerUserId: holder }),
    );
    expect(await send({ phone })).toBe("repeat_enquiry");
    expect(await inOrg((tx) => tx.leadEnquiry.count({ where: { leadId: lead.id } }))).toBe(1);
    expect(
      await inOrg((tx) => tx.notification.count({ where: { kind: "lead.repeat-enquiry", recipientUserId: holder } })),
    ).toBe(1);
  });

  it("a known person with only closed leads gets a Returning lead", async () => {
    const { send, inOrg } = await setup();
    const phone = freshPhone();
    await inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id, stage: "won" }));
    expect(await send({ phone })).toBe("new_lead");
    expect(await inOrg((tx) => tx.lead.count({ where: { returning: true } }))).toBe(1);
  });

  it("a blocked phone or email saves nothing and records blocked", async () => {
    const { send, inOrg, organizationId } = await setup();
    const blockedPhone = freshPhone();
    await inOrg((tx) =>
      addBlockedContact(
        tx,
        { organizationId, userId: randomUUID(), source: "web", impersonatedBy: null },
        { kind: "phone", value: blockedPhone },
      ),
    );
    await inOrg((tx) =>
      addBlockedContact(
        tx,
        { organizationId, userId: randomUUID(), source: "web", impersonatedBy: null },
        { kind: "email", value: "bad@example.test" },
      ),
    );
    expect(await send({ phone: blockedPhone })).toBe("blocked");
    expect(await send({ email: "bad@example.test" })).toBe("blocked");
    expect(await inOrg((tx) => tx.lead.count())).toBe(0);
    expect(await inOrg((tx) => tx.websiteFormSubmission.count({ where: { outcome: "blocked" } }))).toBe(2);
  });

  it("a fourth enquiry in 24 hours saves nothing and records duplicate", async () => {
    const { send, inOrg } = await setup();
    const phone = freshPhone();
    expect(await send({ phone })).toBe("new_lead");
    expect(await send({ phone })).toBe("repeat_enquiry");
    expect(await send({ phone })).toBe("repeat_enquiry");
    expect(await send({ phone })).toBe("duplicate");
    expect(await inOrg((tx) => tx.leadEnquiry.count())).toBe(2);
    expect(await inOrg((tx) => tx.websiteFormSubmission.count({ where: { outcome: "duplicate" } }))).toBe(1);
  });

  it("three a day holds under parallel sends with different ids: two at once on a person with two leave one saved", async () => {
    const { send, inOrg } = await setup();
    // Racing is by chance, so many rounds, each on its own person.
    for (let round = 0; round < 12; round += 1) {
      const phone = freshPhone();
      expect(await send({ phone })).toBe("new_lead");
      expect(await send({ phone })).toBe("repeat_enquiry");
      const outcomes = await Promise.all([send({ phone }), send({ phone })]);
      expect(outcomes.sort(), `round ${String(round)}`).toEqual(["duplicate", "repeat_enquiry"]);
    }
    expect(await inOrg((tx) => tx.leadEnquiry.count())).toBe(24);
  });

  it("a repeated submissionId saves nothing and answers as the first", async () => {
    const { send, inOrg } = await setup();
    const submissionId = randomUUID();
    const phone = freshPhone();
    expect(await send({ phone }, { submissionId })).toBe("new_lead");
    expect(await send({ phone }, { submissionId })).toBe("new_lead");
    expect(await inOrg((tx) => tx.lead.count())).toBe(1);
    expect(await inOrg((tx) => tx.leadEnquiry.count())).toBe(0);
  });

  it("two racing submissions with one id make one lead", async () => {
    const { send, inOrg } = await setup();
    const submissionId = randomUUID();
    const phone = freshPhone();
    const outcomes = await Promise.all([send({ phone }, { submissionId }), send({ phone }, { submissionId })]);
    expect(outcomes).toEqual(["new_lead", "new_lead"]);
    expect(await inOrg((tx) => tx.lead.count())).toBe(1);
  });

  it("a destination chosen by id is on the lead; a typed one that matches a live name ignoring case and spaces is that destination; any other sits in the note", async () => {
    const { send, inOrg } = await setup();
    const spiti = await inOrg((tx) => tx.destination.create({ data: { name: "Spiti Valley" } }));
    const goa = await inOrg((tx) => tx.destination.create({ data: { name: "Goa" } }));
    const byId = freshPhone();
    const typed = freshPhone();
    const unknown = freshPhone();
    await send({ phone: byId, destination: { kind: "existing", destinationId: spiti.id } });
    await send({ phone: typed, destination: { kind: "typed", text: "  goA " } });
    await send({ phone: unknown, destination: { kind: "typed", text: "Narnia" }, message: "Hi" });
    const leadOf = (phone: string) =>
      inOrg((tx) => tx.lead.findFirstOrThrow({ where: { person: { phoneE164: phone } }, include: { notes: true } }));
    expect((await leadOf(byId)).destinationId).toBe(spiti.id);
    expect((await leadOf(typed)).destinationId).toBe(goa.id);
    const other = await leadOf(unknown);
    expect(other.destinationId).toBeNull();
    expect(other.notes.map((note) => note.body)).toEqual(["Hi\nDestination asked for: Narnia"]);
    expect(await inOrg((tx) => tx.destination.count())).toBe(2);
  });

  it("a typed destination is compared literally: % and _ match no destination and sit in the note", async () => {
    const { send, inOrg } = await setup();
    await inOrg((tx) =>
      tx.destination.createMany({ data: [{ name: "Goa" }, { name: "G_a" }, { name: "100% Kerala" }] }),
    );
    const exact = freshPhone();
    for (const [phone, text] of [
      [freshPhone(), "%"],
      [freshPhone(), "G%"],
      [freshPhone(), "Go_"],
      [exact, "100% kerala"],
    ] as const) {
      await send({ phone, destination: { kind: "typed", text } });
    }
    const destinationOf = async (phone: string) =>
      (
        await inOrg((tx) =>
          tx.lead.findFirstOrThrow({ where: { person: { phoneE164: phone } }, include: { destination: true } }),
        )
      ).destination?.name ?? null;
    expect(await destinationOf(exact)).toBe("100% Kerala");
    const noted = (await inOrg((tx) => tx.leadNote.findMany())).map((note) => note.body).sort();
    expect(noted).toEqual(["Destination asked for: %", "Destination asked for: G%", "Destination asked for: Go_"]);
    expect(await inOrg((tx) => tx.destination.count())).toBe(3);
  });

  it("in typed mode the text goes the same way: a live name is the destination, anything else the note, and none is made", async () => {
    const { send, inOrg } = await setup({ destinationInput: "typed" });
    const goa = await inOrg((tx) => tx.destination.create({ data: { name: "Goa" } }));
    const matched = freshPhone();
    const unmatched = freshPhone();
    await send({ phone: matched, destination: { kind: "typed", text: " goa" } });
    await send({ phone: unmatched, destination: { kind: "typed", text: "Spiti" } });
    const leadOf = (phone: string) =>
      inOrg((tx) => tx.lead.findFirstOrThrow({ where: { person: { phoneE164: phone } }, include: { notes: true } }));
    expect((await leadOf(matched)).destinationId).toBe(goa.id);
    const other = await leadOf(unmatched);
    expect(other.destinationId).toBeNull();
    expect(other.notes.map((note) => note.body)).toEqual(["Destination asked for: Spiti"]);
    expect(await inOrg((tx) => tx.destination.count())).toBe(1);
  });

  it("a required typed destination left empty is refused", async () => {
    const { send, inOrg } = await setup({ destinationInput: "typed", destinationMode: "required" });
    await expect(send({})).rejects.toMatchObject({ reason: "FORM_ANSWER_REQUIRED" });
    expect(await inOrg((tx) => tx.lead.count())).toBe(0);
  });

  it("the note holds the message, then the destination and email lines", async () => {
    const { send, inOrg } = await setup();
    const phone = freshPhone();
    await inOrg((tx) => aPerson(tx, { phoneE164: phone, email: "old@example.test" }));
    await send({ phone, message: "Hello", destination: { kind: "typed", text: "Nowhere" }, email: "new@example.test" });
    const note = (await inOrg((tx) => tx.leadNote.findMany()))[0];
    expect(note?.body).toBe("Hello\nDestination asked for: Nowhere\nEmail given: new@example.test");
  });

  it("names the embedding site's host, or Embedded when it is not one", async () => {
    const { send, inOrg, context } = await setup();
    const embedded = { ...context, via: "embedded" as const };
    await send({}, {}, { ...embedded, embeddedOn: "SharmaTravels.in" });
    await send({}, {}, { ...embedded, embeddedOn: "not a host!" });
    const details = (await inOrg((tx) => tx.lead.findMany({ orderBy: { id: "asc" } }))).map(
      (lead) => lead.sourceDetail,
    );
    expect(details).toEqual(["sharmatravels.in", "Embedded"]);
  });

  it("the audit entries carry source public and the form's id as the detail (W24)", async () => {
    const { send, inOrg, form } = await setup();
    const phone = freshPhone();
    await send({ phone });
    await send({ phone });
    const entries = await inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityType: { in: ["lead", "person"] } }, orderBy: { id: "asc" } }),
    );
    expect(entries.map((entry) => entry.action).sort()).toEqual(["lead.added", "lead.repeat-enquiry", "person.added"]);
    expect(entries.every((entry) => entry.source === "public")).toBe(true);
    for (const entry of entries) expect(entry.after, entry.action).toMatchObject({ formId: form.id });
  });

  it("the owner is told once per new lead", async () => {
    const { send, inOrg, owner } = await setup();
    await send();
    expect(
      await inOrg((tx) => tx.notification.count({ where: { recipientUserId: owner, kind: "lead.assigned" } })),
    ).toBe(1);
  });

  it("records the ledger row with ids only", async () => {
    const { send, inOrg } = await setup();
    await send();
    const row = await inOrg((tx) => tx.websiteFormSubmission.findFirstOrThrow());
    expect(row).toMatchObject({ outcome: "new_lead" });
    expect(row.leadId).not.toBeNull();
    expect(row.personId).not.toBeNull();
  });

  it("offers in any value, true or false, is VALIDATION with the switch off", async () => {
    const { send } = await setup({ offersTickbox: true });
    for (const offers of [true, false]) {
      await expect(send({ offers })).rejects.toMatchObject({
        code: "VALIDATION",
        reason: "FORM_OFFERS_NOT_AVAILABLE",
      });
    }
    expect(await send({})).toBe("new_lead");
  });

  it("refuses a submission from the embed with embedding off, and takes the hosted one", async () => {
    const { send, inOrg, context } = await setup({ allowEmbed: false });
    await expect(
      send({}, { via: "embedded" }, { ...context, via: "embedded", embeddedOn: "asha.example" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "FORM_UNAVAILABLE",
    });
    expect(await inOrg((tx) => tx.lead.count())).toBe(0);
    expect(await send({}, { via: "hosted" })).toBe("new_lead");
  });

  it("answers every non-refusal outcome with the same status and the same body", () => {
    const answers = (["new_lead", "repeat_enquiry", "blocked", "duplicate", "spam"] as const).map(answerOf);
    for (const answer of answers) expect(answer).toEqual({ status: 201, body: { ok: true } });
  });

  it("does not find a spam row for an unknown id", async () => {
    const { organizationId } = await setup();
    expect(await test.db.forOrg(organizationId, (tx) => findSubmission(tx, randomUUID()))).toBeNull();
  });
});

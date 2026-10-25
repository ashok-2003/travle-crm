// A WhatsApp message becomes a lead, joins an open lead's chat or waits for Start a new lead (I2, Q2): the one save path,
// no repeat enquiry per message, one timeline entry when the thread restarts, a blocked contact left alone.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addBlockedContact,
  receiveWhatsAppContact,
  recordWhatsAppFirstReply,
  startLeadFromChat,
} from "../../src/crm/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { anAgency, createTestForms, testNow, type TestForms } from "../website-forms/support.js";
import { aLead, aPerson, freshPhone } from "./support/records.js";

describe("receiving a WhatsApp contact", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  async function setup() {
    const organizationId = await anAgency(test);
    const owner = randomUUID();
    const actor = systemActor(organizationId);
    const context = { ownerUserId: owner, workers: new Set([owner]) };
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const receive = (phone: string, extra: { profileName?: string | null; previousInboundAt?: Date | null } = {}) =>
      inOrg((tx) =>
        receiveWhatsAppContact(
          tx,
          actor,
          {
            phoneE164: phone,
            profileName: "Priya",
            firstText: "Goa in December?",
            occurredAt: testNow,
            previousInboundAt: null,
            ...extra,
          },
          context,
          testNow,
        ),
      );
    return { organizationId, owner, actor, context, inOrg, receive };
  }

  it("makes a lead from a number we don't know: source WhatsApp, named by the profile, dated by the message", async () => {
    const { receive, inOrg, owner } = await setup();
    const phone = freshPhone();
    const outcome = await receive(phone);
    expect(outcome).toMatchObject({ kind: "lead_created", ownerUserId: owner });
    const lead = await inOrg((tx) => tx.lead.findFirstOrThrow({ include: { person: true } }));
    expect(lead).toMatchObject({ source: "whatsapp", sourceDetail: "WhatsApp chat", stage: "new" });
    expect(lead.person).toMatchObject({ name: "Priya", phoneE164: phone });
    expect(lead.createdAt).toEqual(testNow);
    expect((await inOrg((tx) => tx.leadNote.findMany()))[0]?.body).toBe("Goa in December?");
  });

  it("names a number with no profile name after the number, for staff to correct", async () => {
    const { receive, inOrg } = await setup();
    await receive("+919876500001", { profileName: null });
    expect((await inOrg((tx) => tx.person.findFirstOrThrow())).name).toBe("WhatsApp +91 98765 00001");
  });

  it("adds nothing to a person with an open lead but a timeline entry when the thread restarts", async () => {
    const { receive, inOrg } = await setup();
    const phone = freshPhone();
    const lead = await inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id }));
    expect(await receive(phone, { previousInboundAt: null })).toMatchObject({
      kind: "on_open_lead",
      leadId: lead.id,
      threadRestarted: true,
    });
    const quiet = new Date(testNow.getTime() - 60_000);
    expect(await receive(phone, { previousInboundAt: quiet })).toMatchObject({
      kind: "on_open_lead",
      threadRestarted: false,
    });
    expect(await inOrg((tx) => tx.leadEnquiry.count())).toBe(0);
    expect(await inOrg((tx) => tx.lead.count())).toBe(1);
    expect(
      await inOrg((tx) => tx.leadTimelineEntry.count({ where: { leadId: lead.id, kind: "whatsapp-contact" } })),
    ).toBe(1);
  });

  it("leaves a past customer for the Start a new lead button, which makes a Returning lead", async () => {
    const { receive, inOrg, actor, context } = await setup();
    const phone = freshPhone();
    const personId = await inOrg(async (tx) => {
      const person = await aPerson(tx, { phoneE164: phone });
      await aLead(tx, { personId: person.id, stage: "won" });
      return person.id;
    });
    expect(await receive(phone)).toEqual({ kind: "past_customer", personId });
    expect(await inOrg((tx) => tx.lead.count())).toBe(1);
    const { leadId } = await inOrg((tx) => startLeadFromChat(tx, actor, { personId }, context, testNow));
    expect(await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: leadId } }))).toMatchObject({
      returning: true,
      source: "whatsapp",
    });
    await expect(inOrg((tx) => startLeadFromChat(tx, actor, { personId }, context, testNow))).rejects.toMatchObject({
      reason: "OPEN_LEAD_EXISTS",
    });
  });

  it("does nothing for a blocked contact", async () => {
    const { receive, inOrg, actor } = await setup();
    const phone = freshPhone();
    await inOrg((tx) => addBlockedContact(tx, actor, { kind: "phone", value: phone }));
    expect(await receive(phone)).toEqual({ kind: "blocked", personId: null });
    expect(await inOrg((tx) => tx.person.count())).toBe(0);
  });

  it("a reply sets the newest open lead's first reply once", async () => {
    const { inOrg } = await setup();
    const { personId, leadId } = await inOrg(async (tx) => {
      const person = await aPerson(tx);
      return { personId: person.id, leadId: (await aLead(tx, { personId: person.id })).id };
    });
    const first = new Date(testNow.getTime() + 1000);
    await inOrg((tx) => recordWhatsAppFirstReply(tx, personId, first));
    await inOrg((tx) => recordWhatsAppFirstReply(tx, personId, new Date(first.getTime() + 5000)));
    expect((await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: leadId } }))).firstReplyAt).toEqual(first);
  });
});

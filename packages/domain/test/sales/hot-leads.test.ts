// What makes a lead hot: a quote opened again, or a buying word, each kept once as a signal; the owner's alert carries
// fixed words and never the customer's own; the hot list is the member's own leads, hottest first.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import { hotLeadsOf, customerWroteListener, leadHeatOf } from "../../src/sales/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead } from "../crm/support/records.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../inbox/support.js";

describe("hot leads", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("alerts the owner to a buying word with fixed words, keeps one signal, and lists the lead as hot", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const ownerUserId = randomUUID();
    const owner = memberWithStarterRole("org-owner", { organizationId, userId: ownerUserId });
    const customerNumber = freshPhone().replace("+", "");
    const secret = "Mera naam Rahul hai, mere paas 5 lakh hai, kitna price?";
    await deliver(test, fromCustomer(connection, { customerNumber, text: secret }));
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), ownerUserId, stage: "contacted" }),
    );
    const event: DomainEvent = {
      id: randomUUID(),
      organizationId,
      type: "whatsapp.text-received",
      payload: { conversationId: chat.id, messageId: message.id },
      occurredAt: testNow,
    };
    const context: ListenerContext = { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) };
    const listener = customerWroteListener();
    await listener.handle(event, context);
    await listener.handle(event, context);

    const notices = await inOrg((tx) => tx.notification.findMany({ where: { kind: "sales.hot-lead" } }));
    expect(notices).toHaveLength(1);
    expect(JSON.stringify(notices[0])).not.toContain("kitna");
    expect(JSON.stringify(notices[0])).not.toContain("Rahul");
    expect(await inOrg((tx) => tx.leadSignal.count({ where: { leadId: lead.id } }))).toBe(1);

    const hot = await inOrg((tx) => hotLeadsOf(tx, owner, { now: testNow }));
    expect(hot.map((row) => row.leadId)).toContain(lead.id);
    expect(hot.find((row) => row.leadId === lead.id)?.reasons).toEqual(["asked_price"]);
    expect((await inOrg((tx) => leadHeatOf(tx, owner, { now: testNow, leadId: lead.id }))).reasons).toEqual([
      "asked_price",
    ]);
  });

  it("ignores a message with no buying word", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const customerNumber = freshPhone().replace("+", "");
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Hello, is anyone there?" }));
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), ownerUserId: randomUUID() }),
    );
    await customerWroteListener().handle(
      {
        id: randomUUID(),
        organizationId,
        type: "whatsapp.text-received",
        payload: { conversationId: chat.id, messageId: message.id },
        occurredAt: testNow,
      },
      { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) },
    );
    expect(await inOrg((tx) => tx.leadSignal.count({ where: { leadId: lead.id } }))).toBe(0);
  });

  it("hears a buying word in an agency with no automation at all, and the automatic answers never run for it", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const ownerUserId = randomUUID();
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text: "Kitna price hai?" }),
    );
    const events = await inOrg(async (tx) => (await tx.outboxEvent.findMany()).map((event) => event.type));
    expect(events).toContain("whatsapp.text-received");
    expect(events).not.toContain("whatsapp.customer-wrote");
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const row = await inOrg((tx) => tx.outboxEvent.findFirstOrThrow({ where: { type: "whatsapp.text-received" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), ownerUserId, stage: "contacted" }),
    );
    await customerWroteListener().handle(
      { id: row.id, organizationId, type: row.type, payload: row.payload as never, occurredAt: testNow },
      { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) },
    );
    expect(await inOrg((tx) => tx.leadSignal.count({ where: { leadId: lead.id } }))).toBe(1);
    expect(await inOrg((tx) => tx.notification.count({ where: { kind: "sales.hot-lead" } }))).toBe(1);
  });
});

// Outside a chat, the number the customer last wrote to, else the main one (spec 2026-11-22-multi-number-whatsapp-design.md,
// sections 5 and 6, paths 12-13 and the automatic sends of 14-18): the lead's WhatsApp opens their chat on the number they
// last wrote to, Start a chat makes one on the main number for a customer who wrote to no live number, and an automatic
// message goes from the number they last wrote to, or not at all: never from a number whose template it lacks, and never
// moved to the main number while theirs is paused. Each rule is asked for two customers whose answers are different
// numbers, both before any send rewrites a number's row (a write moves Postgres's row order), so both meet the same pick
// of a lookup taking the first live number, and a path that used it is wrong for one of them.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrgTx } from "@travel-crm/db";
import { leadChatOf, queueTemplate, startChatForLead, type ReplyContext } from "../../src/inbox/index.js";
import { sendToLead } from "../../src/sales/index.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  aSecondNumber,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  sentFrom,
  testNow,
  type TestConnection,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;
const context: ReplyContext = { whatsappConfigured: true };
const at = (hours: number) => new Date(testNow.getTime() + hours * HOUR);

describe("a send outside a chat goes from the number the customer last wrote to, else the main one", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const inOrg = <T>(connection: TestConnection, work: (tx: OrgTx) => Promise<T>) =>
    test.db.forOrg(connection.organizationId, work);

  /** The customer writes to the number at the time; their chat on it. */
  async function writes(connection: TestConnection, phone: string, when: Date): Promise<string> {
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Goa?", ts: when.getTime() / 1000 }),
      when,
    );
    return inOrg(connection, async (tx) => {
      const chat = await tx.whatsappConversation.findFirstOrThrow({
        where: { connectionId: connection.connectionId, phoneE164: phone },
        select: { id: true },
      });
      return chat.id;
    });
  }

  const leadOf = (connection: TestConnection, phone: string) =>
    inOrg(connection, async (tx) => {
      const lead = await tx.lead.findFirstOrThrow({ where: { person: { phoneE164: phone } }, select: { id: true } });
      return lead.id;
    });

  const setStatus = (connection: TestConnection, status: string) =>
    inOrg(connection, (tx) =>
      tx.whatsappConnection.update({ where: { id: connection.connectionId }, data: { status } }),
    );

  const template = (connection: TestConnection) =>
    inOrg(connection, async (tx) => {
      const row = await tx.whatsappTemplate.create({
        data: {
          connectionId: connection.connectionId,
          name: "trip_update",
          language: "en",
          category: "utility",
          body: "Hello {{1}}, your trip is confirmed.",
          status: "approved",
        },
        select: { id: true },
      });
      return row.id;
    });

  /** Every message we wrote to the phone, on any number. */
  const outgoing = (connection: TestConnection, phone: string) =>
    inOrg(connection, (tx) =>
      tx.whatsappMessage.findMany({
        where: { direction: "out", conversation: { phoneE164: phone } },
        orderBy: { id: "asc" },
        select: { id: true, conversationId: true, templateId: true, kind: true },
      }),
    );

  /**
   * "Sales 1" (main) and "Sales 2", and two customers who wrote to both: `onSecond` last to Sales 2, `onMain` last to
   * Sales 1. We wrote last in the chat each did not write last in, so a send that followed us goes wrong too.
   */
  async function twoCustomers() {
    const main = await aConnectedAgency(test);
    await inOrg(main, (tx) =>
      tx.whatsappConnection.update({ where: { id: main.connectionId }, data: { label: "Sales 1" } }),
    );
    const second = await aSecondNumber(test, main, { label: "Sales 2" });
    const customer = async (first: TestConnection, last: TestConnection) => {
      const phone = freshPhone();
      const earlier = await writes(first, phone, at(-2));
      const chat = await writes(last, phone, at(-1));
      await inOrg(main, (tx) =>
        tx.whatsappConversation.update({ where: { id: earlier }, data: { lastMessageAt: testNow } }),
      );
      return { phone, chat, number: last, leadId: await leadOf(main, phone) };
    };
    const onSecond = await customer(main, second);
    const onMain = await customer(second, main);
    return { main, second, onSecond, onMain, customers: [onSecond, onMain] };
  }

  const autoSend = (connection: TestConnection, leadId: string, templateId: string, when: Date) =>
    inOrg(connection, (tx) =>
      sendToLead(
        tx,
        {
          organizationId: connection.organizationId,
          leadId,
          templateId,
          params: ["there"],
          sessionText: "Your trip is confirmed.",
          agreed: false,
          clientToken: randomUUID(),
        },
        when,
      ),
    );

  /** Start a chat for the lead, as the lead page's button does: the chat. */
  const start = async (connection: TestConnection, leadId: string) => {
    const member = memberOf(connection.organizationId);
    return (await inOrg(connection, (tx) => startChatForLead(tx, member, leadId))).conversationId;
  };

  /** The approved template staff send next in a started chat: the number its chat is on and the number it went from. */
  async function firstTemplate(connection: TestConnection, conversationId: string, templateId: string) {
    const sent = await inOrg(connection, (tx) =>
      queueTemplate(
        tx,
        memberOf(connection.organizationId),
        { conversationId, templateId, parameters: ["there"], agreed: true, clientToken: randomUUID() },
        context,
        testNow,
      ),
    );
    const message = await inOrg(connection, (tx) =>
      tx.whatsappMessage.findUniqueOrThrow({
        where: { id: sent.messageId },
        select: { conversationId: true, conversation: { select: { connectionId: true } } },
      }),
    );
    expect(message.conversationId).toBe(conversationId);
    return {
      on: message.conversation.connectionId,
      from: await sentFrom(test, connection.organizationId, sent.messageId),
    };
  }

  /** The only message to the phone: in the chat; the number it went from. */
  async function onlySend(connection: TestConnection, customer: { phone: string; chat: string }, when: Date) {
    const sent = await outgoing(connection, customer.phone);
    expect(sent).toMatchObject([{ conversationId: customer.chat }]);
    return sentFrom(test, connection.organizationId, sent[0]?.id ?? "", when);
  }

  it("opens the lead's chat on the number the customer last wrote to", async () => {
    const { main, customers } = await twoCustomers();
    const member = memberOf(main.organizationId);
    const opened = [];
    for (const { leadId } of customers) opened.push(await inOrg(main, (tx) => leadChatOf(tx, member, leadId)));
    expect(opened).toEqual(customers.map(({ chat }) => ({ conversationId: chat })));
  });

  it("opens an old chat on a disconnected number when the customer has no other, so it stays readable", async () => {
    const main = await aConnectedAgency(test);
    const old = await aSecondNumber(test, main);
    const phone = freshPhone();
    const oldChat = await writes(old, phone, at(-1));
    await setStatus(old, "disconnected");
    const member = memberOf(main.organizationId);
    const leadId = await leadOf(main, phone);
    expect(await inOrg(main, (tx) => leadChatOf(tx, member, leadId))).toEqual({ conversationId: oldChat });
    // Looking made no chat on the main number.
    expect(
      await inOrg(main, (tx) => tx.whatsappConversation.count({ where: { connectionId: main.connectionId } })),
    ).toBe(0);
  });

  it("starts a chat with a lead who never wrote on the main number", async () => {
    const { main, second, onSecond } = await twoCustomers();
    const templates = { main: await template(main), second: await template(second) };
    const silent = await inOrg(main, async (tx) => {
      const person = await aPerson(tx, { phoneE164: freshPhone() });
      return (await aLead(tx, { personId: person.id })).id;
    });
    const started = [await start(main, silent), await start(main, onSecond.leadId)];
    // A customer who wrote keeps the chat they wrote in.
    expect(started[1]).toBe(onSecond.chat);
    expect(await firstTemplate(main, started[0] ?? "", templates.main)).toEqual({
      on: main.connectionId,
      from: main.integratedNumber,
    });
    expect(await firstTemplate(main, started[1] ?? "", templates.second)).toEqual({
      on: second.connectionId,
      from: second.integratedNumber,
    });
  });

  it("starts a chat on the main number for a customer whose only number was disconnected", async () => {
    const old = await aConnectedAgency(test);
    const gonePhone = freshPhone();
    await writes(old, gonePhone, at(-1));
    const main = await aSecondNumber(test, old, { label: "Sales 1", main: true });
    const other = await aSecondNumber(test, old, { label: "Sales 2" });
    const otherPhone = freshPhone();
    const otherChat = await writes(other, otherPhone, at(-1));
    await setStatus(old, "disconnected");
    const templates = { main: await template(main), other: await template(other) };
    const leads = [await leadOf(main, gonePhone), await leadOf(main, otherPhone)];
    const started = [];
    for (const leadId of leads) started.push(await start(main, leadId));
    expect(started[1]).toBe(otherChat);
    expect(await firstTemplate(main, started[0] ?? "", templates.main)).toEqual({
      on: main.connectionId,
      from: main.integratedNumber,
    });
    expect(await firstTemplate(main, started[1] ?? "", templates.other)).toEqual({
      on: other.connectionId,
      from: other.integratedNumber,
    });
  });

  it("sends to a lead from the number they last wrote to, as words in the window and as a template outside", async () => {
    const { main, second, customers } = await twoCustomers();
    // The automation's template is chosen from the main number's; Sales 2 has its twin.
    const chosen = await template(main);
    const twin = await template(second);
    const kinds = [];
    for (const when of [testNow, at(30)]) {
      for (const { leadId } of customers) kinds.push((await autoSend(main, leadId, chosen, when)).kind);
    }
    expect(kinds).toEqual(["sent", "sent", "sent", "sent"]);
    for (const { phone, chat, number } of customers) {
      const sent = await outgoing(main, phone);
      expect(sent).toMatchObject([
        { conversationId: chat, kind: "text", templateId: null },
        { conversationId: chat, kind: "template", templateId: number === second ? twin : chosen },
      ]);
      expect(await sentFrom(test, main.organizationId, sent[0]?.id ?? "", testNow)).toBe(number.integratedNumber);
      expect(await sentFrom(test, main.organizationId, sent[1]?.id ?? "", at(30))).toBe(number.integratedNumber);
    }
  });

  it("skips an automatic message whose template isn't on the sending number, and sends nothing from another", async () => {
    const { main, onSecond, onMain } = await twoCustomers();
    const chosen = await template(main);
    expect(await autoSend(main, onSecond.leadId, chosen, at(30))).toEqual({
      kind: "never",
      reason: "TEMPLATE_NOT_ON_NUMBER",
    });
    expect((await autoSend(main, onMain.leadId, chosen, at(30))).kind).toBe("sent");
    expect(await outgoing(main, onSecond.phone)).toEqual([]);
    expect(await onlySend(main, onMain, at(30))).toBe(main.integratedNumber);
  });

  it("waits while the customer's number is paused, and never moves to the main number", async () => {
    const { main, second, onSecond, onMain } = await twoCustomers();
    const chosen = await template(main);
    await template(second);
    await setStatus(second, "paused");
    expect(await autoSend(main, onSecond.leadId, chosen, testNow)).toEqual({ kind: "later", reason: "paused" });
    expect((await autoSend(main, onMain.leadId, chosen, testNow)).kind).toBe("sent");
    const member = memberOf(main.organizationId);
    await expect(inOrg(main, (tx) => startChatForLead(tx, member, onSecond.leadId))).rejects.toMatchObject({
      reason: "WHATSAPP_PAUSED",
    });
    expect(await outgoing(main, onSecond.phone)).toEqual([]);
    expect(await onlySend(main, onMain, testNow)).toBe(main.integratedNumber);
    // Their chat still opens from the lead.
    expect(await inOrg(main, (tx) => leadChatOf(tx, member, onSecond.leadId))).toEqual({
      conversationId: onSecond.chat,
    });
  });
});

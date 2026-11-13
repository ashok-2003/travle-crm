// Erasing a customer takes everything the sales inbox keeps about them (sales inbox spec 6, review finding I1): the words of
// their scheduled messages, the tags on their chat, every member's read mark, the notes on their lead, the automatic answers
// written to them, and the notices that named them. Another customer's chat is left as it was.
import { randomUUID } from "node:crypto";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  addNote,
  answerAutomatically,
  createTag,
  createKeywordReply,
  markConversationRead,
  scheduleMessage,
  setConversationTags,
} from "../../src/inbox/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import { systemActor } from "../../src/kernel/index.js";
import { aLead } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;

describe("erasing a customer who is in the sales inbox", () => {
  let test: TestInbox;
  let platformDb: PlatformDatabase;
  beforeAll(() => {
    test = createTestInbox();
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  it("erases their scheduled words, tags, read marks, notes, automatic answers and the notices that name them", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const member = memberOf(organizationId);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    // Two customers write; the first is erased, the second is the control.
    const first = freshPhone();
    const second = freshPhone();
    for (const phone of [first, second]) {
      await deliver(
        test,
        fromCustomer(connection, { customerNumber: phone.replace("+", ""), customerName: "Neha Joshi", text: "Hi" }),
      );
    }
    const chats = await inOrg((tx) => tx.whatsappConversation.findMany({ orderBy: { phoneE164: "asc" } }));
    const mine = chats.find((chat) => chat.phoneE164 === first);
    const other = chats.find((chat) => chat.phoneE164 === second);
    const personId = mine?.personId;
    if (mine === undefined || personId == null || other === undefined) {
      throw new Error("Both customers should have a chat and a person");
    }

    await inOrg(async (tx) => {
      await createKeywordReply(tx, member, { keyword: "price", reply: "Packages start at 30,000" });
      const tag = await createTag(tx, member, { name: "Hot" });
      for (const chat of [mine, other]) {
        await setConversationTags(tx, member, { conversationId: chat.id, tagIds: [tag.id] });
        await markConversationRead(tx, member, chat.id, testNow);
        await scheduleMessage(
          tx,
          member,
          {
            conversationId: chat.id,
            body: "Neha, your quote is attached",
            sendAt: new Date(testNow.getTime() + 5 * HOUR).toISOString(),
          },
          testNow,
        );
        await addNote(
          tx,
          member,
          { conversationId: chat.id, body: `Neha wants a Spiti trip (${chat.id})`, mentions: [] },
          new Map(),
          "Meera",
        );
        await tx.notification.create({
          data: {
            recipientUserId: member.userId,
            kind: "inbox.mentioned",
            title: "Meera mentioned you",
            body: "In the chat with Neha Joshi.",
            link: `/inbox/${chat.id}`,
            sourceEventId: randomUUID(),
          },
        });
      }
    });
    const trace = (conversationId: string) =>
      inOrg((tx) =>
        tx.aiTurnTrace.create({
          data: {
            id: randomUUID(),
            conversationId,
            startedAt: testNow,
            kind: "reply",
            outcome: "replied",
            inputTokens: 1,
            outputTokens: 1,
            durationMs: 1,
            promptVersions: {},
            fileKey: `organizations/${organizationId}/ai-traces/2026-10-23/${randomUUID()}.json.gz`,
            expiresAt: new Date("2100-01-01T00:00:00Z"), // far off: no other file's sweep may take it first
          },
        }),
      );
    await trace(mine.id);
    const otherTrace = await trace(other.id);
    await inOrg(async (tx) => {
      const template = await tx.whatsappTemplate.create({
        data: {
          connectionId: connection.connectionId,
          name: "offer",
          language: "en",
          category: "marketing",
          body: "Hi",
          status: "approved",
        },
      });
      const broadcast = await tx.whatsappBroadcast.create({
        data: { requestId: randomUUID(), templateId: template.id, createdBy: member.userId },
      });
      await tx.whatsappBroadcastRecipient.createMany({
        data: [mine, other].map((chat) => ({ broadcastId: broadcast.id, conversationId: chat.id })),
      });
    });
    const message = await inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { conversationId: mine.id, direction: "in" } }),
    );
    await inOrg((tx) =>
      answerAutomatically(
        tx,
        {
          conversationId: mine.id,
          messageId: message.id,
          eventId: randomUUID(),
          firstEver: false,
          timeZone: "Asia/Kolkata",
        },
        testNow,
      ),
    );

    const erased = await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(organizationId), { organizationId, personId }, testNow),
    );
    expect(erased).toMatchObject({ aiTraces: 1 });
    expect(
      (await inOrg((tx) => tx.aiTurnTrace.findUniqueOrThrow({ where: { id: otherTrace.id } }))).expiresAt.getTime(),
    ).toBeGreaterThan(testNow.getTime());

    const kept = (chatId: string) =>
      inOrg(async (tx) => ({
        scheduled: await tx.scheduledMessage.count({ where: { conversationId: chatId } }),
        broadcasts: await tx.whatsappBroadcastRecipient.count({ where: { conversationId: chatId } }),
        tags: await tx.conversationTag.count({ where: { conversationId: chatId } }),
        reads: await tx.conversationRead.count({ where: { conversationId: chatId } }),
        notices: await tx.notification.count({ where: { link: { contains: chatId } } }),
        words: await tx.whatsappMessage.count({ where: { conversationId: chatId, body: { not: null } } }),
      }));
    expect(await kept(mine.id)).toEqual({ scheduled: 0, broadcasts: 0, tags: 0, reads: 0, notices: 0, words: 0 });
    expect(await kept(other.id)).toMatchObject({ scheduled: 1, broadcasts: 1, tags: 1, reads: 1, notices: 1 });
    const notes = (await inOrg((tx) => tx.leadNote.findMany())).map((note) => note.body);
    expect(notes).not.toContain(`Neha wants a Spiti trip (${mine.id})`);
    expect(notes).toContain(`Neha wants a Spiti trip (${other.id})`);
  });
  const recordUnmatchedNotice = (tx: Parameters<Parameters<TestInbox["db"]["forOrg"]>[1]>[0], chatId: string) =>
    tx.notification.create({
      data: {
        recipientUserId: randomUUID(),
        kind: "payment.proof-to-match",
        title: "Neha sent a payment screenshot",
        body: "Check it.",
        link: `/inbox/${chatId}`,
        sourceEventId: randomUUID(),
      },
    });

  it("deletes the payment proofs kept from their chat and leaves another customer's", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const phones = [freshPhone(), freshPhone()];
    for (const phone of phones) {
      await deliver(test, fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Hi" }));
    }
    const chats = await inOrg((tx) => tx.whatsappConversation.findMany({ orderBy: { phoneE164: "asc" } }));
    const mine = chats.find((chat) => chat.phoneE164 === phones[0]);
    const other = chats.find((chat) => chat.phoneE164 === phones[1]);
    if (mine === undefined || mine.personId === null || other === undefined) throw new Error("Both need a chat");
    const personId = mine.personId;
    await inOrg(async (tx) => {
      for (const chat of [mine, other]) {
        const lead = await aLead(tx, { personId: chat.personId ?? personId });
        const shot = await tx.whatsappMessage.create({
          data: {
            conversationId: chat.id,
            direction: "in",
            origin: "customer",
            kind: "image",
            wamid: `wamid.${randomUUID()}`,
            status: "received",
            occurredAt: testNow,
          },
        });
        await tx.paymentProof.create({ data: { conversationId: chat.id, messageId: shot.id, leadId: lead.id } });
        await recordUnmatchedNotice(tx, chat.id);
      }
    });

    await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(organizationId), { organizationId, personId }, testNow),
    );

    expect(await inOrg((tx) => tx.paymentProof.count({ where: { conversationId: mine.id } }))).toBe(0);
    expect(await inOrg((tx) => tx.paymentProof.count({ where: { conversationId: other.id } }))).toBe(1);
    expect(await inOrg((tx) => tx.notification.count({ where: { link: { contains: mine.id } } }))).toBe(0);
    expect(await inOrg((tx) => tx.notification.count({ where: { link: { contains: other.id } } }))).toBe(1);
  });
});

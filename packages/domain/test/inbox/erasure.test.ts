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

    await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(organizationId), { organizationId, personId }, testNow),
    );

    const kept = (chatId: string) =>
      inOrg(async (tx) => ({
        scheduled: await tx.scheduledMessage.count({ where: { conversationId: chatId } }),
        tags: await tx.conversationTag.count({ where: { conversationId: chatId } }),
        reads: await tx.conversationRead.count({ where: { conversationId: chatId } }),
        notices: await tx.notification.count({ where: { link: { contains: chatId } } }),
        words: await tx.whatsappMessage.count({ where: { conversationId: chatId, body: { not: null } } }),
      }));
    expect(await kept(mine.id)).toEqual({ scheduled: 0, tags: 0, reads: 0, notices: 0, words: 0 });
    expect(await kept(other.id)).toMatchObject({ scheduled: 1, tags: 1, reads: 1, notices: 1 });
    const notes = (await inOrg((tx) => tx.leadNote.findMany())).map((note) => note.body);
    expect(notes).not.toContain(`Neha wants a Spiti trip (${mine.id})`);
    expect(notes).toContain(`Neha wants a Spiti trip (${other.id})`);
  });
});

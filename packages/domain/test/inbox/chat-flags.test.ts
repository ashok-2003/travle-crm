// A chat's place in the inbox (sales inbox spec 5): pinned, archived until the customer writes, starred messages, and each
// member's read mark. Every change staff make is in the audit log; reading is not.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveConversation,
  markConversationRead,
  pinConversation,
  starMessage,
  unreadCounts,
} from "../../src/inbox/index.js";
import { auditOf, memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

describe("a chat's flags", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function chat() {
    const connection = await aConnectedAgency(test);
    await deliver(test, fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text: "Goa?" }));
    const { conversation, message } = await test.db.forOrg(connection.organizationId, async (tx) => ({
      conversation: await tx.whatsappConversation.findFirstOrThrow(),
      message: await tx.whatsappMessage.findFirstOrThrow(),
    }));
    const member = memberOf(connection.organizationId);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(connection.organizationId, work);
    const actions = async () =>
      (await auditOf(test, connection.organizationId, conversation.id)).map((entry) => entry.action);
    return { connection, conversation, message, member, inOrg, actions };
  }

  it("audits pinning, archiving and starring, each way, and nothing when nothing changes", async () => {
    const { conversation, message, member, inOrg, actions } = await chat();
    await inOrg(async (tx) => {
      await pinConversation(tx, member, conversation.id, true, testNow);
      await pinConversation(tx, member, conversation.id, true, testNow);
      await pinConversation(tx, member, conversation.id, false, testNow);
      await archiveConversation(tx, member, conversation.id, true, testNow);
      await archiveConversation(tx, member, conversation.id, false, testNow);
      await starMessage(tx, member, message.id, true, testNow);
      await starMessage(tx, member, message.id, true, testNow);
      await starMessage(tx, member, message.id, false, testNow);
    });
    expect(await actions()).toEqual([
      "inbox.chat-pinned",
      "inbox.chat-unpinned",
      "inbox.chat-archived",
      "inbox.chat-unarchived",
      "inbox.message-starred",
      "inbox.message-unstarred",
    ]);
  });

  it("stars a message for the team with who starred it", async () => {
    const { message, member, inOrg } = await chat();
    await inOrg((tx) => starMessage(tx, member, message.id, true, testNow));
    expect(await inOrg((tx) => tx.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } }))).toMatchObject({
      starredAt: testNow,
      starredBy: member.userId,
    });
  });

  it("clears a member's unread count when they read the chat, and brings it back with the next message", async () => {
    const { connection, conversation, member, inOrg } = await chat();
    const unread = () =>
      inOrg(async (tx) => (await unreadCounts(tx, member, [conversation.id])).get(conversation.id) ?? 0);
    expect(await unread()).toBe(1);
    await inOrg((tx) => markConversationRead(tx, member, conversation.id, new Date(testNow.getTime() + 60_000)));
    expect(await unread()).toBe(0);
    const customerNumber = (
      await inOrg((tx) => tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } }))
    ).phoneE164;
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: customerNumber.replace("+", ""),
        text: "Hello?",
        ts: Math.floor(testNow.getTime() / 1000) + 3600,
      }),
      new Date(testNow.getTime() + 3_600_000),
    );
    expect(await unread()).toBe(1);
  });
});

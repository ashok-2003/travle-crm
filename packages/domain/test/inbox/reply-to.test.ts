// Reply-to, both ways: a customer's quote shows its original (or says it is missing), our reply quotes a message of the
// same chat only, the sender passes the original's WhatsApp id to MSG91, and a quote MSG91 refuses is dropped so the
// message still goes (SPIKE(reply-context)).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMessages, queueText, sendQueued, type ReplyContext } from "../../src/inbox/index.js";
import { newUuidV7 } from "../../src/kernel/index.js";
import { listenerContext, memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestConnection,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;
const context: ReplyContext = { whatsappConfigured: true };

describe("reply-to", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function chat() {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    const asked = `wamid.${randomUUID()}`;
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Goa in December?", wamid: asked }));
    const { conversation, first } = await test.db.forOrg(connection.organizationId, async (tx) => ({
      conversation: await tx.whatsappConversation.findFirstOrThrow(),
      first: await tx.whatsappMessage.findFirstOrThrow({ where: { wamid: asked } }),
    }));
    const member = memberOf(connection.organizationId);
    const at = new Date(testNow.getTime() + HOUR);
    const reply = (text: string, replyToMessageId?: string, conversationId = conversation.id) =>
      test.db.forOrg(connection.organizationId, (tx) =>
        queueText(
          tx,
          member,
          { conversationId, clientToken: randomUUID(), text, ...(replyToMessageId ? { replyToMessageId } : {}) },
          context,
          at,
        ),
      );
    const messages = () =>
      test.db.forOrg(connection.organizationId, (tx) =>
        listMessages(tx, member, { conversationId: conversation.id, limit: 50 }),
      );
    return { connection, customerNumber, conversation, first, member, reply, messages, asked };
  }

  const send = (connection: TestConnection, messageId: string) =>
    sendQueued(
      {
        provider: test.provider,
        files: test.files,
        limiter: test.dependencies.limiter,
        logger: test.logger,
        managers: test.dependencies.managers,
      },
      listenerContext(test, connection.organizationId),
      { id: newUuidV7(), messageId },
      new Date(testNow.getTime() + HOUR),
    );

  it("stores our quote, passes the original's WhatsApp id to MSG91, and shows the quote in the chat", async () => {
    const { connection, first, reply, messages, asked } = await chat();
    const queued = await reply("Yes, from ₹12,000", first.id);
    expect(await send(connection, queued.messageId)).toBe("sent");
    expect(test.provider.sent.at(-1)).toMatchObject({ text: "Yes, from ₹12,000", replyTo: asked });
    const ours = (await messages()).items.find((message) => message.id === queued.messageId);
    expect(ours).toMatchObject({
      quoteDropped: false,
      quoted: { messageId: first.id, direction: "in", kind: "text", body: "Goa in December?" },
    });
  });

  it("refuses a quote of a message in another chat", async () => {
    const mine = await chat();
    const theirs = await chat();
    await expect(mine.reply("Hi", theirs.first.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(mine.reply("Hi", randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sends the message without its quote when MSG91 refuses it, and says so", async () => {
    const { connection, first, reply, messages } = await chat();
    const queued = await reply("Quoted", first.id);
    test.provider.failNext("other");
    expect(await send(connection, queued.messageId)).toBe("sent");
    // MSG91's refusal was not a send; the one send that went carries no quote.
    const went = test.provider.sent.at(-1);
    expect(went).toMatchObject({ text: "Quoted" });
    expect(went?.replyTo).toBeUndefined();
    const ours = (await messages()).items.find((message) => message.id === queued.messageId);
    expect(ours).toMatchObject({ status: "sent", quoteDropped: true });
    expect(test.logger.entries.some((entry) => entry.msg.includes("without"))).toBe(true);
  });

  it("does not send a second time when the first answer is unsure", async () => {
    const { connection, first, reply } = await chat();
    const queued = await reply("Quoted", first.id);
    const before = test.provider.sent.length;
    test.provider.failNext("unsure");
    expect(await send(connection, queued.messageId)).toBe("failed");
    expect(test.provider.sent.length).toBe(before);
  });

  it("shows a customer's quote with its original, and says when we never had the original", async () => {
    const { connection, customerNumber, first, messages, asked } = await chat();
    await deliver(
      test,
      fromCustomer(connection, { customerNumber, text: "Yes please", replyMsgId: asked }),
      new Date(testNow.getTime() + 2 * HOUR),
    );
    await deliver(
      test,
      fromCustomer(connection, { customerNumber, text: "And this?", replyMsgId: "wamid.from-before-we-were-here" }),
      new Date(testNow.getTime() + 3 * HOUR),
    );
    const { items } = await messages();
    expect(items.find((message) => message.body === "Yes please")?.quoted).toMatchObject({
      messageId: first.id,
      direction: "in",
      body: "Goa in December?",
    });
    expect(items.find((message) => message.body === "And this?")?.quoted).toMatchObject({
      messageId: null,
      body: null,
    });
  });
});

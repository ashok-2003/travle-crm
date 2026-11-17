// A card with reply buttons: queued as an automatic text with its buttons, sent by sendButtons, failed as any send, and
// shown in the chat; a customer's tap keeps its id only when it is a reply button's.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMessages, queueSystemText, sendQueued } from "../../src/inbox/index.js";
import { newUuidV7 } from "../../src/kernel/index.js";
import { listenerContext, memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

const buttons = [
  { id: "book:0190f3a2-0000-7000-8000-000000000001", title: "Book these seats" },
  { id: "change:0190f3a2-0000-7000-8000-000000000001", title: "Change something" },
];

describe("a card with buttons", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function chat() {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Goa in December?" }));
    const conversation = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow(),
    );
    const at = new Date(testNow.getTime() + 60_000);
    const queue = () =>
      test.db.forOrg(connection.organizationId, (tx) =>
        queueSystemText(
          tx,
          {
            conversationId: conversation.id,
            body: "*Goa*\nTotal ₹22,600",
            sentBy: null,
            origin: "automation",
            clientToken: randomUUID(),
            answers: true,
            buttons,
          },
          at,
        ),
      );
    const send = (messageId: string) =>
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
        at,
      );
    const messages = () =>
      test.db.forOrg(connection.organizationId, (tx) =>
        listMessages(tx, memberOf(connection.organizationId), { conversationId: conversation.id, limit: 50 }),
      );
    return { connection, customerNumber, queue, send, messages };
  }

  it("sends a queued card by sendButtons, and fails it as any send", async () => {
    const { queue, send, messages } = await chat();
    const sentBefore = test.provider.sent.length;
    const queued = await queue();
    if (!queued.ok) throw new Error(queued.code);
    expect(await send(queued.messageId)).toBe("sent");
    expect(test.provider.sent.slice(sentBefore)).toHaveLength(1);
    expect(test.provider.sent.at(-1)).toMatchObject({ kind: "buttons", text: "*Goa*\nTotal ₹22,600" });
    expect(test.provider.sent.at(-1)?.buttons?.buttons).toEqual(buttons);
    const card = (await messages()).items.find((message) => message.id === queued.messageId);
    expect(card).toMatchObject({ buttons, tapped: false });

    const second = await queue();
    if (!second.ok) throw new Error(second.code);
    test.provider.failNext("other");
    expect(await send(second.messageId)).toBe("failed");
    expect((await messages()).items.find((message) => message.id === second.messageId)).toMatchObject({
      status: "failed",
    });
  });
});

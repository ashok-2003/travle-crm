// A message's AI text (what the agent heard in a voice note or saw in a photo) reaches the chat's page, and only when it is saved.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMessages } from "../../src/inbox/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, deliver, freshPhone, fromCustomer, type TestInbox } from "./support.js";

describe("a chat message's AI text", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("shows a message with what the AI heard", async () => {
    const connection = await aConnectedAgency(test);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(connection.organizationId, work);
    await deliver(test, fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text: "Hello" }));
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { conversationId: chat.id } }));
    const page = () =>
      inOrg((tx) => listMessages(tx, memberOf(connection.organizationId), { conversationId: chat.id, limit: 50 }));
    expect((await page()).items[0]?.aiText).toBeNull();
    await inOrg((tx) =>
      tx.whatsappMessage.update({
        where: { id: message.id },
        data: { aiText: "Can we go in May?", aiTextKind: "transcript", aiTextAt: new Date() },
      }),
    );
    expect((await page()).items[0]?.aiText).toEqual({ kind: "transcript", text: "Can we go in May?" });
  });
});

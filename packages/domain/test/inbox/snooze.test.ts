// Snoozing a chat (sales inbox spec 6): it leaves the lists until its time, wakes when the time comes, and wakes at once when
// the customer writes again, so a new message is never hidden behind a snooze.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listConversations, snoozeConversation } from "../../src/inbox/index.js";
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

describe("snoozing a chat", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function snoozedChat() {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Goa in March?" }));
    const conversation = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow(),
    );
    const member = memberOf(connection.organizationId);
    await test.db.forOrg(connection.organizationId, (tx) =>
      snoozeConversation(tx, member, conversation.id, new Date(testNow.getTime() + 48 * HOUR), testNow),
    );
    const chatRow = () =>
      test.db.forOrg(connection.organizationId, (tx) =>
        tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
      );
    return { connection, customerNumber, conversation, member, chatRow };
  }

  it("hides the chat from the lists while it is snoozed", async () => {
    const { connection, member } = await snoozedChat();
    const awake = await test.db.forOrg(connection.organizationId, (tx) =>
      listConversations(tx, member, { filter: "all", limit: 20 }, testNow),
    );
    expect(awake.items).toHaveLength(0);
  });

  it("wakes the chat when the customer writes again, even long before the snooze ends", async () => {
    const { connection, customerNumber, chatRow, member } = await snoozedChat();
    expect((await chatRow()).snoozedUntil).not.toBeNull();
    await deliver(
      test,
      fromCustomer(connection, { customerNumber, text: "Hello? Still there?" }),
      new Date(testNow.getTime() + HOUR),
    );
    const woken = await chatRow();
    expect(woken).toMatchObject({ snoozedUntil: null, snoozedBy: null });
    const shown = await test.db.forOrg(connection.organizationId, (tx) =>
      listConversations(tx, member, { filter: "all", limit: 20 }, new Date(testNow.getTime() + HOUR)),
    );
    expect(shown.items.map((item) => item.id)).toEqual([woken.id]);
  });

  it("keeps the snooze when the customer only reacts to a message", async () => {
    const { connection, customerNumber, chatRow } = await snoozedChat();
    await deliver(
      test,
      fromCustomer(connection, { customerNumber, contentType: "reaction", text: "👍", replyMsgId: "wamid.unknown" }),
    );
    expect((await chatRow()).snoozedUntil).not.toBeNull();
  });
});

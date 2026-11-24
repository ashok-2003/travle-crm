// An edit or a deletion lands on the message it belongs to and is no message of its own; a message WhatsApp could not pass
// on keeps its reason, and an ad's headline is kept with the words (inbox revamp spec item 12). None of them counts as a
// new customer message: the chat's wait, the unread count, the automatic answers and the usage stay as they were.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linesAfter } from "../../src/ai/chat-summary/lines.js";
import { chatLines } from "../../src/ai/lite/prepare.js";
import { naturalChatLines } from "../../src/ai/natural/chat-lines.js";
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

/** Unix seconds a given number of seconds from the test clock: the provider's time is never later than ours. */
const at = (seconds: number) => testNow.getTime() / 1000 + seconds;
const digits = (phone: string) => phone.replace("+", "");

describe("edits, deletions and messages that cannot be shown", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const meta = (message: object) => ({ messages: JSON.stringify([message]) });
  const editOf = (original: string, text: string) => ({
    type: "edit",
    edit: { original_message_id: original, message: { type: "text", text: { body: text } } },
  });

  /** A chat with one customer message, answered from the phone so the chat is not waiting; what counts is then compared. */
  async function answeredChat(connection: TestConnection, customerNumber: string, wamid = `wamid.o-${customerNumber}`) {
    await deliver(test, fromCustomer(connection, { customerNumber, wamid, text: "Goa trip", ts: at(-300) }));
    await deliver(test, fromCustomer(connection, { customerNumber, direction: "1", text: "Yes, sure", ts: at(-200) }));
  }

  const snapshot = (connection: TestConnection) =>
    test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = await tx.whatsappConversation.findFirstOrThrow();
      const usage = await tx.whatsappUsageMonth.findFirstOrThrow();
      return {
        messages: await tx.whatsappMessage.count(),
        events: await tx.outboxEvent.count(),
        needsReply: chat.needsReply,
        lastInboundAt: chat.lastInboundAt,
        lastMessageId: chat.lastMessageId,
        inbound: usage.inbound,
      };
    });

  const original = (connection: TestConnection, wamid: string) =>
    test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow({ where: { wamid } }));

  it("updates the original's words and marks it edited: no message, no wait, no event, no count", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await answeredChat(connection, customerNumber, "wamid.e1");
    const before = await snapshot(connection);
    const body = {
      ...fromCustomer(connection, { customerNumber, contentType: "edit", ts: at(-100) }),
      ...meta(editOf("wamid.e1", "Goa trip for 5")),
    };
    await deliver(test, body);
    await deliver(test, body);
    expect(await snapshot(connection)).toEqual(before);
    expect(before.needsReply).toBe(false);
    expect(await original(connection, "wamid.e1")).toMatchObject({
      body: "Goa trip for 5",
      editedAt: new Date(testNow.getTime() + -100 * 1000),
    });
  });

  it("never lets an older edit replace a newer one, whatever order they are processed in", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await answeredChat(connection, customerNumber, "wamid.e2");
    const edit = (text: string, ts: number) => ({
      ...fromCustomer(connection, { customerNumber, contentType: "edit", ts }),
      ...meta(editOf("wamid.e2", text)),
    });
    await deliver(test, edit("Goa for 6", at(-50)));
    await deliver(test, edit("Goa for 5", at(-100)));
    expect(await original(connection, "wamid.e2")).toMatchObject({
      body: "Goa for 6",
      editedAt: new Date(testNow.getTime() - 50_000),
    });
  });

  it("keeps an edit whose original was never stored as a text message marked edited", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    const body = {
      ...fromCustomer(connection, { customerNumber, contentType: "edit", ts: at(-100) }),
      ...meta(editOf("wamid.lost", "Spiti in June")),
    };
    await deliver(test, body);
    await deliver(test, body);
    const rows = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "text",
      direction: "in",
      body: "Spiti in June",
      wamid: "wamid.lost",
      editedAt: new Date(testNow.getTime() + -100 * 1000),
    });
  });

  it("marks the original deleted and keeps its words; nothing is added or changed in the chat", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await answeredChat(connection, customerNumber, "wamid.r1");
    const before = await snapshot(connection);
    const body = {
      ...fromCustomer(connection, { customerNumber, contentType: "revoke", ts: at(-50) }),
      ...meta({ type: "revoke", revoke: { original_message_id: "wamid.r1" } }),
    };
    await deliver(test, body);
    await deliver(test, { ...body, ts: at(-40) });
    expect(await snapshot(connection)).toEqual(before);
    expect(await original(connection, "wamid.r1")).toMatchObject({
      body: "Goa trip",
      revokedAt: new Date(testNow.getTime() + -50 * 1000),
    });
  });

  it("keeps a deleted message out of everything the AI reads of the chat", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await deliver(
      test,
      fromCustomer(connection, { customerNumber, wamid: "wamid.w1", text: "Withdrawn words", ts: at(-300) }),
    );
    await deliver(
      test,
      fromCustomer(connection, { customerNumber, wamid: "wamid.w2", text: "Kept words", ts: at(-250) }),
    );
    const reads = () =>
      test.db.forOrg(connection.organizationId, async (tx) => {
        const chat = await tx.whatsappConversation.findFirstOrThrow({ select: { id: true } });
        return JSON.stringify([
          (await naturalChatLines(tx, chat.id)).lines,
          (await linesAfter(tx, chat.id, null)).lines,
          (await chatLines(tx, chat.id)).messages,
        ]);
      });
    expect(await reads()).toContain("Withdrawn words");
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, contentType: "revoke", ts: at(-100) }),
      ...meta({ type: "revoke", revoke: { original_message_id: "wamid.w1" } }),
    });
    const after = await reads();
    expect(after).not.toContain("Withdrawn words");
    expect(after).toContain("Kept words");
  });

  it("ignores a deletion whose original was never stored", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Hi", ts: at(-300) }));
    const before = await snapshot(connection);
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, contentType: "revoke" }),
      ...meta({ type: "revoke", revoke: { original_message_id: "wamid.never" } }),
    });
    expect(await snapshot(connection)).toEqual(before);
  });

  it("lands an edit and a deletion made on the phone on the phone's message, without waking the chat", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await answeredChat(connection, customerNumber);
    const sent = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { origin: "staff_phone" } }),
    );
    const phoneWamid = sent.wamid ?? "";
    const before = await snapshot(connection);
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, direction: "1", contentType: "edit", ts: at(-100) }),
      content: JSON.stringify({ edit: editOf(phoneWamid, "Yes, sure, call me").edit }),
    });
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, direction: "1", contentType: "revoke", ts: at(-50) }),
      content: JSON.stringify({ revoke: { original_message_id: phoneWamid } }),
    });
    expect(await snapshot(connection)).toEqual(before);
    expect(await original(connection, phoneWamid)).toMatchObject({
      body: "Yes, sure, call me",
      editedAt: new Date(testNow.getTime() + -100 * 1000),
      revokedAt: new Date(testNow.getTime() + -50 * 1000),
    });
  });

  it("stores why a message could not be shown", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    const cases = [
      ["wamid.u1", { errors: [{ code: 131060 }], unsupported: { type: "unknown" } }, "unavailable"],
      ["wamid.u2", { errors: [{ code: 131051 }], unsupported: { type: "album" } }, "album"],
      ["wamid.u3", { errors: [{ code: 131051 }], unsupported: { type: "unknown" } }, "unknown"],
    ] as const;
    for (const [wamid, fields] of cases) {
      await deliver(test, {
        ...fromCustomer(connection, { customerNumber, wamid, contentType: "unsupported", ts: at(-300) }),
        ...meta({ type: "unsupported", ...fields }),
      });
    }
    for (const [wamid, , reason] of cases) {
      expect(await original(connection, wamid)).toMatchObject({ kind: "unsupported", unsupportedReason: reason });
    }
  });

  it("stores an ad's headline with its words", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, wamid: "wamid.ad", contentType: "referral", ts: at(-300) }),
      ...meta({
        type: "text",
        text: { body: "Is Goa on?" },
        referral: { source_id: "1", headline: "Goa in December" },
      }),
    });
    expect(await original(connection, "wamid.ad")).toMatchObject({ body: "Is Goa on?", adHeadline: "Goa in December" });
  });

  it("logs no words of an edit", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, contentType: "edit", ts: at(-100) }),
      ...meta(editOf("wamid.nolog", "secret words here")),
    });
    expect(JSON.stringify(test.logger.entries)).not.toContain("secret words here");
  });
});

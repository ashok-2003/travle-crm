// Our own sends, which MSG91 answers with a request id only: their echo is not a person on the phone, and their reports
// find them by the request id. A file sent from the phone is copied like a customer's; an edit or a deletion is dropped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { tinyPng } from "@travel-crm/integrations/testing";
import { copyMedia } from "../../src/inbox/index.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  statusFor,
  testNow,
  type TestConnection,
  type TestInbox,
} from "./support.js";

const digits = (phone: string) => phone.replace("+", "");
const at = (seconds: number) => Math.floor(testNow.getTime() / 1000) + seconds;

describe("echoes and reports of our own sends", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** A chat the customer opened, and our send in it that MSG91 answered with a request id and no wamid (or not yet). */
  async function ourSend(connection: TestConnection, requestId: string | null, status = "sent") {
    const customerNumber = digits(freshPhone());
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Goa?", ts: at(0) }));
    const sent = await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = await tx.whatsappConversation.findFirstOrThrow({ where: { phoneE164: `+${customerNumber}` } });
      return tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: "out",
          origin: "automation",
          kind: "text",
          body: "Here is your Goa quote",
          requestId,
          status,
          occurredAt: new Date(testNow.getTime() + 30_000),
          sentAt: new Date(testNow.getTime() + 30_000),
        },
      });
    });
    return { customerNumber, sent };
  }

  const rows = (connection: TestConnection) =>
    test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.findMany({ where: { direction: "out" }, orderBy: { occurredAt: "asc" } }),
    );

  it("takes an echo of our own send as ours: no phone copy, the send gets the wamid, the chat is unchanged", async () => {
    const connection = await aConnectedAgency(test);
    const { customerNumber, sent } = await ourSend(connection, "req-own-1");
    const chatBefore = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow({ where: { phoneE164: `+${customerNumber}` } }),
    );
    const wamid = "wamid.ECHO-OWN-1";
    const echo = {
      ...fromCustomer(connection, { customerNumber, wamid, direction: "1", ts: at(40) }),
      requestId: "req-own-1",
      content: JSON.stringify({ text: "Here is your Goa quote" }),
    };
    await deliver(test, echo);
    await deliver(test, echo);
    const out = await rows(connection);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: sent.id, origin: "automation", wamid, status: "sent" });
    const chatAfter = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findUniqueOrThrow({ where: { id: chatBefore.id } }),
    );
    expect(chatAfter).toEqual(chatBefore);

    // Its reports now find it by the wamid the echo gave it.
    await deliver(test, statusFor(connection, { customerNumber, wamid, eventName: "read", ts: at(50) }));
    expect((await rows(connection))[0]).toMatchObject({ status: "read" });
  });

  /** An echo of our own api's send as MSG91 writes it live: a messageType, no contentType, the words in `content`. */
  const ourEcho = (connection: TestConnection, customerNumber: string, wamid: string, extra: object = {}) => ({
    ...fromCustomer(connection, { customerNumber, wamid, direction: "1", ts: at(40), contentType: "" }),
    messageType: "text",
    content: JSON.stringify({ text: "Here is   your Goa\nquote" }),
    ...extra,
  });

  it("takes an echo of our own send by its words when no request id matches: no copy, the wamid, then its reports", async () => {
    const connection = await aConnectedAgency(test);
    const { customerNumber, sent } = await ourSend(connection, null);
    const wamid = "wamid.ECHO-WORDS";
    await deliver(test, ourEcho(connection, customerNumber, wamid, { requestId: "req-msg91-only" }));
    const out = await rows(connection);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: sent.id, origin: "automation", wamid });
    await deliver(test, statusFor(connection, { customerNumber, wamid, eventName: "read", ts: at(50) }));
    expect((await rows(connection))[0]).toMatchObject({ status: "read" });
  });

  it("gives an echo's wamid to our send still waiting for MSG91's answer, and a phone message never waits", async () => {
    const connection = await aConnectedAgency(test);
    const { customerNumber, sent } = await ourSend(connection, null, "sending");
    await deliver(test, ourEcho(connection, customerNumber, "wamid.ECHO-EARLY"));
    await deliver(test, fromCustomer(connection, { customerNumber, direction: "1", text: "On my way", ts: at(45) }));
    const out = await rows(connection);
    expect(out).toHaveLength(2);
    expect(out.find((row) => row.origin === "automation")).toMatchObject({ id: sent.id, wamid: "wamid.ECHO-EARLY" });
    expect(out.find((row) => row.origin === "staff_phone")).toMatchObject({ body: "On my way" });
  });

  it("waits on an echo of ours that matches nothing while a send is waiting, then drops it, never a phone copy", async () => {
    const connection = await aConnectedAgency(test);
    const { customerNumber } = await ourSend(connection, null, "sending");
    const other = ourEcho(connection, customerNumber, "wamid.ECHO-OTHER", {
      content: JSON.stringify({ text: "Something we never sent" }),
    });
    await expect(deliver(test, other)).rejects.toThrow();
    await deliver(test, other, new Date(testNow.getTime() + 3 * 60_000));
    expect((await rows(connection)).map((row) => row.origin)).toEqual(["automation"]);
  });

  it("takes an echo of our own file by its kind", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Plan?", ts: at(0) }));
    const sent = await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = await tx.whatsappConversation.findFirstOrThrow({ where: { phoneE164: `+${customerNumber}` } });
      return tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: "out",
          origin: "automation",
          kind: "document",
          fileName: "Spiti.pdf",
          status: "sent",
          occurredAt: new Date(testNow.getTime() + 30_000),
        },
      });
    });
    await deliver(
      test,
      ourEcho(connection, customerNumber, "wamid.ECHO-FILE", {
        messageType: "document",
        content: JSON.stringify({ attachment_url: "https://files.example/x.pdf", filename: "Spiti.pdf" }),
      }),
    );
    const out = await rows(connection);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: sent.id, wamid: "wamid.ECHO-FILE" });
  });

  it("still stores a phone message whose request id is not one of our sends", async () => {
    const connection = await aConnectedAgency(test);
    const { customerNumber } = await ourSend(connection, "req-own-2");
    await deliver(
      test,
      {
        ...fromCustomer(connection, { customerNumber, direction: "1", text: "Call you at 5", ts: at(60) }),
        requestId: "req-phone-2",
      },
      new Date(testNow.getTime() + 120_000),
    );
    const out = await rows(connection);
    expect(out.map((row) => row.origin)).toEqual(["automation", "staff_phone"]);
    expect(out[1]).toMatchObject({ body: "Call you at 5", requestId: null });
  });

  it("finds our send by its request id for a report, in the customer's own chat when one request covers several", async () => {
    const connection = await aConnectedAgency(test);
    const first = await ourSend(connection, "req-bulk");
    const second = await ourSend(connection, "req-bulk");
    await deliver(test, {
      ...statusFor(connection, {
        customerNumber: second.customerNumber,
        wamid: "wamid.BULK-2",
        eventName: "delivered",
        ts: at(45),
      }),
      requestId: "req-bulk",
    });
    const read = (id: string) =>
      test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findUniqueOrThrow({ where: { id } }));
    expect(await read(second.sent.id)).toMatchObject({ wamid: "wamid.BULK-2", status: "delivered" });
    expect(await read(first.sent.id)).toMatchObject({ wamid: null, status: "sent" });
  });

  it("keeps trying a report whose request id finds nothing yet, and drops it once it is old", async () => {
    const connection = await aConnectedAgency(test);
    const { customerNumber } = await ourSend(connection, "req-known");
    const report = (seconds: number) => ({
      ...statusFor(connection, { customerNumber, wamid: "wamid.NOT-OURS", eventName: "delivered", ts: at(seconds) }),
      requestId: "req-unknown",
    });
    await expect(deliver(test, report(0))).rejects.toThrow();
    await deliver(test, report(-600));
    const connectionRow = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.findFirstOrThrow(),
    );
    expect(connectionRow.eventsUnknown).toBe(1);
  });

  it("copies a file sent from the phone into storage, as it does a customer's", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    const url = "https://media.example/phone-1";
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, direction: "1", contentType: "image", ts: at(0) }),
      content: JSON.stringify({ attachment_url: url, caption: "Your hotel" }),
    });
    const [message] = await rows(connection);
    expect(message).toMatchObject({ origin: "staff_phone", kind: "image", caption: "Your hotel" });
    expect(message).toMatchObject({ mediaState: "pending", mediaUrl: url });
    const messageId = message?.id ?? "";
    expect(test.queue.sent.some((job) => job.queue === "whatsapp.copy-media" && job.id === messageId)).toBe(true);
    test.provider.addFile(url, { bytes: tinyPng, contentType: "image/png" });
    expect(await copyMedia(test.dependencies, connection.organizationId, messageId, testNow)).toBe("stored");
    const stored = await test.db.forOrg(connection.organizationId, async (tx) => ({
      message: await tx.whatsappMessage.findUniqueOrThrow({ where: { id: messageId } }),
      attachments: await tx.attachment.count({ where: { recordType: WHATSAPP_RECORD_TYPE, recordId: messageId } }),
    }));
    expect(stored.message).toMatchObject({ mediaState: "stored", mediaUrl: null });
    expect(stored.attachments).toBe(1);
  });

  it("drops an edit or a deletion: no message, no count, nothing for the automatic answers", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    const state = () =>
      test.db.forOrg(connection.organizationId, async (tx) => ({
        messages: await tx.whatsappMessage.count(),
        unknown: (await tx.whatsappConnection.findFirstOrThrow()).eventsUnknown,
        events: await tx.outboxEvent.count(),
      }));
    const before = await state();
    await deliver(test, [
      fromCustomer(connection, { customerNumber, contentType: "edit" }),
      fromCustomer(connection, { customerNumber, contentType: "revoke", direction: "1" }),
    ]);
    expect(await state()).toEqual({ ...before, messages: 0, unknown: 0 });
  });
});

// The one sending rule (spec 2026-11-22-multi-number-whatsapp-design.md, section 5): a send in a chat goes from the chat's
// own number or not at all; a send to a customer goes from the live number they last wrote to, else the main one. The
// number expected is never the one a lookup taking whichever number comes first would return.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrgTx } from "@travel-crm/db";
import {
  customerChatOf,
  liveConnections,
  mainConnection,
  numbersOf,
  sendFrom,
  templateOnNumber,
} from "../../src/inbox/index.js";
import { aPerson } from "../crm/support/records.js";
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

describe("which number a send goes from", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const inAgency = <T>(connection: TestConnection, work: (tx: OrgTx) => Promise<T>) =>
    test.db.forOrg(connection.organizationId, work);

  /** The customer writes to the number at the time; their chat on it. */
  async function writes(connection: TestConnection, phone: string, at = testNow): Promise<string> {
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Goa?", ts: at.getTime() / 1000 }),
      at,
    );
    return inAgency(connection, async (tx) => {
      const chat = await tx.whatsappConversation.findFirstOrThrow({
        where: { connectionId: connection.connectionId, phoneE164: phone },
        select: { id: true },
      });
      return chat.id;
    });
  }

  const setStatus = (connection: TestConnection, status: string) =>
    inAgency(connection, (tx) =>
      tx.whatsappConnection.update({ where: { id: connection.connectionId }, data: { status } }),
    );

  it("sends in a chat from the chat's own number, never the main one", async () => {
    const main = await aConnectedAgency(test);
    const second = await aSecondNumber(test, main);
    const phone = freshPhone();
    const chat = await writes(second, phone, new Date(testNow.getTime() - HOUR));
    // The customer wrote to the main number since: the chat still answers from its own.
    await writes(main, phone);
    const found = await inAgency(second, (tx) => sendFrom(tx, { chat }));
    expect(found).toMatchObject({ ok: true, chat: { id: chat, connectionId: second.connectionId } });
    expect(found.ok && found.connection.id).toBe(second.connectionId);
    // The worker sends the chat's row from the chat's number.
    const queued = await inAgency(second, (tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: chat,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Yes",
          status: "queued",
          occurredAt: testNow,
        },
        select: { id: true },
      }),
    );
    expect(await sentFrom(test, second.organizationId, queued.id)).toBe(second.integratedNumber);
  });

  it("refuses a chat whose number is paused, setting up or disconnected, naming which", async () => {
    const main = await aConnectedAgency(test);
    const second = await aSecondNumber(test, main);
    const chat = await writes(second, freshPhone());
    for (const [status, code] of [
      ["paused", "paused"],
      ["setup", "not_connected"],
      ["disconnected", "disconnected"],
    ] as const) {
      await setStatus(second, status);
      expect(await inAgency(second, (tx) => sendFrom(tx, { chat }))).toEqual({ ok: false, code });
    }
    // A demo number never sends either.
    await inAgency(second, (tx) =>
      tx.whatsappConnection.update({ where: { id: second.connectionId }, data: { status: "connected", mode: "demo" } }),
    );
    expect(await inAgency(second, (tx) => sendFrom(tx, { chat }))).toEqual({ ok: false, code: "not_connected" });
  });

  it("sends to a customer from the number they last wrote to, not the one we last wrote from", async () => {
    const main = await aConnectedAgency(test);
    const second = await aSecondNumber(test, main);
    const phone = freshPhone();
    const onMain = await writes(main, phone, new Date(testNow.getTime() - 2 * HOUR));
    const onSecond = await writes(second, phone, new Date(testNow.getTime() - HOUR));
    // We wrote on the main number last.
    await inAgency(main, (tx) =>
      tx.whatsappConversation.update({ where: { id: onMain }, data: { lastMessageAt: testNow } }),
    );
    const customer = { phoneE164: phone, personId: null };
    for (const make of [false, true]) {
      const found = await inAgency(main, (tx) => sendFrom(tx, { customer, make }));
      expect(found).toMatchObject({ ok: true, chat: { id: onSecond, connectionId: second.connectionId } });
      expect(found.ok && found.connection.id).toBe(second.connectionId);
    }
    // Their number paused holds the send: it never moves to the main number.
    await setStatus(second, "paused");
    expect(await inAgency(main, (tx) => sendFrom(tx, { customer, make: true }))).toEqual({ ok: false, code: "paused" });
    expect(await inAgency(main, (tx) => customerChatOf(tx, phone))).toMatchObject({ id: onSecond });
  });

  it("starts a customer who wrote to no live number on the main number, making the chat only when asked", async () => {
    const first = await aConnectedAgency(test);
    const main = await aSecondNumber(test, first, { main: true });
    const phone = freshPhone();
    const personId = await inAgency(main, async (tx) => (await aPerson(tx, { phoneE164: phone })).id);
    const customer = { phoneE164: phone, personId };
    const chats = () => inAgency(main, (tx) => tx.whatsappConversation.findMany({ where: { phoneE164: phone } }));

    expect(await inAgency(main, (tx) => sendFrom(tx, { customer, make: false }))).toEqual({
      ok: false,
      code: "none_yet",
    });
    expect(await inAgency(main, (tx) => customerChatOf(tx, phone))).toBeNull();
    expect(await chats()).toHaveLength(0);

    const made = await inAgency(main, (tx) => sendFrom(tx, { customer, make: true }));
    expect(made).toMatchObject({ ok: true, chat: { connectionId: main.connectionId, personId, lastInboundAt: null } });
    expect(made.ok && made.connection.id).toBe(main.connectionId);
    const again = await inAgency(main, (tx) => sendFrom(tx, { customer, make: true }));
    expect(again.ok && again.chat.id).toBe(made.ok && made.chat.id);
    expect(await chats()).toHaveLength(1);

    // A chat already made for nobody gets its person only from a send that may make chats.
    await inAgency(main, (tx) =>
      tx.whatsappConversation.updateMany({ where: { phoneE164: phone }, data: { personId: null } }),
    );
    expect(await inAgency(main, (tx) => sendFrom(tx, { customer, make: false }))).toMatchObject({
      ok: true,
      chat: { personId: null },
    });
    expect(await inAgency(main, (tx) => sendFrom(tx, { customer, make: true }))).toMatchObject({
      ok: true,
      chat: { personId },
    });
    expect((await chats())[0]?.personId).toBe(personId);
  });

  it("passes over a disconnected number the customer last wrote to", async () => {
    const main = await aConnectedAgency(test);
    const second = await aSecondNumber(test, main);
    const phone = freshPhone();
    const onMain = await writes(main, phone, new Date(testNow.getTime() - 2 * HOUR));
    await writes(second, phone, new Date(testNow.getTime() - HOUR));
    await setStatus(second, "disconnected");
    const found = await inAgency(main, (tx) =>
      sendFrom(tx, { customer: { phoneE164: phone, personId: null }, make: false }),
    );
    expect(found).toMatchObject({ ok: true, chat: { id: onMain, connectionId: main.connectionId } });

    // One who wrote only to the disconnected number starts afresh on the main number.
    const other = freshPhone();
    await setStatus(second, "connected");
    await writes(second, other);
    await setStatus(second, "disconnected");
    const fresh = await inAgency(main, (tx) =>
      sendFrom(tx, { customer: { phoneE164: other, personId: null }, make: true }),
    );
    expect(fresh).toMatchObject({ ok: true, chat: { connectionId: main.connectionId, lastInboundAt: null } });
  });

  it("finds the main number: the flagged one, else the oldest live one, connected before setting up", async () => {
    const first = await aConnectedAgency(test);
    const second = await aSecondNumber(test, first, { main: true });
    const third = await aSecondNumber(test, first, { label: "Sales 3" });
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
    expect((await inAgency(first, mainConnection))?.id).toBe(second.connectionId);
    expect(ids(await inAgency(first, liveConnections))).toEqual([
      second.connectionId,
      first.connectionId,
      third.connectionId,
    ]);
    // The flagged number disconnected: the oldest live one is main, and every number is still listed, live ones first.
    await setStatus(second, "disconnected");
    expect((await inAgency(first, mainConnection))?.id).toBe(first.connectionId);
    expect(ids(await inAgency(first, numbersOf))).toEqual([
      first.connectionId,
      third.connectionId,
      second.connectionId,
    ]);
    // The oldest still being set up: a connected one comes first.
    await setStatus(first, "setup");
    expect((await inAgency(first, mainConnection))?.id).toBe(third.connectionId);
    await setStatus(third, "disconnected");
    expect((await inAgency(first, mainConnection))?.id).toBe(first.connectionId);
    await setStatus(first, "disconnected");
    expect(await inAgency(first, mainConnection)).toBeNull();
    expect(
      await inAgency(first, (tx) =>
        sendFrom(tx, { customer: { phoneE164: freshPhone(), personId: null }, make: true }),
      ),
    ).toEqual({
      ok: false,
      code: "not_connected",
    });
  });

  it("takes the same template by name and language on the sending number, and none when it lacks one", async () => {
    const main = await aConnectedAgency(test);
    const second = await aSecondNumber(test, main);
    const template = (connection: TestConnection, name: string, language: string, status = "approved") =>
      inAgency(connection, async (tx) => {
        const row = await tx.whatsappTemplate.create({
          data: { connectionId: connection.connectionId, name, language, category: "utility", body: "Hello", status },
          select: { id: true },
        });
        return row.id;
      });
    const reminder = await template(main, "payment_reminder", "en");
    await template(second, "payment_reminder", "hi");
    const reminderOnSecond = await template(second, "payment_reminder", "en");
    const feedback = await template(main, "feedback_ask", "en");
    await template(second, "feedback_ask", "en", "pending");
    const welcome = await template(main, "welcome", "en");

    const on = (templateId: string, connection: TestConnection) =>
      inAgency(main, (tx) => templateOnNumber(tx, templateId, connection.connectionId));
    expect(await on(reminder, main)).toBe(reminder);
    expect(await on(reminder, second)).toBe(reminderOnSecond);
    expect(await on(feedback, second)).toBeNull();
    expect(await on(welcome, second)).toBeNull();
  });
});

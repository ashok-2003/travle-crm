// The inbox says which number (spec 2026-11-22-multi-number-whatsapp-design.md, section 11): the status lists every number
// with its label, status, main mark and AI switch, live ones first; WhatsApp counts as connected while any number is; each
// chat in the list names its number and the list filters by number; a chat's header names its number and links the
// customer's chats on the agency's other numbers, but only those the member may see.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listConversationsInput } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { conversationHeaderOf, inboxStatusOf, listConversations } from "../../src/inbox/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  aSecondNumber,
  createTestInbox,
  freshPhone,
  lastWroteTo,
  testNow,
  type TestConnection,
  type TestInbox,
} from "./support.js";

describe("the inbox says which number", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const inOrg = <T>(connection: TestConnection, work: (tx: OrgTx) => Promise<T>) =>
    test.db.forOrg(connection.organizationId, work);

  const update = (connection: TestConnection, data: { status?: string; label?: string; aiAnswers?: boolean }) =>
    inOrg(connection, (tx) => tx.whatsappConnection.update({ where: { id: connection.connectionId }, data }));

  const status = (connection: TestConnection) => inOrg(connection, (tx) => inboxStatusOf(tx, true));

  const list = (connection: TestConnection, filters: { connectionId?: string } = {}) =>
    inOrg(connection, (tx) =>
      listConversations(
        tx,
        memberOf(connection.organizationId),
        listConversationsInput.parse({ filter: "all", ...filters }),
        testNow,
      ),
    );

  /** "Sales 1" (main) and "Sales 2", connected. */
  async function twoNumbers() {
    const main = await aConnectedAgency(test);
    await update(main, { label: "Sales 1" });
    const second = await aSecondNumber(test, main, { label: "Sales 2" });
    return { main, second };
  }

  it("lists every number with its label, status, main mark and AI switch, live ones first", async () => {
    // The first number was disconnected and keeps its main flag: it is not main any more.
    const old = await aConnectedAgency(test);
    const sales1 = await aSecondNumber(test, old, { label: "Sales 1" });
    const sales2 = await aSecondNumber(test, old, { label: "Sales 2", status: "paused" });
    await update(sales2, { aiAnswers: false });
    await update(old, { status: "disconnected" });
    const shown = (connection: TestConnection) => ({
      id: connection.connectionId,
      displayNumber: `+${connection.integratedNumber}`,
    });
    expect(await status(old)).toEqual({
      configured: true,
      connected: true,
      connectionStatus: "connected",
      demo: false,
      number: `+${sales1.integratedNumber}`,
      numbers: [
        { ...shown(sales1), label: "Sales 1", status: "connected", main: true, aiAnswers: true },
        { ...shown(sales2), label: "Sales 2", status: "paused", main: false, aiAnswers: false },
        { ...shown(old), label: "WhatsApp", status: "disconnected", main: false, aiAnswers: true },
      ],
    });
  });

  it("says WhatsApp is connected while any number is, and shows each chat's number", async () => {
    const first = await aConnectedAgency(test, { status: "setup" });
    const second = await aSecondNumber(test, first, { status: "setup" });
    expect((await status(first)).connected).toBe(false);
    await update(second, { status: "connected" });
    expect((await status(first)).connected).toBe(true);
    await update(first, { status: "connected" });
    const phone = freshPhone();
    const onSecond = await lastWroteTo(test, phone, second, first);
    const onFirst = await inOrg(first, async (tx) => {
      const chat = await tx.whatsappConversation.findFirstOrThrow({
        where: { connectionId: first.connectionId, phoneE164: phone },
        select: { id: true },
      });
      return chat.id;
    });
    const items = (await list(first)).items.map(({ id, connectionId }) => ({ id, connectionId }));
    expect(items).toEqual(
      expect.arrayContaining([
        { id: onSecond, connectionId: second.connectionId },
        { id: onFirst, connectionId: first.connectionId },
      ]),
    );
    expect(items).toHaveLength(2);
    // Every number disconnected: not connected.
    await update(first, { status: "disconnected" });
    await update(second, { status: "disconnected" });
    expect(await status(first)).toMatchObject({ connected: false, connectionStatus: null, number: null });
  });

  it("filters the chats by number", async () => {
    const { main, second } = await twoNumbers();
    const onSecond = await lastWroteTo(test, freshPhone(), second, main);
    const onMain = await lastWroteTo(test, freshPhone(), main, second);
    const ids = async (connectionId: string) => (await list(main, { connectionId })).items.map((item) => item.id);
    // Each customer has a chat on both numbers.
    expect(await ids(second.connectionId)).toHaveLength(2);
    expect(await ids(second.connectionId)).toContain(onSecond);
    expect(await ids(second.connectionId)).not.toContain(onMain);
    expect(await ids(main.connectionId)).toContain(onMain);
    expect(await ids(main.connectionId)).not.toContain(onSecond);
    expect((await list(main)).items).toHaveLength(4);
  });

  it("names the chat's number in its header and links the customer's chat on another number", async () => {
    const { main, second } = await twoNumbers();
    const third = await aSecondNumber(test, main, { label: "WhatsApp" });
    const phone = freshPhone();
    // The customer wrote to Sales 1, then Sales 2, then the third number, newest last.
    await lastWroteTo(test, phone, second, main, new Date(testNow.getTime() - 3_600_000));
    const onThird = await lastWroteTo(test, phone, third, main);
    const chatOn = (connection: TestConnection) =>
      inOrg(main, async (tx) => {
        const chat = await tx.whatsappConversation.findFirstOrThrow({
          where: { connectionId: connection.connectionId, phoneE164: phone },
          select: { id: true },
        });
        return chat.id;
      });
    const onMain = await chatOn(main);
    const onSecond = await chatOn(second);
    const member = memberOf(main.organizationId);
    const header = await inOrg(main, (tx) => conversationHeaderOf(tx, member, onMain, testNow));
    expect(header.number).toEqual({ id: main.connectionId, label: "Sales 1", status: "connected" });
    expect(header.otherChats).toEqual([
      { id: onThird, label: "WhatsApp" },
      { id: onSecond, label: "Sales 2" },
    ]);
    // A disconnected number's chat stays readable, and says so.
    await update(second, { status: "disconnected" });
    const old = await inOrg(main, (tx) => conversationHeaderOf(tx, member, onSecond, testNow));
    expect(old.number).toEqual({ id: second.connectionId, label: "Sales 2", status: "disconnected" });
    expect(old.otherChats.map((chat) => chat.id)).toEqual([onThird, onMain]);
  });

  it("links no chat the member may not see", async () => {
    const { main, second } = await twoNumbers();
    const phone = freshPhone();
    const onSecond = await lastWroteTo(test, phone, second, main);
    const { onMain, seller } = await inOrg(main, async (tx) => {
      const chat = await tx.whatsappConversation.findFirstOrThrow({
        where: { connectionId: main.connectionId, phoneE164: phone },
        select: { id: true, personId: true },
      });
      // The customer's lead is a salesperson's own; their chat on Sales 2 is linked to no person.
      const owner = memberOf(main.organizationId, "sales");
      await tx.lead.updateMany({ where: { personId: chat.personId ?? "" }, data: { ownerUserId: owner.userId } });
      await tx.whatsappConversation.update({ where: { id: onSecond }, data: { personId: null } });
      return { onMain: chat.id, seller: owner };
    });
    const admin = memberOf(main.organizationId);
    const otherChats = async (member: typeof admin) =>
      (await inOrg(main, (tx) => conversationHeaderOf(tx, member, onMain, testNow))).otherChats;
    expect(await otherChats(admin)).toEqual([{ id: onSecond, label: "Sales 2" }]);
    expect(await otherChats(seller)).toEqual([]);
    // A hidden chat (a blocked contact's) is linked for nobody.
    await inOrg(main, (tx) => tx.whatsappConversation.update({ where: { id: onSecond }, data: { hidden: true } }));
    expect(await otherChats(admin)).toEqual([]);
  });
});

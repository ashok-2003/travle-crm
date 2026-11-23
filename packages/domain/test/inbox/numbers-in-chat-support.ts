// What the in-chat number tests share (multi-number spec, sections 5 and 6): an agency with "Sales 1" (main) and "Sales 2"
// and a customer chatting on both, the sends staff, the AI and automation make, and the check that each chat's messages
// landed in it and went from its number. The tests' inbox comes through `inbox`, as it is made before all of them run.
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { OrgTx } from "@travel-crm/db";
import { tinyPng } from "@travel-crm/integrations/testing";
import { queueMedia, queueTemplate, queueText, requestMediaUpload, type ReplyContext } from "../../src/inbox/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  aSecondNumber,
  deliver,
  freshPhone,
  fromCustomer,
  sentFrom,
  testNow,
  type TestConnection,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;
export const context: ReplyContext = { whatsappConfigured: true };
export const at = (hours: number) => new Date(testNow.getTime() + hours * HOUR);

export function inChatHelpers(inbox: () => TestInbox) {
  /**
   * An agency with "Sales 1" (main) and "Sales 2"; the customer wrote to Sales 2 an hour before testNow and to Sales 1 at
   * testNow. `chat` is theirs on Sales 2, `mainChat` on Sales 1; `chats` both, each with the number it must send from.
   */
  async function agency() {
    const test = inbox();
    const main = await aConnectedAgency(test);
    const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(main.organizationId, work);
    await inOrg((tx) => tx.whatsappConnection.update({ where: { id: main.connectionId }, data: { label: "Sales 1" } }));
    const second = await aSecondNumber(test, main, { label: "Sales 2" });
    const customerNumber = freshPhone().replace("+", "");
    /** The customer writes on the number; the message's id and its chat's. */
    const writes = async (connection: TestConnection, text: string, when: Date) => {
      await deliver(
        test,
        fromCustomer(connection, { customerNumber, text, customerName: "Test Customer", ts: when.getTime() / 1000 }),
        when,
      );
      const message = await inOrg((tx) =>
        tx.whatsappMessage.findFirstOrThrow({
          where: { direction: "in", body: text, conversation: { connectionId: connection.connectionId } },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          select: { id: true, conversationId: true },
        }),
      );
      return { messageId: message.id, conversationId: message.conversationId };
    };
    const { conversationId: chat } = await writes(second, "Goa?", at(-1));
    const { conversationId: mainChat } = await writes(main, "Hello", testNow);
    const chats = [
      { number: second, chat, from: second.integratedNumber },
      { number: main, chat: mainChat, from: main.integratedNumber },
    ];
    /** The message's chat, and the number the worker's sender sent it from. */
    const landed = async (messageId: string, when: Date) => {
      const row = await inOrg((tx) =>
        tx.whatsappMessage.findUniqueOrThrow({ where: { id: messageId }, select: { conversationId: true } }),
      );
      return { chat: row.conversationId, from: await sentFrom(test, main.organizationId, messageId, when) };
    };
    /** The messages queued in each chat (in `chats`' order, all before any is sent) landed there, from its number. */
    const landsEach = async (sent: readonly (readonly string[])[], when: Date) => {
      expect(sent.map((ids) => ids.length > 0)).toEqual([true, true]);
      for (const [index, { chat: queuedIn, from }] of chats.entries()) {
        for (const id of sent[index] ?? []) expect(await landed(id, when)).toEqual({ chat: queuedIn, from });
      }
    };
    const setStatus = (connection: TestConnection, status: string) =>
      inOrg((tx) => tx.whatsappConnection.update({ where: { id: connection.connectionId }, data: { status } }));
    const outgoing = (conversationId: string) =>
      inOrg((tx) =>
        tx.whatsappMessage.findMany({ where: { conversationId, direction: "out" }, orderBy: { id: "asc" } }),
      );
    const template = async (connection: TestConnection, name: string, category = "utility") => {
      const row = await inOrg((tx) =>
        tx.whatsappTemplate.create({
          data: {
            connectionId: connection.connectionId,
            name,
            language: "en",
            category,
            body: "Hello {{1}}, your trip is confirmed.",
            status: "approved",
          },
          select: { id: true },
        }),
      );
      return row.id;
    };
    const member = memberOf(main.organizationId);
    return {
      main,
      second,
      chat,
      mainChat,
      chats,
      member,
      inOrg,
      writes,
      landed,
      landsEach,
      setStatus,
      outgoing,
      template,
    };
  }

  type Agency = Awaited<ReturnType<typeof agency>>;

  const reply = (world: Agency, conversationId: string, when = at(1)) =>
    world.inOrg((tx) =>
      queueText(tx, world.member, { conversationId, clientToken: randomUUID(), text: "On it" }, context, when),
    );

  const sendTemplate = (world: Agency, conversationId: string, templateId: string, when = at(30)) =>
    world.inOrg((tx) =>
      queueTemplate(
        tx,
        world.member,
        { conversationId, templateId, parameters: ["Test"], agreed: false, clientToken: randomUUID() },
        context,
        when,
      ),
    );

  async function sendFile(world: Agency, conversationId: string, when = at(1)) {
    const test = inbox();
    const deps = { db: test.db, files: test.files };
    const slot = await requestMediaUpload(
      deps,
      world.member,
      { conversationId, fileName: "itinerary.png", contentType: "image/png", sizeBytes: tinyPng.byteLength },
      context,
      when,
    );
    await test.storage.upload({ ...slot.upload, expiresAt: new Date(slot.upload.expiresAt) }, tinyPng, "image/png");
    return queueMedia(
      deps,
      world.member,
      {
        conversationId,
        messageId: slot.messageId,
        attachmentId: slot.attachmentId,
        clientToken: randomUUID(),
        caption: "Your itinerary",
      },
      context,
      when,
    );
  }

  const kit = (world: Agency, keywords: string[]) =>
    world.inOrg((tx) =>
      tx.tripKit.create({
        data: { name: "Goa", message: "Goa: itinerary and price", keywords, autoSend: true },
        select: { id: true },
      }),
    );

  const aiTarget = (world: Agency, conversationId: string, when = at(1)) => ({
    organizationId: world.main.organizationId,
    conversationId,
    now: when,
    answers: true,
  });

  return { agency, reply, sendTemplate, sendFile, kit, aiTarget };
}

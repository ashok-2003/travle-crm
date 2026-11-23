// In a chat, the chat's own number (spec 2026-11-22-multi-number-whatsapp-design.md, sections 5 and 6, paths 1-9 and 11):
// every send in a chat is written in that chat and leaves from its number. Each path sends in the customer's chat on
// "Sales 2" and in their chat on the main number "Sales 1", so a path that took whichever live number a lookup returns
// first sends one of the two from the wrong number, whichever it gets (Postgres's row order moves with every write, so
// no one number is reliably that lookup's). The customer last wrote to the main number, so a path that used the
// customer's rule instead is caught too. A chat whose number is disconnected or paused sends nothing, and says why.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { tinyPng } from "@travel-crm/integrations/testing";
import { sendAiText } from "../../src/ai/agent-send.js";
import { tellPaymentOutcome } from "../../src/bookings/payment-messages.js";
import {
  answerAutomatically,
  createKeywordReply,
  queueMedia,
  queueSystemText,
  queueTemplate,
  queueText,
  requestMediaUpload,
  retryMessage,
  runDueWorkFor,
  saveAutomation,
  scheduleMessage,
  sendTripKit,
  sendTripKitOnKeyword,
  type ReplyContext,
} from "../../src/inbox/index.js";
import { newUuidV7, systemActor } from "../../src/kernel/index.js";
import { memberOf } from "../imports/support/test-imports.js";
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
const context: ReplyContext = { whatsappConfigured: true };
const at = (hours: number) => new Date(testNow.getTime() + hours * HOUR);

describe("a send in a chat goes from the chat's own number", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /**
   * An agency with "Sales 1" (main) and "Sales 2"; the customer wrote to Sales 2 an hour before testNow and to Sales 1 at
   * testNow. `chat` is theirs on Sales 2, `mainChat` on Sales 1; `chats` both, each with the number it must send from.
   */
  async function agency() {
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
    return { main, second, chat, mainChat, chats, member, inOrg, writes, landed, setStatus, outgoing, template };
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

  it("sends a staff reply and a file from the chat's number when the agency has two", async () => {
    const world = await agency();
    for (const { chat, from } of world.chats) {
      const text = await reply(world, chat);
      expect(await world.landed(text.messageId, at(1))).toEqual({ chat, from });
      const file = await sendFile(world, chat);
      expect(await world.landed(file.messageId, at(1))).toEqual({ chat, from });
    }
  });

  it("sends a template in a chat from the chat's number, and refuses another number's template", async () => {
    const world = await agency();
    const templates = [
      await world.template(world.second, "trip_update"),
      await world.template(world.main, "trip_update"),
    ];
    for (const [index, { chat, from }] of world.chats.entries()) {
      const sent = await sendTemplate(world, chat, templates[index] ?? "");
      expect(await world.landed(sent.messageId, at(30))).toEqual({ chat, from });
      await expect(sendTemplate(world, chat, templates[1 - index] ?? "")).rejects.toMatchObject({
        reason: "TEMPLATE_NOT_APPROVED",
      });
      expect(await world.outgoing(chat)).toHaveLength(1);
    }
  });

  it("tries a failed message again from the chat's number", async () => {
    const world = await agency();
    for (const { chat, from } of world.chats) {
      const queued = await reply(world, chat);
      test.provider.failNext("other");
      expect(await sentFrom(test, world.main.organizationId, queued.messageId, at(1))).toBeNull();
      const again = await world.inOrg((tx) => retryMessage(tx, world.member, queued.messageId, context, at(2)));
      expect(again).toMatchObject({ messageId: queued.messageId, status: "queued" });
      expect(await world.landed(queued.messageId, at(2))).toEqual({ chat, from });
    }
  });

  it("sends a staff trip kit and a keyword trip kit from the chat's number", async () => {
    const world = await agency();
    const { id: tripKitId } = await kit(world, ["kerala"]);
    // The agency's AI agent is off (no settings at all), so a keyword sends the kit by itself.
    for (const { number, chat, from } of world.chats) {
      const staff = await sendTripKit(
        test.dependencies,
        world.member,
        { conversationId: chat, tripKitId, clientToken: randomUUID() },
        context,
        at(1),
      );
      expect(staff).toEqual({ queued: 1, refused: null });
      const said = await world.writes(number, "Any Kerala trips?", at(2));
      expect(said.conversationId).toBe(chat);
      const actor = systemActor(world.main.organizationId);
      expect(await sendTripKitOnKeyword(test.dependencies, actor, said, at(2))).toBe(true);
      const sent = await world.outgoing(chat);
      expect(sent.map((message) => message.origin)).toEqual(["staff_crm", "automation"]);
      for (const message of sent) {
        expect(await world.landed(message.id, at(2))).toEqual({ chat, from });
      }
    }
  });

  it("sends a scheduled message from the chat's number", async () => {
    const world = await agency();
    for (const { chat } of world.chats) {
      await world.inOrg((tx) =>
        scheduleMessage(
          tx,
          world.member,
          { conversationId: chat, body: "Your quote is ready", sendAt: at(2).toISOString() },
          testNow,
        ),
      );
    }
    expect(await runDueWorkFor(test.dependencies, world.main.organizationId, at(3))).toBe(2);
    for (const { chat, from } of world.chats) {
      const [sent] = await world.outgoing(chat);
      expect(sent).toMatchObject({ body: "Your quote is ready", origin: "staff_crm" });
      expect(await world.landed(sent?.id ?? "", at(3))).toEqual({ chat, from });
    }
  });

  it("sends the away, welcome and keyword answers from the chat's number", async () => {
    const world = await agency();
    await world.inOrg(async (tx) => {
      await saveAutomation(tx, world.member, {
        welcomeEnabled: true,
        welcomeMessage: "Welcome!",
        awayEnabled: true,
        awayMessage: "We are closed",
        openFrom: 600,
        openUntil: 1140,
        openDays: [],
      });
      await createKeywordReply(tx, world.member, { keyword: "price", reply: "Prices start at Rs 9,999" });
    });
    for (const { number, chat, from } of world.chats) {
      const answer = async (text: string, hours: number, firstEver: boolean) => {
        const said = await world.writes(number, text, at(hours));
        return world.inOrg((tx) =>
          answerAutomatically(tx, { ...said, eventId: randomUUID(), firstEver, timeZone: "Asia/Kolkata" }, at(hours)),
        );
      };
      expect(await answer("Hi there", 1, true)).toBe("welcome");
      expect(await answer("What is the price?", 2, false)).toBe("keyword");
      expect(await answer("Anyone there?", 3, false)).toBe("away");
      const sent = await world.outgoing(chat);
      expect(sent.map((message) => message.body)).toEqual(["Welcome!", "Prices start at Rs 9,999", "We are closed"]);
      for (const message of sent) {
        expect(await world.landed(message.id, at(3))).toEqual({ chat, from });
      }
    }
  });

  it("sends the AI's reply, file and card from the chat's number", async () => {
    const world = await agency();
    const buttons = [
      { id: "book", title: "Book" },
      { id: "change", title: "Change" },
    ];
    for (const { chat, from } of world.chats) {
      const target = aiTarget(world, chat);
      const replyId = await world.inOrg((tx) => sendAiText(tx, target, randomUUID(), "Goa in March?", "reply"));
      const fileId = newUuidV7();
      await test.files.storeGeneratedFile(systemActor(world.main.organizationId), {
        recordType: WHATSAPP_RECORD_TYPE,
        recordId: fileId,
        fileName: "goa.png",
        contentType: "image/png",
        body: tinyPng,
        attachmentId: fileId,
      });
      const media = { messageId: fileId, kind: "image" as const, fileName: "goa.png" };
      const fileSent = await world.inOrg((tx) => sendAiText(tx, target, randomUUID(), "The Goa trip", "file", media));
      const card = await world.inOrg((tx) =>
        sendAiText(tx, target, randomUUID(), "Shall I book it?", "reply", undefined, buttons),
      );
      expect(fileSent).toBe(fileId);
      for (const id of [replyId, fileSent, card]) {
        expect(await world.landed(id, at(1))).toEqual({ chat, from });
      }
    }
  });

  it("sends a payment message in the booking's chat from that chat's number", async () => {
    const world = await agency();
    for (const { chat, from } of world.chats) {
      const told = await world.inOrg((tx) =>
        tellPaymentOutcome(
          tx,
          {
            organizationId: world.main.organizationId,
            leadId: null,
            conversationId: chat,
            outcome: "confirmed",
            amountPaise: 1_250_000,
            trip: "Goa 4N",
            recordKey: randomUUID(),
          },
          at(1),
        ),
      );
      expect(told).toBe("sent");
      const sent = await world.outgoing(chat);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.body).toContain("Thank you Test!");
      expect(await world.landed(sent[0]?.id ?? "", at(1))).toEqual({ chat, from });
    }
  });

  it("refuses every send in a chat whose number was disconnected, and tells staff why", async () => {
    const world = await agency();
    const failed = await reply(world, world.chat);
    test.provider.failNext("other");
    await sentFrom(test, world.main.organizationId, failed.messageId, at(1));
    const template = await world.template(world.second, "trip_update");
    const { id: tripKitId } = await kit(world, ["goa"]);
    const said = await world.writes(world.second, "Goa in March?", at(2));
    await world.setStatus(world.second, "disconnected");
    const before = await world.outgoing(world.chat);

    const disconnected = { reason: "WHATSAPP_NUMBER_DISCONNECTED" };
    await expect(reply(world, world.chat, at(2))).rejects.toMatchObject(disconnected);
    await expect(sendFile(world, world.chat, at(2))).rejects.toMatchObject(disconnected);
    await expect(sendTemplate(world, world.chat, template)).rejects.toMatchObject(disconnected);
    await expect(
      world.inOrg((tx) => retryMessage(tx, world.member, failed.messageId, context, at(2))),
    ).rejects.toMatchObject(disconnected);
    await expect(
      sendTripKit(
        test.dependencies,
        world.member,
        { conversationId: world.chat, tripKitId, clientToken: randomUUID() },
        context,
        at(2),
      ),
    ).rejects.toMatchObject(disconnected);
    // What the system sends by itself is refused as "not connected", as for any number that can't send (MN2).
    expect(
      await world.inOrg((tx) =>
        queueSystemText(
          tx,
          {
            conversationId: world.chat,
            body: "Later",
            sentBy: null,
            origin: "automation",
            clientToken: randomUUID(),
            answers: false,
          },
          at(2),
        ),
      ),
    ).toEqual({ ok: false, code: "not_connected" });
    expect(await sendTripKitOnKeyword(test.dependencies, systemActor(world.main.organizationId), said, at(2))).toBe(
      false,
    );
    await expect(
      world.inOrg((tx) => sendAiText(tx, aiTarget(world, world.chat, at(2)), randomUUID(), "Goa?", "reply")),
    ).rejects.toMatchObject({ reason: "WHATSAPP_NOT_CONNECTED" });
    expect(await world.outgoing(world.chat)).toEqual(before);
    // The chat on the main number still sends.
    const onMain = await reply(world, world.mainChat, at(2));
    expect(await world.landed(onMain.messageId, at(2))).toEqual({
      chat: world.mainChat,
      from: world.main.integratedNumber,
    });
  });

  it("refuses sends only in the paused number's chats", async () => {
    const world = await agency();
    await world.setStatus(world.main, "paused");
    await expect(reply(world, world.mainChat)).rejects.toMatchObject({ reason: "WHATSAPP_PAUSED" });
    const sent = await reply(world, world.chat);
    expect(await world.landed(sent.messageId, at(1))).toEqual({
      chat: world.chat,
      from: world.second.integratedNumber,
    });

    await world.setStatus(world.main, "connected");
    await world.setStatus(world.second, "paused");
    await expect(reply(world, world.chat)).rejects.toMatchObject({ reason: "WHATSAPP_PAUSED" });
    const system = (conversationId: string) =>
      world.inOrg((tx) =>
        queueSystemText(
          tx,
          {
            conversationId,
            body: "Later",
            sentBy: null,
            origin: "automation",
            clientToken: randomUUID(),
            answers: false,
          },
          at(1),
        ),
      );
    expect(await system(world.chat)).toEqual({ ok: false, code: "paused" });
    expect(await system(world.mainChat)).toMatchObject({ ok: true });
  });

  it("counts the day's template cap and the month's marketing cap on the chat's number alone", async () => {
    const world = await agency();
    const mainUtility = await world.template(world.main, "trip_update");
    const mainMarketing = await world.template(world.main, "offer_update", "marketing");
    const ownUtility = await world.template(world.second, "trip_update");
    const ownMarketing = await world.template(world.second, "offer_update", "marketing");
    await world.inOrg((tx) => tx.whatsappConnection.updateMany({ data: { marketingCapMonth: 1, templateCapDay: 2 } }));

    // The main number uses up both its caps.
    await sendTemplate(world, world.mainChat, mainMarketing);
    await sendTemplate(world, world.mainChat, mainUtility);
    await expect(sendTemplate(world, world.mainChat, mainUtility)).rejects.toMatchObject({
      reason: "TEMPLATE_CAP_REACHED",
    });
    // Sales 2's caps are its own: its marketing message and a utility one still go.
    await sendTemplate(world, world.chat, ownMarketing);
    await expect(sendTemplate(world, world.chat, ownMarketing)).rejects.toMatchObject({
      reason: "MARKETING_CAP_REACHED",
    });
    await sendTemplate(world, world.chat, ownUtility);
    await expect(sendTemplate(world, world.chat, ownUtility)).rejects.toMatchObject({
      reason: "TEMPLATE_CAP_REACHED",
    });
  });
});

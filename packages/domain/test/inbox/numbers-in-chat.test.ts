// In a chat, the chat's own number (spec 2026-11-22-multi-number-whatsapp-design.md, sections 5 and 6, paths 1-9 and 11):
// every send in a chat is written in that chat and leaves from its number. Each path sends in the customer's chat on
// "Sales 2" and in their chat on the main number "Sales 1", both queued before the worker sends any: a send or a
// customer's message rewrites a number's row, and Postgres's row order moves with every write, so no one number is
// reliably what a lookup taking the first live number finds, but with no write between them both sends meet the same
// one, and a path that used it sends one of the two from the wrong number. The customer last wrote to the main number, so
// a path that used the customer's rule instead is caught too. Refusals are in numbers-in-chat-refusals.test.ts.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { tinyPng } from "@travel-crm/integrations/testing";
import { sendAiText } from "../../src/ai/agent-send.js";
import { tellPaymentOutcome } from "../../src/bookings/payment-messages.js";
import {
  answerAutomatically,
  createKeywordReply,
  retryMessage,
  runDueWorkFor,
  saveAutomation,
  scheduleMessage,
  sendTripKit,
  sendTripKitOnKeyword,
} from "../../src/inbox/index.js";
import { newUuidV7, systemActor } from "../../src/kernel/index.js";
import { createTestInbox, sentFrom, testNow, type TestInbox } from "./support.js";
import { at, context, inChatHelpers } from "./numbers-in-chat-support.js";

describe("a send in a chat goes from the chat's own number", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());
  const { agency, reply, sendTemplate, sendFile, kit, aiTarget } = inChatHelpers(() => test);

  it("sends a staff reply and a file from the chat's number when the agency has two", async () => {
    const world = await agency();
    const sent: string[][] = [];
    for (const { chat } of world.chats) {
      sent.push([(await reply(world, chat)).messageId, (await sendFile(world, chat)).messageId]);
    }
    await world.landsEach(sent, at(1));
  });

  it("sends a template in a chat from the chat's number, and refuses another number's template", async () => {
    const world = await agency();
    const templates = [
      await world.template(world.second, "trip_update"),
      await world.template(world.main, "trip_update"),
    ];
    const sent: string[][] = [];
    for (const [index, { chat }] of world.chats.entries()) {
      sent.push([(await sendTemplate(world, chat, templates[index] ?? "")).messageId]);
      await expect(sendTemplate(world, chat, templates[1 - index] ?? "")).rejects.toMatchObject({
        reason: "TEMPLATE_NOT_APPROVED",
      });
      expect(await world.outgoing(chat)).toHaveLength(1);
    }
    await world.landsEach(sent, at(30));
  });

  it("tries a failed message again from the chat's number", async () => {
    const world = await agency();
    const queued: string[] = [];
    for (const { chat } of world.chats) queued.push((await reply(world, chat)).messageId);
    for (const messageId of queued) {
      test.provider.failNext("other");
      expect(await sentFrom(test, world.main.organizationId, messageId, at(1))).toBeNull();
    }
    for (const messageId of queued) {
      const again = await world.inOrg((tx) => retryMessage(tx, world.member, messageId, context, at(2)));
      expect(again).toEqual({ messageId, status: "queued" });
    }
    await world.landsEach(
      queued.map((messageId) => [messageId]),
      at(2),
    );
  });

  it("sends a staff trip kit and a keyword trip kit from the chat's number", async () => {
    const world = await agency();
    const { id: tripKitId } = await kit(world, ["kerala"]);
    for (const { chat } of world.chats) {
      const staff = await sendTripKit(
        test.dependencies,
        world.member,
        { conversationId: chat, tripKitId, clientToken: randomUUID() },
        context,
        at(1),
      );
      expect(staff).toEqual({ queued: 1, refused: null });
    }
    // The agency's AI agent is off (no settings at all), so a keyword sends the kit by itself.
    const said = [];
    for (const { number } of world.chats) said.push(await world.writes(number, "Any Kerala trips?", at(2)));
    expect(said.map((message) => message.conversationId)).toEqual(world.chats.map(({ chat }) => chat));
    const actor = systemActor(world.main.organizationId);
    for (const message of said) expect(await sendTripKitOnKeyword(test.dependencies, actor, message, at(2))).toBe(true);
    const sent: string[][] = [];
    for (const { chat } of world.chats) {
      const rows = await world.outgoing(chat);
      expect(rows.map((message) => message.origin)).toEqual(["staff_crm", "automation"]);
      sent.push(rows.map((message) => message.id));
    }
    await world.landsEach(sent, at(2));
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
    const sent: string[][] = [];
    for (const { chat } of world.chats) {
      const rows = await world.outgoing(chat);
      expect(rows).toMatchObject([{ body: "Your quote is ready", origin: "staff_crm" }]);
      sent.push(rows.map((message) => message.id));
    }
    await world.landsEach(sent, at(3));
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
    const texts = ["Hi there", "What is the price?", "Anyone there?"];
    const said = [];
    for (const { number } of world.chats) {
      const messages = [];
      for (const [hour, text] of texts.entries()) messages.push(await world.writes(number, text, at(hour + 1)));
      said.push(messages);
    }
    for (const messages of said) {
      const answers = [];
      for (const [hour, message] of messages.entries()) {
        const input = { ...message, eventId: randomUUID(), firstEver: hour === 0, timeZone: "Asia/Kolkata" };
        answers.push(await world.inOrg((tx) => answerAutomatically(tx, input, at(hour + 1))));
      }
      expect(answers).toEqual(["welcome", "keyword", "away"]);
    }
    const sent: string[][] = [];
    for (const { chat } of world.chats) {
      const rows = await world.outgoing(chat);
      expect(rows.map((message) => message.body)).toEqual(["Welcome!", "Prices start at Rs 9,999", "We are closed"]);
      sent.push(rows.map((message) => message.id));
    }
    await world.landsEach(sent, at(3));
  });

  it("sends the AI's reply, file and card from the chat's number", async () => {
    const world = await agency();
    const buttons = [
      { id: "book", title: "Book" },
      { id: "change", title: "Change" },
    ];
    const sent: string[][] = [];
    for (const { chat } of world.chats) {
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
        sendAiText(tx, target, randomUUID(), "Shall I book it?", "reply", undefined, { buttons }),
      );
      expect(fileSent).toBe(fileId);
      sent.push([replyId, fileSent, card]);
    }
    await world.landsEach(sent, at(1));
  });

  it("sends a payment message in the booking's chat from that chat's number", async () => {
    const world = await agency();
    for (const { chat } of world.chats) {
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
    }
    const sent: string[][] = [];
    for (const { chat } of world.chats) {
      const rows = await world.outgoing(chat);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.body).toContain("Thank you Test!");
      sent.push(rows.map((message) => message.id));
    }
    await world.landsEach(sent, at(1));
  });
});

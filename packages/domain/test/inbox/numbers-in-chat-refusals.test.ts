// In a chat whose number can't send, nothing goes (multi-number spec, sections 5 and 6, Review Focus 3): a disconnected
// number's chat refuses staff, the AI and automation alike and says why, a paused number holds only its own chats, and
// the day's and month's template caps count each number's messages alone. A refusal is never a send from another number.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendAiText } from "../../src/ai/agent-send.js";
import { queueSystemText, retryMessage, sendTripKit, sendTripKitOnKeyword } from "../../src/inbox/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { sendToChat } from "../../src/sales/index.js";
import { createTestInbox, sentFrom, type TestInbox } from "./support.js";
import { at, context, inChatHelpers } from "./numbers-in-chat-support.js";

describe("a chat whose number can't send sends nothing", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());
  const { agency, reply, sendTemplate, sendFile, kit, aiTarget } = inChatHelpers(() => test);

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
    // A payment message in the booking's chat outside the window queues no template there either (path 11).
    const row = await world.inOrg((tx) => tx.whatsappConversation.findUniqueOrThrow({ where: { id: world.chat } }));
    const payment = { organizationId: world.main.organizationId, templateId: template, params: ["Test"] };
    expect(
      await world.inOrg((tx) =>
        sendToChat(
          tx,
          { ...row, personId: row.personId ?? "" },
          { ...payment, agreed: true, clientToken: randomUUID() },
          at(30),
        ),
      ),
    ).toEqual({ kind: "later", reason: "not_connected" });
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

// The live stream's domain part (inbox revamp spec, part 1 item 4): a customer's message and a delivery report, processed as
// the worker does, notify inbox_live with the chat's ids alone; who may hear of a chat is the list's own rule (scope.ts),
// read from the chat's audience; and only the triggers' payloads are taken as notifications.
import { randomUUID } from "node:crypto";
import { INBOX_LIVE_CHANNEL, listenForNotifications, type NotificationListener } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PermissionSet, type Grant, type MemberAccess } from "../../src/identity/index.js";
import { chatAudienceOf, maySeeChat, parseInboxNotification } from "../../src/inbox/index.js";
import { aLead, aPerson } from "../crm/support/records.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  statusFor,
  type TestInbox,
} from "./support.js";

function memberHolding(grants: Grant[], userId: string = randomUUID()): MemberAccess {
  return {
    userId,
    memberId: randomUUID(),
    organizationId: randomUUID(),
    source: "web",
    impersonatedBy: null,
    role: { key: "custom", name: "Custom", isOwner: false },
    permissions: PermissionSet.of(grants),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
}

describe("who may hear of a chat", () => {
  const seller = randomUUID();
  const everyChat = memberHolding([{ permission: "inbox:view", scope: "all" }]);
  const ownChatsAllLeads = memberHolding([
    { permission: "inbox:view", scope: "own" },
    { permission: "leads:view", scope: "all" },
  ]);
  const ownChatsOwnLeads = memberHolding(
    [
      { permission: "inbox:view", scope: "own" },
      { permission: "leads:view", scope: "own" },
    ],
    seller,
  );
  const noInbox = memberHolding([{ permission: "leads:view", scope: "all" }]);

  it("follows the list's rule: every chat, chats with a lead, chats with one of their leads, none", () => {
    const sellers = { listed: true, leadOwners: [seller] };
    const unassigned = { listed: true, leadOwners: [null] };
    const noLead = { listed: true, leadOwners: [] };
    expect([sellers, unassigned, noLead].map((audience) => maySeeChat(everyChat, audience))).toEqual([
      true,
      true,
      true,
    ]);
    expect([sellers, unassigned, noLead].map((audience) => maySeeChat(ownChatsAllLeads, audience))).toEqual([
      true,
      true,
      false,
    ]);
    expect([sellers, unassigned, noLead].map((audience) => maySeeChat(ownChatsOwnLeads, audience))).toEqual([
      true,
      false,
      false,
    ]);
    expect(maySeeChat(noInbox, sellers)).toBe(false);
  });

  it("tells nobody of a chat the list doesn't show (a blocked contact's, a closed one)", () => {
    expect(maySeeChat(everyChat, { listed: false, leadOwners: [] })).toBe(false);
  });

  it("takes the triggers' payloads and nothing else", () => {
    const organizationId = randomUUID();
    const conversationId = randomUUID();
    expect(
      parseInboxNotification(JSON.stringify({ organizationId, conversationId, change: "message", direction: "in" })),
    ).toEqual({ organizationId, conversationId, change: "message", direction: "in" });
    expect(parseInboxNotification(JSON.stringify({ organizationId, conversationId, change: "typed" }))).toBeNull();
    expect(parseInboxNotification("marker-1")).toBeNull();
  });
});

describe("the live stream's notifications, from the worker's processing", () => {
  let test: TestInbox;
  let listener: NotificationListener;
  const heard: string[] = [];

  beforeAll(async () => {
    test = createTestInbox();
    listener = listenForNotifications(inject("dbUrls").runtime, INBOX_LIVE_CHANNEL, {
      onNotification: (payload) => heard.push(payload),
    });
    await listener.listening;
  });
  afterAll(async () => {
    await listener.close();
    await test.close();
  });

  /** The notifications about a chat heard so far, read as the api reads them. */
  async function heardOf(conversationId: string, change: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const found = heard
        .map(parseInboxNotification)
        .filter((event) => event?.conversationId === conversationId && event.change === change);
      if (found.length > 0) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return [];
  }

  it("tells of a customer's message as the customer's, and of its chat's audience", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    await deliver(test, fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Goa?" }));
    const chat = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow({ where: { phoneE164: phone }, select: { id: true } }),
    );
    expect(await heardOf(chat.id, "message")).toContainEqual({
      organizationId: connection.organizationId,
      conversationId: chat.id,
      change: "message",
      direction: "in",
    });
    // The new number became a lead with an owner: who may hear of it is read from it.
    const audience = await chatAudienceOf(test.db, connection.organizationId, chat.id);
    expect(audience.listed).toBe(true);
    expect(audience.leadOwners).toHaveLength(1);
  });

  it("tells of a delivery report as a status, without the customer's mark", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    const wamid = `wamid.OUT-${customerNumber}`;
    const chatId = await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: `+${customerNumber}` },
        select: { id: true },
      });
      await tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Hi",
          wamid,
          status: "sent",
          occurredAt: new Date(),
          sentAt: new Date(),
        },
      });
      return chat.id;
    });
    await deliver(test, statusFor(connection, { customerNumber, wamid, eventName: "delivered" }));
    expect(await heardOf(chatId, "status")).toEqual([
      { organizationId: connection.organizationId, conversationId: chatId, change: "status" },
    ]);
  });

  it("reads a chat's audience: its person's live leads' owners, and whether the list shows it", async () => {
    const connection = await aConnectedAgency(test);
    const owner = randomUUID();
    const { chatId, hiddenId } = await test.db.forOrg(connection.organizationId, async (tx) => {
      const person = await aPerson(tx);
      await aLead(tx, { personId: person.id, ownerUserId: owner });
      await aLead(tx, { personId: person.id, ownerUserId: null, stage: "lost" });
      const deleted = await aLead(tx, { personId: person.id, ownerUserId: randomUUID() });
      await tx.lead.update({ where: { id: deleted.id }, data: { deletedAt: new Date(), deletedBy: owner } });
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: freshPhone(), personId: person.id },
      });
      const hidden = await tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: freshPhone(), hidden: true },
      });
      return { chatId: chat.id, hiddenId: hidden.id };
    });
    const audience = await chatAudienceOf(test.db, connection.organizationId, chatId);
    expect(audience.listed).toBe(true);
    expect([...audience.leadOwners].sort()).toEqual([owner, null].sort());
    expect(await chatAudienceOf(test.db, connection.organizationId, hiddenId)).toEqual({
      listed: false,
      leadOwners: [],
    });
    expect(await chatAudienceOf(test.db, connection.organizationId, randomUUID())).toEqual({
      listed: false,
      leadOwners: [],
    });
  });
});

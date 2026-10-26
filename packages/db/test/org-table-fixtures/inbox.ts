// Isolation fixtures for the inbox module (WhatsApp): a connection, a chat, a message, a template, a month's usage, and the
// sales inbox's tags, tags on chats, quick replies, read marks, scheduled sends, automatic answers, keyword replies and
// broadcasts (tags, quick replies and keyword replies are soft-deleted). The
// runtime role changes but never deletes any of them (a chat is erased by emptying it). The number route and the unrouted
// numbers are not here: they have no row-level security (unscopedScheduleTables in org-table-fixtures.ts, and
// unscoped-tables.test.ts).
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const digits = () => `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

// Disconnected, so several fit in one organization (one live number each, phase 1).
const aConnection = (tx: OrgTx) =>
  tx.whatsappConnection.create({
    data: { integratedNumber: digits(), displayNumber: "+910000000000", mode: "new_number", status: "disconnected" },
  });

const aConversation = async (tx: OrgTx) =>
  tx.whatsappConversation.create({
    data: { connectionId: (await aConnection(tx)).id, phoneE164: `+91${digits().slice(2)}` },
  });

const aBroadcast = async (tx: OrgTx) =>
  tx.whatsappBroadcast.create({
    data: {
      requestId: randomUUID(),
      templateId: (
        await tx.whatsappTemplate.create({
          data: {
            connectionId: (await aConnection(tx)).id,
            name: "broadcast_isolation",
            language: "en",
            category: "marketing",
            body: "Hello",
            status: "approved",
          },
        })
      ).id,
      createdBy: randomUUID(),
    },
  });

export const fixtures: OrgTableFixtures = {
  whatsapp_connection: { create: aConnection, undeletable: true },
  whatsapp_conversation: { create: aConversation, undeletable: true },
  whatsapp_message: {
    create: async (tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: (await aConversation(tx)).id,
          direction: "in",
          origin: "customer",
          kind: "text",
          body: "Isolation",
          wamid: randomUUID(),
          status: "received",
          occurredAt: new Date(),
        },
      }),
    undeletable: true,
  },
  whatsapp_template: {
    create: async (tx) =>
      tx.whatsappTemplate.create({
        data: {
          connectionId: (await aConnection(tx)).id,
          name: "isolation",
          language: "en",
          category: "utility",
          body: "Hello",
          status: "approved",
        },
      }),
    undeletable: true,
  },
  whatsapp_usage_month: {
    create: async (tx) =>
      tx.whatsappUsageMonth.create({
        data: { connectionId: (await aConnection(tx)).id, month: new Date("2026-10-01T00:00:00Z") },
      }),
    undeletable: true,
  },
  inbox_tag: {
    create: (tx) => tx.inboxTag.create({ data: { name: `Isolation ${randomUUID().slice(0, 8)}` } }),
    undeletable: true,
  },
  conversation_tag: {
    create: async (tx) =>
      tx.conversationTag.create({
        data: {
          conversationId: (await aConversation(tx)).id,
          tagId: (await tx.inboxTag.create({ data: { name: `Isolation ${randomUUID().slice(0, 8)}` } })).id,
        },
      }),
  },
  inbox_quick_reply: {
    create: (tx) =>
      tx.inboxQuickReply.create({
        data: { shortcut: `iso-${randomUUID().slice(0, 8)}`, title: "Isolation", body: "Hello" },
      }),
    undeletable: true,
  },
  conversation_read: {
    create: async (tx) =>
      tx.conversationRead.create({
        data: { conversationId: (await aConversation(tx)).id, userId: randomUUID(), readAt: new Date() },
      }),
  },
  scheduled_message: {
    create: async (tx) =>
      tx.scheduledMessage.create({
        data: {
          conversationId: (await aConversation(tx)).id,
          body: "Isolation",
          sendAt: new Date(Date.now() + 3_600_000),
          createdBy: randomUUID(),
        },
      }),
    undeletable: true,
  },
  inbox_automation: {
    // One for each organization, which its row-level default fills in.
    create: (tx) => tx.inboxAutomation.create({ data: {} }),
    undeletable: true,
  },
  inbox_keyword_reply: {
    create: (tx) =>
      tx.inboxKeywordReply.create({ data: { keyword: `iso${randomUUID().slice(0, 8)}`, reply: "Hello" } }),
    undeletable: true,
  },
  whatsapp_broadcast: { create: aBroadcast, undeletable: true },
  whatsapp_broadcast_tag: {
    create: async (tx) =>
      tx.whatsappBroadcastTag.create({
        data: {
          broadcastId: (await aBroadcast(tx)).id,
          tagId: (await tx.inboxTag.create({ data: { name: `Isolation ${randomUUID().slice(0, 8)}` } })).id,
        },
      }),
    undeletable: true,
  },
  whatsapp_broadcast_recipient: {
    create: async (tx) =>
      tx.whatsappBroadcastRecipient.create({
        data: { broadcastId: (await aBroadcast(tx)).id, conversationId: (await aConversation(tx)).id },
      }),
    undeletable: true,
  },
};

// Isolation fixtures for the inbox module (WhatsApp): a connection, a chat, a message, a template and a month's usage. The
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
};

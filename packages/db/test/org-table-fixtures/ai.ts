// Isolation fixtures for suggest reply: the agency's AI settings, a month's usage and a draft. The runtime role deletes
// none of them.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const digits = () => `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

export const fixtures: OrgTableFixtures = {
  ai_settings: { create: (tx) => tx.aiSettings.create({ data: { enabled: true } }), undeletable: true },
  ai_usage: {
    create: (tx) => tx.aiUsage.create({ data: { month: new Date("2026-11-01"), suggestions: 1 } }),
    undeletable: true,
  },
  ai_draft: {
    create: async (tx: OrgTx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: digits(),
          displayNumber: "+910000000000",
          mode: "new_number",
          status: "disconnected",
        },
      });
      const conversation = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+91${digits().slice(2)}` },
      });
      return tx.aiDraft.create({
        data: { conversationId: conversation.id, draftedBy: randomUUID(), model: "isolation", textHash: "0" },
      });
    },
    undeletable: true,
  },
};

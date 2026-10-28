// Isolation fixtures for the AI: the agency's settings, a month's usage, a draft, a piece of knowledge and a lead's insight. The runtime role deletes
// none of them.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const digits = () => `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

export const fixtures: OrgTableFixtures = {
  ai_settings: { create: (tx) => tx.aiSettings.create({ data: { enabled: true } }), undeletable: true },
  ai_usage: {
    create: (tx) => tx.aiUsage.create({ data: { month: new Date("2026-11-01"), calls: 1 } }),
    undeletable: true,
  },
  ai_knowledge: {
    create: (tx) => tx.aiKnowledge.create({ data: { title: "Isolation", body: "Manali" } }),
    undeletable: true,
  },
  lead_ai_insight: {
    create: async (tx: OrgTx) =>
      tx.leadAiInsight.create({
        data: {
          leadId: (
            await tx.lead.create({
              data: {
                personId: (
                  await tx.person.create({
                    data: { name: "Isolation person", email: `ai-${randomUUID()}@example.test` },
                  })
                ).id,
                source: "walk_in",
              },
            })
          ).id,
          score: 50,
          label: "warm",
        },
      }),
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

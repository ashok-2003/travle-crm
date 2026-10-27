// Isolation fixtures for the AI sales agent: its settings, a piece of knowledge, a chat's AI state, a lead's insight and
// a usage row. The runtime role deletes none of them, and never changes a usage row.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const digits = () => String(Math.floor(Math.random() * 1e10)).padStart(10, "0");

const aConversation = async (tx: OrgTx) =>
  tx.whatsappConversation.create({
    data: {
      connectionId: (
        await tx.whatsappConnection.create({
          data: {
            integratedNumber: `91${digits()}`,
            displayNumber: "+910000000000",
            mode: "new_number",
            status: "disconnected",
          },
        })
      ).id,
      phoneE164: `+91${digits()}`,
    },
  });

const aLead = async (tx: OrgTx) =>
  tx.lead.create({
    data: {
      personId: (
        await tx.person.create({ data: { name: "Isolation person", email: `ai-${randomUUID()}@example.test` } })
      ).id,
      source: "walk_in",
    },
  });

export const fixtures: OrgTableFixtures = {
  ai_settings: { create: (tx) => tx.aiSettings.create({ data: {} }), undeletable: true },
  ai_knowledge: {
    create: (tx) => tx.aiKnowledge.create({ data: { title: "Isolation", body: "Manali" } }),
    undeletable: true,
  },
  ai_chat: {
    create: async (tx) => tx.aiChat.create({ data: { conversationId: (await aConversation(tx)).id } }),
    undeletable: true,
  },
  lead_ai_insight: {
    create: async (tx) => tx.leadAiInsight.create({ data: { leadId: (await aLead(tx)).id, score: 50, label: "warm" } }),
    undeletable: true,
  },
  ai_usage: { create: (tx) => tx.aiUsage.create({ data: { kind: "test", model: "isolation" } }), appendOnly: true },
};

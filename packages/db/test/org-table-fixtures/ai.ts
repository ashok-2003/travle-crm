// Isolation fixtures for the AI: the agency's settings, a month's usage, a draft, a piece of knowledge, a lead's insight, a
// file it sends and a booking it took. The runtime role deletes none of them.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const digits = () => `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

export const fixtures: OrgTableFixtures = {
  ai_fill: {
    create: (tx) =>
      tx.aiFill.create({
        data: { target: "lead", requestedBy: randomUUID(), inputKind: "text", model: "isolation", proposalHash: "x" },
      }),
    undeletable: true,
  },
  lead_ai_field: {
    create: async (tx: OrgTx) => {
      const person = await tx.person.create({ data: { name: "Isolation", email: `ai-${randomUUID()}@example.test` } });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "walk_in" } });
      return tx.leadAiField.create({ data: { leadId: lead.id, field: "destination", valueHash: "x" } });
    },
    undeletable: true,
  },
  ai_settings: { create: (tx) => tx.aiSettings.create({ data: { enabled: true } }), undeletable: true },
  ai_autopilot: { create: (tx) => tx.aiAutopilot.create({ data: { autopilot: false } }), undeletable: true },
  ai_learning: {
    create: (tx) => tx.aiLearning.create({ data: { kind: "need", text: "Isolation" } }),
    undeletable: true,
  },
  ai_chat: {
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
      return tx.aiChat.create({ data: { conversationId: conversation.id } });
    },
    undeletable: true,
  },
  ai_usage: {
    create: (tx) => tx.aiUsage.create({ data: { month: new Date("2026-11-01"), calls: 1 } }),
    undeletable: true,
  },
  ai_media: {
    create: (tx) =>
      tx.aiMedia.create({
        data: { title: "Isolation", attachmentId: randomUUID(), fileName: "a.jpg", contentType: "image/jpeg" },
      }),
    undeletable: true,
  },
  ai_booking: {
    create: async (tx: OrgTx) => {
      const person = await tx.person.create({ data: { name: "Isolation", email: `ai-${randomUUID()}@example.test` } });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "walk_in" } });
      return tx.aiBooking.create({ data: { leadId: lead.id, conversationId: randomUUID(), summary: "Manali for 2" } });
    },
    undeletable: true,
  },
  ai_follow_up_touch: {
    create: async (tx: OrgTx) => {
      const due = new Date("2026-11-02T04:30:00Z");
      const task = await tx.task.create({
        data: { kind: "follow-up", title: "Isolation", dueAt: due, firstDueAt: due },
      });
      return tx.aiFollowUpTouch.create({ data: { taskId: task.id, dueAt: due, outcome: "no_chat" } });
    },
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

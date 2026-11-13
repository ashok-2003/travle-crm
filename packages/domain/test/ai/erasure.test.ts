// A customer's erasure takes every AI row about them, the earlier agents' too: chat memory, voice history and grounded
// facts, bookings, insights, field suggestions, drafts and, with them, the agency's lessons; another customer's chat stays.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { withdrawAiParts } from "../../src/ai/erasure.js";
import { createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import { liteAgency } from "./lite/support/lite-agency.js";

describe("erasing a customer's AI rows", () => {
  let test: TestInbox;
  let platformDb: PlatformDatabase;
  beforeAll(() => {
    test = createTestInbox();
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  it("an erased customer's earlier-agent rows go, and another customer's chat stays", async () => {
    const on = await liteAgency(test);
    const other = await on.inOrg(async (tx) => {
      await tx.aiChat.create({
        data: {
          conversationId: on.chat.id,
          memory: "Wants Kedarnath for 2.",
          voiceName: "Riya",
          voiceHistory: [{ own: true, text: "Hello" }],
          facts: { pickupCity: "Mumbai", adults: 2 },
        },
      });
      await tx.aiBooking.create({
        data: { leadId: on.leadId, conversationId: on.chat.id, summary: "Kedarnath for 2", status: "awaiting_payment" },
      });
      await tx.leadAiInsight.create({
        data: { leadId: on.leadId, score: 40, label: "warm", summary: "", nextStep: "", model: "memory-model" },
      });
      await tx.leadAiField.create({ data: { leadId: on.leadId, field: "adults", valueHash: "hash" } });
      await tx.aiDraft.create({
        data: { conversationId: on.chat.id, draftedBy: on.owner.userId, model: "memory-model", textHash: "hash" },
      });
      await tx.aiLearning.create({ data: { kind: "need", text: "People ask for Kedarnath" } });
      // Another customer of the same agency.
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: on.chat.connectionId, phoneE164: "+919800000077" },
        select: { id: true },
      });
      await tx.aiChat.create({ data: { conversationId: chat.id, memory: "Someone else's notes." } });
      return chat.id;
    });
    const counts = await platformDb.transaction((tx) =>
      withdrawAiParts(tx, {
        organizationId: on.organizationId,
        personId: on.chat.personId ?? "",
        phones: [on.chat.phoneE164],
        leadIds: [on.leadId],
        now: testNow,
      }),
    );
    expect(counts).toMatchObject({ chats: 1, bookings: 1, insights: 1, fields: 1, drafts: 1, lessons: 1 });
    expect(
      await on.inOrg(async (tx) => ({
        chats: await tx.aiChat.findMany({ select: { conversationId: true } }),
        bookings: await tx.aiBooking.count(),
        insights: await tx.leadAiInsight.count(),
        fields: await tx.leadAiField.count(),
        drafts: await tx.aiDraft.count(),
        lessons: await tx.aiLearning.count(),
      })),
    ).toEqual({ chats: [{ conversationId: other }], bookings: 0, insights: 0, fields: 0, drafts: 0, lessons: 0 });
  });
});

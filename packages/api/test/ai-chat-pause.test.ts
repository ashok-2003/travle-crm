// ai.chatAi on the real router: a chat the AI answers stops saying so while platform staff have the agent paused for the
// agency, read fresh from the database, and says so again after the resume.
import { saveAiSettings } from "@travel-crm/domain/ai";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { anAgency, callerOf, createHarness, type Harness } from "./forms-support.js";

const model: NonNullable<Context["ai"]> = {
  configured: true,
  complete: () => Promise.resolve({ ok: false, reason: "not_configured" }),
};

describe("ai.chatAi while the agent is paused", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("answers false while the agency's agent is paused, and true again after the resume", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "inbox", "ai"] });
    const { caller, member } = callerOf(harness, { organizationId, context: { ai: model } });
    const conversationId = await harness.db.forOrg(organizationId, async (tx) => {
      await saveAiSettings(
        tx,
        member,
        { enabled: true, scoring: true, instructions: "" },
        { providerReady: true, now: new Date() },
      );
      const integratedNumber = `9199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
      const connection = await tx.whatsappConnection.create({
        data: { integratedNumber, displayNumber: `+${integratedNumber}`, mode: "new_number", status: "connected" },
        select: { id: true },
      });
      const chat = await tx.whatsappConversation.create({
        data: {
          connectionId: connection.id,
          phoneE164: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
        },
        select: { id: true },
      });
      await tx.aiChat.create({ data: { conversationId: chat.id, mode: "on" } });
      return chat.id;
    });
    expect((await caller.ai.chatAi({ conversationId })).answering).toBe(true);
    const pause = (paused: boolean) =>
      harness.platform.subscription.update({
        where: { organizationId },
        data: paused
          ? { aiAgentPausedAt: new Date(), aiAgentPausedBy: randomUUID() }
          : { aiAgentPausedAt: null, aiAgentPausedBy: null },
      });
    await pause(true);
    expect((await caller.ai.chatAi({ conversationId })).answering).toBe(false);
    await pause(false);
    expect((await caller.ai.chatAi({ conversationId })).answering).toBe(true);
  });
});

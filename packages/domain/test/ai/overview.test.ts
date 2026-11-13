// The AI agent's last day: each chat counted once however it was flagged (handed over, told the team, or its lead
// suggested Lost or Not a lead), only the last 24 hours counted, and the bookings the AI took in that day.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiOverviewOf } from "../../src/ai/overview.js";
import { aLead } from "../crm/support/records.js";
import { createTestInbox, type TestInbox } from "../inbox/support.js";
import { liteAgency, liteTurnAt } from "./lite/support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;
const hoursAgo = (hours: number) => new Date(liteTurnAt.getTime() - hours * 3_600_000);

describe("the AI agent's overview", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** A chat and a lead for it; the lead is only made when a suggestion needs one. */
  async function chatWith(on: Agency, flags: { handedOff?: Date; attention?: Date; suggested?: Date }) {
    return on.inOrg(async (tx) => {
      const connection = await tx.whatsappConnection.findFirstOrThrow();
      const conversation = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+91${String(Math.floor(Math.random() * 9e9) + 1e9)}` },
      });
      await tx.aiChat.create({
        data: {
          conversationId: conversation.id,
          handedOffAt: flags.handedOff ?? null,
          attentionAt: flags.attention ?? null,
        },
      });
      if (flags.suggested !== undefined) {
        const lead = await aLead(tx, { stage: "new" });
        await tx.leadAiSuggestion.create({
          data: {
            leadId: lead.id,
            conversationId: conversation.id,
            kind: "lost",
            lostReason: "other",
            reason: "Said they're not interested.",
            createdAt: flags.suggested,
          },
        });
      }
      return conversation.id;
    });
  }

  it("flagged counts a chat once, however it was flagged, and only the last day's", async () => {
    const on = await liteAgency(test);
    await chatWith(on, { handedOff: hoursAgo(1), suggested: hoursAgo(1) });
    await chatWith(on, { suggested: hoursAgo(3) });
    await chatWith(on, { handedOff: hoursAgo(48), suggested: hoursAgo(48) });
    expect((await on.inOrg((tx) => aiOverviewOf(tx, liteTurnAt))).flagged).toBe(2);
    await chatWith(on, { attention: hoursAgo(5) });
    expect((await on.inOrg((tx) => aiOverviewOf(tx, liteTurnAt))).flagged).toBe(3);
  });

  it("flagged counts a suggestion with no chat by its lead, once", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      for (const lead of [await aLead(tx, { stage: "new" }), await aLead(tx, { stage: "new" })]) {
        await tx.leadAiSuggestion.create({
          data: {
            leadId: lead.id,
            conversationId: null,
            kind: "lost",
            lostReason: "other",
            reason: "x",
            createdAt: hoursAgo(2),
          },
        });
      }
    });
    expect((await on.inOrg((tx) => aiOverviewOf(tx, liteTurnAt))).flagged).toBe(2);
  });

  it("bookings requested counts the last day's", async () => {
    const on = await liteAgency(test);
    const book = (at: Date) =>
      on.inOrg((tx) =>
        tx.aiBooking.create({
          data: { leadId: on.leadId, conversationId: randomUUID(), summary: "Manali for 2", createdAt: at },
        }),
      );
    await book(hoursAgo(2));
    await book(hoursAgo(23));
    await book(hoursAgo(30));
    expect((await on.inOrg((tx) => aiOverviewOf(tx, liteTurnAt))).bookingsRequested).toBe(2);
  });
});

// What a person decided on the lead reaches the agent's turn: a customer whose newest lead is Not a lead gets no answer
// at all, until the team starts them a new lead.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideStageSuggestion, suggestStage } from "../../../src/ai/lite/suggestions.js";
import { startLeadFromConversation } from "../../../src/inbox/index.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency } from "./support/lite-agency.js";
import { at, greeting, outbound, says, type Agency } from "./support/turn-script.js";

/** Moves every lead the chat's person has to `stage`. */
const markLeads = (on: Agency, stage: "lost" | "not_a_lead") =>
  on.inOrg((tx) => tx.lead.updateMany({ where: { personId: on.chat.personId ?? "" }, data: { stage } }));
const leadCount = (on: Agency) => on.inOrg((tx) => tx.lead.count({ where: { personId: on.chat.personId ?? "" } }));

describe("what a person decided reaches the agent's turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("a customer marked Not a lead by hand is not answered at all: no lead, no message, nobody told", async () => {
    const on = await liteAgency(test);
    await markLeads(on, "not_a_lead");
    const leads = await leadCount(on);
    const notices = () => on.inOrg((tx) => tx.notification.count());
    const told = await notices();
    // A greeting, a booking and a discount: what the model would answer, were it asked.
    const turns = [
      { seconds: 30, words: "hi" },
      { seconds: 90, words: "I want to book" },
      { seconds: 150, words: "can you give a discount?" },
    ];
    for (const { seconds, words } of turns) {
      const token = await says(on, words, seconds);
      on.model.answer(greeting);
      expect(await on.turn(at(seconds + 30), { token })).toBe("not_a_lead");
    }
    // The customer's lines are in the inbox for the team; the AI read none of them and wrote nothing.
    expect(await on.inOrg((tx) => tx.whatsappMessage.count({ where: { direction: "in" } }))).toBe(4);
    expect(await outbound(on)).toHaveLength(0);
    expect(on.model.requests).toHaveLength(0);
    expect(await leadCount(on)).toBe(leads);
    expect(await notices()).toBe(told);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: on.chat.id } }));
    expect(chat?.handedOffAt ?? null).toBeNull();
    expect(chat?.attentionReason ?? null).toBeNull();
  });

  it("a Not a lead accepted from the AI's suggestion lifts once the team starts the customer a new lead", async () => {
    const on = await liteAgency(test);
    // The fixture's lead is the person's only open one; the AI suggests Not a lead on it and the owner says yes.
    await on.inOrg((tx) =>
      tx.lead.updateMany({
        where: { personId: on.chat.personId ?? "", id: { not: on.leadId } },
        data: { stage: "lost" },
      }),
    );
    await on.inOrg(async (tx) => {
      await suggestStage(tx, {
        organizationId: on.organizationId,
        leadId: on.leadId,
        conversationId: on.chat.id,
        kind: "not_a_lead",
        lostReason: null,
        reason: "Looks fake: keyboard mash",
        now: testNow,
      });
      const suggestion = await tx.leadAiSuggestion.findFirstOrThrow({ where: { leadId: on.leadId } });
      await decideStageSuggestion(tx, on.owner, { suggestionId: suggestion.id, accept: true }, testNow);
    });
    // Later the customer is real after all: the team starts them a new lead by hand, and they say hi.
    await on.inOrg((tx) =>
      startLeadFromConversation(
        tx,
        on.owner,
        on.chat.id,
        { ownerUserId: on.owner.userId, workers: new Set([on.owner.userId]) },
        // Now, after the fixture's leads were made: it is the newest.
        new Date(),
      ),
    );
    const token = await says(on, "hi", 30);
    on.model.answer(greeting);
    expect(await on.turn(at(60), { token })).toBe("replied");
    expect(await outbound(on)).toHaveLength(1);
  });
});

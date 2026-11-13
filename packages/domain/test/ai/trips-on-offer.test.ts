// The trips the agency sells, as the plain lines the other prompts carry: names, place, nights and start city, no price.
// And the free text an agency typed before the move (instructions, knowledge) reaches Suggest reply and the score no more.
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scoreLead, suggestReply } from "../../src/ai/index.js";
import { tripsOnOffer } from "../../src/ai/trips-on-offer.js";
import { createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import { liteAgency, liteEntitlements, liteToday } from "./lite/support/lite-agency.js";

describe("the trips on offer", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("lists only the packages the AI may sell, without a price", async () => {
    const on = await liteAgency(test);
    // A second, complete package whose "AI can sell" switch is off: the only difference from the first.
    await on.inOrg((tx) =>
      tx.quoteTemplate.create({
        data: {
          name: "Spiti 3N",
          title: "Spiti Escape 3N",
          kind: "group",
          nights: 3,
          startCity: "Delhi",
          roomTypes: ["double"],
          advancePerPersonPaise: 200_000n,
          pricesIncludeGst: true,
          aiSellable: false,
        },
      }),
    );
    const lines = await on.inOrg((tx) => tripsOnOffer(tx, on.organizationId, liteToday));
    expect(lines).toEqual(["- Kedarnath Yatra 4N · Kedarnath · 4 nights · from Delhi"]);
    await on.inOrg((tx) => tx.quoteTemplate.updateMany({ data: { aiSellable: false } }));
    expect(await on.inOrg((tx) => tripsOnOffer(tx, on.organizationId, liteToday))).toEqual([]);
  });

  /** The old free text written straight into the tables, as an agency left it before the move. */
  async function withOldFreeText() {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      await tx.aiSettings.updateMany({ data: { instructions: "OLD_INSTRUCTIONS_TEXT" } });
      await tx.aiKnowledge.create({ data: { title: "Offer", body: "OLD_KNOWLEDGE_BODY Rs 18,500" } });
    });
    return on;
  }

  it("Suggest reply sends the trips on offer and none of the old free text", async () => {
    const on = await withOldFreeText();
    const model = createMemoryAiModel();
    model.answer('"Namaste Rahul!"');
    await suggestReply(
      test.db,
      model,
      on.owner,
      { conversationId: on.chat.id },
      { agencyName: "Sharma", now: testNow },
    );
    const prompt = JSON.stringify(model.requests[0]?.messages);
    expect(prompt).toContain("Kedarnath Yatra 4N · Kedarnath · 4 nights · from Delhi");
    expect(prompt).not.toContain("OLD_INSTRUCTIONS_TEXT");
    expect(prompt).not.toContain("OLD_KNOWLEDGE_BODY");
  });

  it("the score reads the trips on offer, not the knowledge", async () => {
    const on = await withOldFreeText();
    on.model.answer(
      JSON.stringify({
        score: 50,
        label: "warm",
        reasons: ["Asked"],
        fake: false,
        fakeReason: "",
        summary: "",
        nextStep: "",
      }),
    );
    await scoreLead(
      { db: test.db, ai: on.model, subscriptions: { entitlementsOf: () => Promise.resolve(liteEntitlements) } },
      { organizationId: on.organizationId, conversationId: on.chat.id, messageId: on.message.id },
      testNow,
    );
    const prompt = JSON.stringify(on.model.requests[0]?.messages);
    expect(prompt).toContain("Kedarnath Yatra 4N · Kedarnath · 4 nights · from Delhi");
    expect(prompt).not.toContain("OLD_KNOWLEDGE_BODY");
  });
});

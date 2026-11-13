// The quote write-up: off until the agency turns the AI on; a quote out of the member's scope is not found; the model is told
// the plan and never a unit price; the quote's total and advance are filled by code and an amount the model typed is taken out;
// a draft quote has no link line; the month's call is given back when the AI fails; the draft keeps ids and a hash, never words.
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MONTHLY_AI_LIMIT, saveAiSettings, writeUpQuote } from "../../src/ai/index.js";
import { createQuote, setQuoteStatus, addInstallment } from "../../src/quotes/index.js";
import { aLead } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../inbox/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("quote write-up", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function agency(days = true) {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    const seller = memberOf(organizationId, "sales");
    const outsider = memberOf(organizationId, "sales");
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: freshPhone().replace("+", ""),
        customerName: "Rahul Sharma",
        text: "Hi, Manali trip please",
      }),
    );
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const lead = await inOrg((tx) =>
      aLead(tx, {
        ...(chat.personId === null ? {} : { personId: chat.personId }),
        ownerUserId: seller.userId,
        stage: "contacted",
      }),
    );
    const quote = await inOrg(async (tx) => {
      const made = await createQuote(
        tx,
        owner,
        {
          leadId: lead.id,
          title: "Manali for four",
          startDate: "2026-12-15",
          adults: 4,
          children: 0,
          days: days
            ? [
                { title: "Arrive in Manali", description: "Pick-up from Chandigarh" },
                { title: "Solang Valley", description: "Snow activities" },
              ]
            : [],
          items: [{ description: "Hotel, 5 nights", detail: "Deluxe", quantity: 5, unitPricePaise: 777_700 }],
          inclusions: "Breakfast",
          exclusions: "Flights",
          notes: "",
          taxRateBasisPoints: 500,
          placeOfSupply: null,
        },
        { supplierStateCode: "27", now: testNow },
      );
      // 5 x ₹7,777 = ₹38,885 plus 5% GST is ₹40,829.26: an advance of ₹30,000 and the balance.
      await addInstallment(tx, owner, {
        quoteId: made.id,
        label: "Advance",
        amountPaise: 3_000_000,
        dueOn: "2026-11-20",
      });
      await addInstallment(tx, owner, {
        quoteId: made.id,
        label: "Balance",
        amountPaise: 1_082_926,
        dueOn: "2026-12-05",
      });
      return made;
    });
    const model = createMemoryAiModel();
    const turnOn = () =>
      inOrg(async (tx) => {
        await saveAiSettings(tx, owner, { enabled: true, scoring: true }, { providerReady: true, now: testNow });
        // Free text an agency typed before the move is stored but sent to no prompt.
        await tx.aiSettings.updateMany({ data: { instructions: "WRITEUP_INSTRUCTIONS" } });
        await tx.aiKnowledge.create({ data: { title: "Offer", body: "WRITEUP_KNOWLEDGE_BODY" } });
      });
    const write = (member = seller, language: "en" | "hi" = "en") =>
      writeUpQuote(
        test.db,
        model,
        member,
        { quoteId: quote.id, language, channel: "whatsapp" },
        { agencyName: "Sharma Holidays", now: testNow },
      );
    return { organizationId, inOrg, owner, seller, outsider, chat, quote, model, turnOn, write };
  }

  it("is off until the agency turns the AI on", async () => {
    const { write, model } = await agency();
    expect(await reasonOf(write())).toBe("AI_OFF");
    expect(model.requests).toHaveLength(0);
  });

  it("fills the total and advance by code, takes out a typed amount, drops the link of a draft, and tells the model no price", async () => {
    const { write, model, turnOn } = await agency();
    await turnOn();
    model.answer(
      "Hi Rahul! Here is your Manali plan. It comes to just Rs. 99,999 per person.\nTotal: {total}\nAdvance to book: {advance}\nSee it here: {link}",
    );
    const result = await write();
    expect(result.text).toContain("Hi Rahul!");
    expect(result.text).not.toContain("99,999");
    expect(result.removedAmounts).toBe(true);
    expect(result.text).toContain("Total: ₹40,829.26");
    expect(result.text).toContain("Advance to book: ₹30,000.00");
    expect(result.text).not.toContain("{link}");
    expect(result.text).not.toContain("See it here");
    const [request] = model.requests;
    const prompt = JSON.stringify(request?.messages);
    expect(prompt).toContain("Solang Valley");
    expect(prompt).toContain("Hotel, 5 nights");
    expect(prompt).not.toContain("777700");
    expect(prompt).not.toContain("WRITEUP_INSTRUCTIONS");
    expect(prompt).not.toContain("WRITEUP_KNOWLEDGE_BODY");
    expect(prompt).not.toContain("7,777");
    expect(request?.feature).toBe("write_up");
    expect(result.monthlyLimit).toBe(MONTHLY_AI_LIMIT);
    expect(result.usedThisMonth).toBe(1);
  });

  it("keeps {link} on a quote that has been sent, and offers the customer's chat with a draft that keeps no words", async () => {
    const { write, model, turnOn, inOrg, owner, quote, chat } = await agency();
    await turnOn();
    await inOrg((tx) => setQuoteStatus(tx, owner, { quoteId: quote.id, status: "sent" }, testNow));
    model.answer("Namaste {total} Hindi words\nOpen: {link}");
    const result = await write(owner, "hi");
    expect(result.text).toContain("Open: {link}");
    expect(result.chat?.conversationId).toBe(chat.id);
    const drafts = await inOrg((tx) => tx.aiDraft.findMany());
    expect(drafts).toHaveLength(1);
    expect(JSON.stringify(drafts)).not.toContain("Namaste");
    expect(JSON.stringify(model.requests[0]?.messages)).toContain("Hindi");
  });

  it("is not found for a member outside the quote's scope, and asks for the plan when the quote has no days", async () => {
    const { write, turnOn, outsider } = await agency();
    await turnOn();
    expect(await reasonOf(write(outsider))).toBe("NOT_FOUND");
    const empty = await agency(false);
    await empty.turnOn();
    expect(await reasonOf(empty.write())).toBe("QUOTE_HAS_NO_DAYS");
    expect(empty.model.requests).toHaveLength(0);
  });

  it("gives the call back when the AI does not answer", async () => {
    const { write, model, turnOn, inOrg } = await agency();
    await turnOn();
    model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(write())).toBe("AI_UNAVAILABLE");
    expect(await inOrg((tx) => tx.aiUsage.findMany())).toMatchObject([{ calls: 0 }]);
  });
});

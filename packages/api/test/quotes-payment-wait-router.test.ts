// quotes.list, forLead and get carry paymentWait: a quote behind an open AI booking waits for payment, a staff-made one
// does not, and the list's search narrows by name.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, type Harness } from "./forms-support.js";

describe("a quote's payment wait over the api", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("names the quote behind an open AI booking, and only that one", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { aiQuote, staffQuote, leadId } = await harness.db.forOrg(organizationId, async (tx) => {
      const person = await tx.person.create({ data: { name: "Meera Kapoor", phoneE164: "+919812345678" } });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "web_form" } });
      const make = (title: string) =>
        tx.quote.create({
          data: { leadId: lead.id, title, subtotalPaise: 1n, totalPaise: 1n },
          select: { id: true },
        });
      const ai = await make("Spiti");
      const staff = await make("Goa");
      await tx.aiBooking.create({
        data: { leadId: lead.id, conversationId: randomUUID(), summary: "Spiti", quoteId: ai.id },
      });
      return { aiQuote: ai.id, staffQuote: staff.id, leadId: lead.id };
    });
    const { caller } = callerOf(harness, { organizationId });
    const listed = await caller.quotes.list({});
    expect(listed.find((quote) => quote.id === aiQuote)?.paymentWait).toBe("waiting");
    expect(listed.find((quote) => quote.id === staffQuote)?.paymentWait).toBeNull();
    expect((await caller.quotes.forLead({ leadId })).find((quote) => quote.id === aiQuote)?.paymentWait).toBe(
      "waiting",
    );
    expect((await caller.quotes.get({ quoteId: aiQuote })).paymentWait).toBe("waiting");
    expect((await caller.quotes.get({ quoteId: staffQuote })).paymentWait).toBeNull();
    expect((await caller.quotes.list({ search: "meera" })).length).toBe(2);
    expect((await caller.quotes.list({ search: "nobody" })).length).toBe(0);
  });
});

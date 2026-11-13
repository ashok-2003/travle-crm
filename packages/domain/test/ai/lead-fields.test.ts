// A new WhatsApp lead that arrives filled in: the scoring call also reads the customer's trip from their first messages and
// writes it onto the lead's empty fields as suggestions (never over a person's value, never past ten messages, never when the
// lead is complete or the agency turned it off); a field edited since ends its own tint; a person confirms or dismisses.
import { randomUUID } from "node:crypto";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aiFilledLeadIds,
  decideSuggestions,
  saveAiSettings,
  scoreLead,
  suggestedFieldsOf,
} from "../../src/ai/index.js";
import { findOrAddDestination } from "../../src/catalog/index.js";
import { systemActor } from "../../src/kernel/index.js";
import type { Entitlements } from "../../src/subscriptions/index.js";
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

const entitlements: Entitlements = {
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};

const answer = (trip: object = {}) =>
  JSON.stringify({
    score: 78,
    label: "hot",
    reasons: ["Gave dates"],
    fake: false,
    fakeReason: "",
    summary: "Wants Manali.",
    nextStep: "Call.",
    facts: { destination: "Manali", when: "December", travellers: "4 adults", budget: "1 lakh" },
    trip: {
      destination: "Manali",
      dateFrom: "15 Dec",
      dateTo: "20 Dec",
      adults: 4,
      budget: "1 lakh",
      budgetBasis: "for_everyone",
      excerpts: { destination: "Manali jana hai", budget: "1 lakh tak" },
      ...trip,
    },
  });

describe("a new WhatsApp lead that arrives filled in", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function agency(
    options: { fillLeads?: boolean; scoring?: boolean; lead?: object; extraMessages?: number } = {},
  ) {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: freshPhone().replace("+", ""),
        customerName: "Rahul Sharma",
        text: "Hi, Manali jana hai 15 se 20 Dec, 4 log, 1 lakh tak",
      }),
    );
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    for (let index = 0; index < (options.extraMessages ?? 0); index += 1) {
      await inOrg((tx) =>
        tx.whatsappMessage.create({
          data: {
            conversationId: chat.id,
            direction: "in",
            origin: "customer",
            kind: "text",
            body: `More ${String(index)}`,
            wamid: randomUUID(),
            status: "received",
            occurredAt: new Date(testNow.getTime() + (index + 1) * 1000),
          },
        }),
      );
    }
    const newest = await inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({
        where: { direction: "in" },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      }),
    );
    const manali = await inOrg((tx) => findOrAddDestination(tx, systemActor(organizationId), "Manali"));
    const lead = await inOrg((tx) =>
      aLead(tx, {
        ...(chat.personId === null ? {} : { personId: chat.personId }),
        ownerUserId: owner.userId,
        ...options.lead,
      }),
    );
    await inOrg((tx) =>
      saveAiSettings(
        tx,
        owner,
        { enabled: true, scoring: options.scoring ?? true, fillLeads: options.fillLeads ?? true, instructions: "" },
        { providerReady: true, now: testNow },
      ),
    );
    const model = createMemoryAiModel();
    const score = () =>
      scoreLead(
        { db: test.db, ai: model, subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) } },
        { organizationId, conversationId: chat.id, messageId: newest.id },
        testNow,
      );
    const leadNow = () => inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }));
    return { organizationId, inOrg, owner, lead, manali, model, score, leadNow };
  }

  it("fills the empty fields from the customer's words, as suggestions with their excerpts, in the same call as the score", async () => {
    const { model, score, leadNow, inOrg, lead, manali } = await agency();
    model.answer(answer());
    expect(await score()).toBe("scored_and_filled");
    expect(model.requests).toHaveLength(1);
    // The one call asked for the trip as well.
    expect(model.requests[0]?.messages[0]?.content).toContain('"trip"');
    const row = await leadNow();
    expect(row).toMatchObject({
      destinationId: manali.id,
      travelKind: "dates",
      adults: 4,
      budgetPaise: 10_000_000n,
      budgetBasis: "for_everyone",
    });
    const suggested = await inOrg((tx) => suggestedFieldsOf(tx, lead.id));
    expect(suggested.map((one) => one.field).sort()).toEqual(["adults", "budget", "destination", "when"]);
    expect(suggested.find((one) => one.field === "budget")?.excerpt).toBe("1 lakh tak");
    const [entry] = await inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai.lead-filled" } }));
    expect(entry?.after).toEqual({
      fields: expect.arrayContaining(["adults", "budget", "destination", "when"]) as string[],
    });
    expect(JSON.stringify(entry)).not.toMatch(/Manali|lakh/);
  });

  it("never writes over a value a person gave, and fills only what is empty", async () => {
    const { model, score, leadNow, inOrg, lead } = await agency({ lead: { adults: 2, tripType: "family" } });
    model.answer(answer({ tripType: "friends" }));
    await score();
    expect(await leadNow()).toMatchObject({ adults: 2, tripType: "family" });
    const fields = (await inOrg((tx) => suggestedFieldsOf(tx, lead.id))).map((one) => one.field);
    expect(fields).not.toContain("adults");
    expect(fields).not.toContain("trip_type");
  });

  it("asks for the trip no more once the lead has where, when, who and how much, or after ten customer messages", async () => {
    const complete = await agency({
      lead: { adults: 2, travelKind: "flexible", budgetPaise: 5_000_000n, budgetBasis: "per_person" },
    });
    await complete.inOrg((tx) =>
      tx.lead.update({ where: { id: complete.lead.id }, data: { destinationId: complete.manali.id } }),
    );
    complete.model.answer(answer());
    await complete.score();
    expect(complete.model.requests[0]?.messages[0]?.content).not.toContain('"trip"');
    expect(await complete.inOrg((tx) => tx.leadAiField.count())).toBe(0);

    const long = await agency({ extraMessages: 10 });
    long.model.answer(answer());
    expect(await long.score()).toBe("scored");
    expect(long.model.requests[0]?.messages[0]?.content).not.toContain('"trip"');
    expect((await long.leadNow()).adults).toBeNull();
  });

  it("is off when the agency turned it off, and can run without the score being kept", async () => {
    const off = await agency({ fillLeads: false });
    off.model.answer(answer());
    expect(await off.score()).toBe("scored");
    expect((await off.leadNow()).adults).toBeNull();

    const only = await agency({ scoring: false });
    only.model.answer(answer());
    expect(await only.score()).toBe("scored_and_filled");
    expect(await only.inOrg((tx) => tx.leadAiInsight.count())).toBe(0);
    expect((await only.leadNow()).adults).toBe(4);
  });

  it("ends a field's tint when a person edits it, and confirms or dismisses what is still the AI's", async () => {
    const { model, score, leadNow, inOrg, lead, owner } = await agency();
    model.answer(answer());
    await score();
    // A person changed the adults: that is theirs now.
    await inOrg((tx) => tx.lead.update({ where: { id: lead.id }, data: { adults: 5 } }));
    expect((await inOrg((tx) => suggestedFieldsOf(tx, lead.id))).map((one) => one.field)).not.toContain("adults");

    await inOrg((tx) => decideSuggestions(tx, owner, lead.id, "dismiss"));
    // Dismissed: what was still the AI's is gone; the person's 5 stays.
    expect(await leadNow()).toMatchObject({ adults: 5, destinationId: null, travelKind: "unknown", budgetPaise: null });
    expect(await inOrg((tx) => suggestedFieldsOf(tx, lead.id))).toEqual([]);
    // It is not suggested again.
    model.answer(answer());
    await score();
    expect((await leadNow()).destinationId).toBeNull();
    expect(await inOrg((tx) => tx.auditEntry.count({ where: { action: "ai.lead-fields-dismissed" } }))).toBe(1);
  });

  it("confirms: the values stay and the suggestions end", async () => {
    const { model, score, leadNow, inOrg, lead, owner, manali } = await agency();
    model.answer(answer());
    await score();
    await inOrg((tx) => decideSuggestions(tx, owner, lead.id, "confirm"));
    expect(await leadNow()).toMatchObject({ destinationId: manali.id, adults: 4 });
    expect(await inOrg((tx) => suggestedFieldsOf(tx, lead.id))).toEqual([]);
    expect(await inOrg((tx) => tx.leadAiField.count({ where: { state: "confirmed" } }))).toBe(4);
    await expect(inOrg((tx) => decideSuggestions(tx, owner, lead.id, "confirm"))).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
  });

  it("filledAt is the row's last write", async () => {
    const { model, score, inOrg, lead } = await agency();
    model.answer(answer());
    await score();
    const stamp = new Date("2026-11-12T07:00:00.000Z");
    await inOrg((tx) =>
      tx.leadAiField.updateMany({ where: { leadId: lead.id, field: "adults" }, data: { updatedAt: stamp } }),
    );
    const suggested = await inOrg((tx) => suggestedFieldsOf(tx, lead.id));
    expect(suggested.find((one) => one.field === "adults")?.filledAt).toBe("2026-11-12T07:00:00.000Z");
  });

  it("deciding one field leaves the others suggested", async () => {
    const { model, score, inOrg, lead, owner } = await agency();
    model.answer(answer());
    await score();
    await inOrg((tx) => decideSuggestions(tx, owner, lead.id, "confirm", ["adults"]));
    expect(
      await inOrg((tx) => tx.leadAiField.findFirstOrThrow({ where: { leadId: lead.id, field: "adults" } })),
    ).toMatchObject({
      state: "confirmed",
    });
    expect(
      await inOrg((tx) => tx.leadAiField.findFirstOrThrow({ where: { leadId: lead.id, field: "when" } })),
    ).toMatchObject({
      state: "suggested",
    });
    const left = (await inOrg((tx) => suggestedFieldsOf(tx, lead.id))).map((one) => one.field).sort();
    expect(left).toEqual(["budget", "destination", "when"]);
  });

  it("dismissing one field clears only it", async () => {
    const { model, score, leadNow, inOrg, lead, owner } = await agency();
    model.answer(answer());
    await score();
    await inOrg((tx) => decideSuggestions(tx, owner, lead.id, "dismiss", ["adults"]));
    expect(await leadNow()).toMatchObject({ adults: null, travelKind: "dates" });
    expect((await inOrg((tx) => suggestedFieldsOf(tx, lead.id))).map((one) => one.field)).not.toContain("adults");
    // A field that is not suggested is not found.
    await expect(inOrg((tx) => decideSuggestions(tx, owner, lead.id, "dismiss", ["adults"]))).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
  });

  it("a lead with an AI value still the AI's is marked, one a person changed is not", async () => {
    const { model, score, inOrg, lead } = await agency();
    // Only the adults are filled, so one edit takes the lead's last AI value away.
    model.answer(
      answer({
        destination: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        budget: undefined,
        budgetBasis: undefined,
      }),
    );
    await score();
    const plain = await inOrg((tx) => aLead(tx, {}));
    expect(await inOrg((tx) => aiFilledLeadIds(tx, [lead.id, plain.id]))).toEqual(new Set([lead.id]));
    await inOrg((tx) => tx.lead.update({ where: { id: lead.id }, data: { adults: 5 } }));
    expect(await inOrg((tx) => aiFilledLeadIds(tx, [lead.id, plain.id]))).toEqual(new Set());
    // A decided value is no longer suggested either.
    expect(await inOrg((tx) => aiFilledLeadIds(tx, []))).toEqual(new Set());
  });

  it("asks the database twice for a page, whatever its size", async () => {
    const { model, score, inOrg, lead } = await agency();
    model.answer(answer());
    await score();
    const others = await Promise.all(Array.from({ length: 12 }, () => inOrg((tx) => aLead(tx, {}))));
    const countQueries = (ids: string[]) =>
      inOrg(async (tx) => {
        let queries = 0;
        const counting = new Proxy(tx, {
          get(target, key) {
            const value: unknown = Reflect.get(target, key);
            if (typeof key !== "string" || key.startsWith("$") || typeof value !== "object" || value === null)
              return value;
            return new Proxy(value, {
              get(model, method) {
                const found: unknown = Reflect.get(model, method);
                if (typeof found !== "function") return found;
                return (...args: unknown[]) => {
                  queries += 1;
                  return (found as (...a: unknown[]) => unknown).apply(model, args);
                };
              },
            });
          },
        });
        await aiFilledLeadIds(counting, ids);
        return queries;
      });
    expect(await countQueries([lead.id])).toBe(2);
    expect(await countQueries([lead.id, ...others.map((one) => one.id)])).toBe(2);
  });
});

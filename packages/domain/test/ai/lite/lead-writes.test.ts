// What the lite turn writes on the lead and the chat: fields only where empty or still the AI's own, each marked and on
// the timeline; a person's value never replaced; the stage forward only; the summary clean; the score row.
import { internationalPhone } from "@travel-crm/contracts/kernel";
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import { randomUUID } from "node:crypto";
import { softDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leadInsightOf } from "../../../src/ai/index.js";
import { saveLeadInsight } from "../../../src/ai/insight.js";
import {
  liteInsightOf,
  saveChatSummary,
  writeLeadFromFacts,
  type LeadWriteInput,
} from "../../../src/ai/lite/lead-writes.js";
import { advanceLeadStage, renameWhatsAppPerson } from "../../../src/crm/index.js";
import { parseCalendarDate, systemActor } from "../../../src/kernel/index.js";
import { valueHash } from "../../../src/ai/fill/values.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteToday, liteTurnAt } from "./support/lite-agency.js";

const facts = (over: Partial<LiteFacts> = {}): LiteFacts => ({ ...liteFacts.parse({ agent: "lite" }), ...over });
const proofs = { adults: { excerpt: "we are 3", messageIds: [] as string[] } };

describe("what the lite turn writes on a lead", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function agency() {
    const lite = await liteAgency(test);
    const write = (over: Partial<LeadWriteInput> & { facts: LiteFacts }) =>
      lite.inOrg((tx) =>
        writeLeadFromFacts(tx, {
          organizationId: lite.organizationId,
          leadId: lite.leadId,
          pkg: null,
          departureStartsOn: null,
          proofs,
          today: liteToday,
          ...over,
        }),
      );
    const lead = () => lite.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: lite.leadId } }));
    const entries = () =>
      lite.inOrg((tx) =>
        tx.leadTimelineEntry.findMany({ where: { leadId: lite.leadId, kind: "ai-field-set" }, orderBy: { id: "asc" } }),
      );
    const row = (field: string) =>
      lite.inOrg((tx) => tx.leadAiField.findFirst({ where: { leadId: lite.leadId, field } }));
    return { ...lite, write, lead, entries, row };
  }

  it("empty fields are set and marked", async () => {
    const a = await agency();
    expect(await a.write({ facts: facts({ adults: 3 }) })).toEqual(["adults"]);
    expect((await a.lead()).adults).toBe(3);
    expect(await a.row("adults")).toMatchObject({
      state: "suggested",
      valueHash: valueHash("trip.adults", 3),
      excerpt: "we are 3",
    });
    const [entry, ...rest] = await a.entries();
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ aiField: "adults", fromText: null, toText: "3", byAi: true, actorUserId: null });
    const audits = await a.inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai.lead-filled" } }));
    expect(audits).toHaveLength(1);
  });

  it("its own value changes", async () => {
    const a = await agency();
    await a.write({ facts: facts({ adults: 3 }) });
    expect(
      await a.write({ facts: facts({ adults: 4 }), proofs: { adults: { excerpt: "now 4", messageIds: [] } } }),
    ).toEqual(["adults"]);
    expect((await a.lead()).adults).toBe(4);
    expect(await a.row("adults")).toMatchObject({ valueHash: valueHash("trip.adults", 4), excerpt: "now 4" });
    expect((await a.entries()).map((entry) => [entry.fromText, entry.toText])).toEqual([
      [null, "3"],
      ["3", "4"],
    ]);
    const audits = await a.inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai.lead-field-changed" } }));
    expect(audits).toHaveLength(1);
  });

  it("a person's value is never overwritten", async () => {
    const a = await agency();
    await a.write({ facts: facts({ adults: 3 }) });
    await a.inOrg((tx) => tx.lead.update({ where: { id: a.leadId }, data: { adults: 4 } }));
    expect(await a.write({ facts: facts({ adults: 3 }) })).toEqual([]);
    expect(await a.write({ facts: facts({ adults: 5 }) })).toEqual([]);
    expect((await a.lead()).adults).toBe(4);
    expect(await a.entries()).toHaveLength(1);
  });

  it("a value a person typed into an empty lead is theirs too", async () => {
    const a = await agency();
    await a.inOrg((tx) => tx.lead.update({ where: { id: a.leadId }, data: { departureCity: "Pune" } }));
    expect(await a.write({ facts: facts({ pickupCity: "Delhi" }) })).toEqual([]);
    expect((await a.lead()).departureCity).toBe("Pune");
  });

  it.each(["suggested", "confirmed"])("a field a person cleared stays cleared (%s)", async (state) => {
    const a = await agency();
    await a.write({ facts: facts({ adults: 3 }) });
    await a.inOrg(async (tx) => {
      await tx.lead.update({ where: { id: a.leadId }, data: { adults: null } });
      await tx.leadAiField.updateMany({ where: { leadId: a.leadId }, data: { state } });
    });
    expect(await a.write({ facts: facts({ adults: 3 }) })).toEqual([]);
    expect((await a.lead()).adults).toBeNull();
    expect(await a.entries()).toHaveLength(1);
  });

  it("the travel date changes when the customer moves to another departure", async () => {
    const a = await agency();
    const pkg = { destinationId: null, nights: 4 };
    const [first, second] = a.departures;
    const on = (departure: typeof first) => ({
      facts: facts({ departureId: departure?.id ?? null }),
      pkg,
      departureStartsOn: parseCalendarDate(departure?.startsOn ?? ""),
    });
    expect(first?.startsOn).toBe("2026-11-14");
    expect(second?.startsOn).toBe("2026-11-21");
    expect(await a.write(on(first))).toEqual(["when"]);
    expect(await a.write(on(first))).toEqual([]);
    expect(await a.write(on(second))).toEqual(["when"]);
    expect((await a.lead()).travelStart).toEqual(new Date("2026-11-21T00:00:00Z"));
    expect((await a.entries()).map((entry) => [entry.fromText, entry.toText])).toEqual([
      [null, "Sat 14 Nov to Wed 18 Nov"],
      ["Sat 14 Nov to Wed 18 Nov", "Sat 21 Nov to Wed 25 Nov"],
    ]);
  });

  it("a lead deleted mid-chat is skipped, not a failed turn", async () => {
    const a = await agency();
    await a.inOrg((tx) => tx.lead.update({ where: { id: a.leadId }, data: softDeleted(randomUUID()) }));
    expect(await a.write({ facts: facts({ adults: 3 }) })).toEqual([]);
  });

  it("a dismissed field is not filled again", async () => {
    const a = await agency();
    await a.write({ facts: facts({ adults: 3 }) });
    await a.inOrg(async (tx) => {
      await tx.lead.update({ where: { id: a.leadId }, data: { adults: null } });
      await tx.leadAiField.updateMany({ where: { leadId: a.leadId }, data: { state: "dismissed" } });
    });
    expect(await a.write({ facts: facts({ adults: 3 }) })).toEqual([]);
    expect((await a.lead()).adults).toBeNull();
  });

  it("when is written only for a chosen departure", async () => {
    const a = await agency();
    const day = a.departures[0];
    const pkg = { destinationId: null, nights: 4 };
    expect(await a.write({ facts: facts({ day: parseCalendarDate("2026-11-14") }), pkg })).toEqual([]);
    expect((await a.lead()).travelKind).toBe("unknown");
    expect(
      await a.write({
        facts: facts({ day: parseCalendarDate("2026-11-14"), departureId: day?.id ?? null }),
        pkg,
        departureStartsOn: parseCalendarDate("2026-11-14"),
      }),
    ).toEqual(["when"]);
    expect(await a.lead()).toMatchObject({
      travelKind: "dates",
      travelStart: new Date("2026-11-14T00:00:00Z"),
      travelEnd: new Date("2026-11-18T00:00:00Z"),
    });
    expect((await a.entries())[0]?.toText).toBe("Sat 14 Nov to Wed 18 Nov");
  });

  it("a month, the destination, ages, city and room are written in plain words", async () => {
    const a = await agency();
    const destination = await a.inOrg((tx) => tx.destination.findFirstOrThrow({ select: { id: true } }));
    const written = await a.write({
      facts: facts({
        month: "2026-12",
        children: { count: 2, ages: [8, 10] },
        pickupCity: "Delhi",
        roomType: "triple",
      }),
      pkg: { destinationId: destination.id, nights: 4 },
    });
    expect(written.sort()).toEqual(["children_ages", "departure_city", "destination", "room_type", "when"]);
    const words: Record<string, string | null> = Object.fromEntries(
      (await a.entries()).map((entry) => [entry.aiField ?? "", entry.toText]),
    );
    expect(words).toEqual({
      destination: "Kedarnath",
      when: "Dec 2026",
      children_ages: "8, 10",
      departure_city: "Delhi",
      room_type: "triple",
    });
  });

  it("children's ages are written only when every child has one", async () => {
    const a = await agency();
    expect(await a.write({ facts: facts({ children: { count: 2, ages: [8] } }) })).toEqual([]);
  });

  it("the name replaces only the WhatsApp name", async () => {
    const a = await agency();
    const person = await a.inOrg((tx) => tx.person.findFirstOrThrow({ where: { leads: { some: { id: a.leadId } } } }));
    const phoneE164 = person.phoneE164 ?? "";
    expect(phoneE164).not.toBe("");
    const nameIs = async () => (await a.inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: person.id } }))).name;
    const setName = (name: string) => a.inOrg((tx) => tx.person.update({ where: { id: person.id }, data: { name } }));
    const rename = (name: string) =>
      a.inOrg((tx) =>
        renameWhatsAppPerson(tx, systemActor(a.organizationId), {
          personId: person.id,
          leadId: a.leadId,
          name,
          profileName: "Rahul",
          phoneE164,
        }),
      );
    // The stand-in a nameless number gets: set, and the number is not quoted on the timeline.
    await setName(`WhatsApp ${internationalPhone(phoneE164)}`);
    expect(await rename("Riya Sharma")).toBe(true);
    expect(await nameIs()).toBe("Riya Sharma");
    expect((await a.entries()).at(-1)).toMatchObject({
      aiField: "name",
      fromText: null,
      toText: "Riya Sharma",
      byAi: true,
    });
    // Their WhatsApp profile name is replaceable too.
    await setName("Rahul");
    expect(await rename("Rahul Verma")).toBe(true);
    expect((await a.entries()).at(-1)).toMatchObject({ fromText: "Rahul", toText: "Rahul Verma" });
    // A name a member typed is theirs.
    expect(await rename("Someone Else")).toBe(false);
    expect(await nameIs()).toBe("Rahul Verma");
    expect(await a.entries()).toHaveLength(2);
  });

  it("an AI stage move is marked, and a stage behind the lead's changes nothing", async () => {
    const a = await agency();
    const actor = systemActor(a.organizationId);
    const move = (stage: "contacted" | "quote_sent", byAi = true) =>
      a.inOrg((tx) => advanceLeadStage(tx, actor, { leadId: a.leadId, stage, byAi }, liteTurnAt));
    expect(await move("contacted")).toBe(true);
    const stages = () =>
      a.inOrg((tx) => tx.leadTimelineEntry.findMany({ where: { leadId: a.leadId, kind: "stage-changed" } }));
    expect(await stages()).toMatchObject([{ stage: "contacted", byAi: true }]);
    expect(await move("quote_sent")).toBe(true);
    expect(await move("contacted")).toBe(false);
    expect((await a.lead()).stage).toBe("quote_sent");
    expect(await stages()).toHaveLength(2);
  });

  it("the AI never moves a lead to Won", async () => {
    const a = await agency();
    const won = { leadId: a.leadId, stage: "won", byAi: true } as unknown as Parameters<typeof advanceLeadStage>[2];
    expect(await a.inOrg((tx) => advanceLeadStage(tx, systemActor(a.organizationId), won, liteTurnAt))).toBe(false);
    expect((await a.lead()).stage).toBe("new");
  });

  it("the summary is capped and cleaned", async () => {
    const a = await agency();
    await a.inOrg((tx) => tx.aiChat.create({ data: { conversationId: a.chat.id } }));
    await a.inOrg((tx) =>
      saveChatSummary(tx, a.chat.id, `Wants Kedarnath, budget ₹50,000. ${"Likes the cold. ".repeat(100)}`),
    );
    const { summary } = await a.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: a.chat.id } }));
    expect(summary).not.toContain("₹");
    expect(summary).not.toContain("50,000");
    expect(summary.length).toBeLessThanOrEqual(800);
    expect(summary).toContain("Wants Kedarnath");
  });

  it("the insight row is written by saveLeadInsight", async () => {
    const a = await agency();
    const insight = liteInsightOf(
      {
        chance: 70,
        label: "hot",
        reasons: ["Gave a date"],
        looks_fake: false,
        fake_why: "not shown",
        standing: "Has the price.",
        next_step: "Send dates.",
      },
      { destination: "Kedarnath", when: "Dec", travellers: "3 adults" },
      "m1",
    );
    expect(insight).toMatchObject({
      fake: false,
      fakeReason: null,
      summary: "Has the price.",
      nextStep: "Send dates.",
    });
    expect(insight.facts.budget).toBeNull();
    await a.inOrg((tx) => saveLeadInsight(tx, a.organizationId, a.leadId, insight));
    await a.inOrg((tx) => saveLeadInsight(tx, a.organizationId, a.leadId, { ...insight, score: 80 }));
    const stored = await a.inOrg((tx) => leadInsightOf(tx, a.leadId));
    expect(stored).toMatchObject({ score: 80, label: "hot", reasons: ["Gave a date"] });
  });
});

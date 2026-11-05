// Drafting one trip: every value carries the real line it came from; a price its line doesn't print is shown with "check this";
// two sources that disagree are both kept; a value whose lines don't exist is not filled; payment details are never drafted.
import { PACKAGE_DRAFT_CHARACTERS } from "@travel-crm/contracts/ai";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { draftPackage, findTrips, saveAiSettings } from "../../src/ai/index.js";
import { anAgency, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

const NOW = new Date("2026-11-02T06:30:00Z");
const UPI = "manaliholidays@okhdfcbank";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

const field = (value: unknown, ...tokens: string[]) => ({ value, tokens });

describe("drafting one trip", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  async function agency(options: { big?: boolean; brochure?: boolean; lines?: string[]; part?: string } = {}) {
    const organizationId = await anAgency(test, "Draft agency");
    const owner = memberOf(organizationId, "org-owner");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    await inOrg((tx) =>
      saveAiSettings(tx, owner, { enabled: true, scoring: true, instructions: "" }, { providerReady: true, now: NOW }),
    );
    // P1 = Manali (L1..L6), P2 = Manali brochure (L1), strict rules come after the knowledge pieces.
    await inOrg(async (tx) => {
      await tx.aiKnowledge.create({
        data: {
          title: "Manali",
          body: [
            "Manali 5 Nights 6 Days",
            "Double sharing 6,999/- per person for Dec to Jan",
            "Departs every Friday from Delhi",
            "Inclusions: 5 nights hotel, daily breakfast",
            "Day 1: Delhi to Manali overnight Volvo",
            "Cancellation: 50% charged within 15 days",
            "Day 2: Overnight A/C Volvo to Manali",
            "Beas river bank walk",
            "Bookings: info@agency.com",
            "Advance ₹2,000 per person, UPI dadhich@okaxis",
            "Bank IFSC HDFC0001234 account no 50100123456789",
          ].join("\n"),
        },
      });
      await tx.aiKnowledge.create({
        data: { title: "Manali rates 2", body: "Manali 5 Nights 6 Days double sharing 7,499/- Dec to Jan" },
      });
      if (options.big === true) {
        const body = Array.from({ length: 190 }, (_, index) => `Line ${String(index + 1)} ${"x".repeat(300)}`);
        await tx.aiKnowledge.create({ data: { title: "Zbig", body: body.join("\n") } });
      }
      if (options.brochure === true) {
        await tx.aiKnowledge.create({
          data: { title: "Zbrochure", kind: "file", body: "Manali 5 Nights 6 Days brochure" },
        });
      }
      await tx.aiAutopilot.updateMany({ data: { strictRules: `Pay advance to UPI ${UPI} only` } });
    });
    const model = createMemoryAiModel();
    model.answer(
      JSON.stringify({
        trips: [
          {
            name: "Manali 5 Nights 6 Days",
            place: "Manali",
            nights: 5,
            lines: options.lines ?? ["P1.L1", "P1.L2", "P2.L1", "P1.L7", "P1.L8", "P1.L9", "P1.L10", "P1.L11"],
          },
        ],
      }),
    );
    const found = await findTrips(
      { db: test.db, model },
      owner,
      options.big === true ? { part: options.part ?? "part-1" } : {},
      NOW,
    );
    const trip = found.trips[0];
    if (found.fillId === null || trip === undefined) throw new Error("no trip");
    const input = {
      fillId: found.fillId,
      trip: { ref: trip.ref, name: trip.name, tokens: trip.evidence.map((one) => one.token) },
    };
    const draft = (override: Partial<typeof input> = {}) =>
      draftPackage({ db: test.db, model }, owner, { ...input, ...override }, NOW);
    const calls = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    return { owner, inOrg, model, draft, input, calls };
  }

  const answer = (more: Record<string, unknown> = {}) =>
    JSON.stringify({
      name: field("Manali 5N6D", "P1.L1"),
      destination: field("Manali", "P1.L1"),
      nights: field(5, "P1.L1"),
      weeklyDays: [{ value: ["Friday"], tokens: ["P1.L3"] }],
      startCity: field("Delhi", "P1.L3"),
      inclusions: field("5 nights hotel, daily breakfast", "P1.L4"),
      cancellationNotes: field("50% charged within 15 days", "P1.L6"),
      days: [{ title: "Delhi to Manali", description: "Overnight Volvo", tokens: ["P1.L5"] }],
      seasons: [
        {
          label: "Winter",
          fromMonth: 12,
          toMonth: 1,
          tokens: ["P1.L2"],
          prices: [{ room: "double", printed: "6,999/-", tokens: ["P1.L2"] }],
        },
      ],
      ...more,
    });

  it("drafts Manali 5N6D with each value's line", async () => {
    const { draft, model, calls, inOrg, input } = await agency();
    model.answer(answer());
    const result = await draft();
    expect(result.name).toEqual({
      value: "Manali 5N6D",
      evidence: [{ token: "P1.L1", source: "Knowledge: Manali", excerpt: "Manali 5 Nights 6 Days" }],
      checkThis: false,
    });
    expect(result.nights.value).toBe(5);
    expect(result.weeklyDays.map((one) => one.value)).toEqual([[5]]);
    expect(result.startCity.value).toBe("Delhi");
    expect(result.days).toHaveLength(1);
    expect(result.days[0]?.value).toEqual({ title: "Delhi to Manali", description: "Overnight Volvo" });
    const [season] = result.seasons;
    expect(season).toMatchObject({ startsOn: "2026-12-01", endsOn: "2027-01-31" });
    expect(season?.prices.double.map((one) => [one.value, one.checkThis])).toEqual([[699900, false]]);
    expect(season?.prices.double[0]?.evidence[0]?.token).toBe("P1.L2");
    expect(result.tripRef).toBe(input.trip.ref);
    expect(result.fillId).toBe(input.fillId);
    expect(await calls()).toBe(2);
    const fill = await inOrg((tx) => tx.aiFill.findFirst({ where: { id: input.fillId } }));
    expect(fill?.fields.some((path) => path.startsWith(`${input.trip.ref}.`))).toBe(true);
    expect(await inOrg((tx) => tx.quoteTemplate.count())).toBe(0);
    expect(model.requests.at(-1)?.feature).toBe("draft_packages");
  });

  it("a price that its line doesn't print is shown with check this", async () => {
    const { draft, model } = await agency();
    model.answer(
      answer({
        seasons: [
          {
            label: "Winter",
            fromMonth: 12,
            toMonth: 1,
            tokens: ["P1.L2"],
            prices: [{ room: "double", printed: "8,888/-", tokens: ["P1.L2"] }],
          },
        ],
      }),
    );
    const price = (await draft()).seasons[0]?.prices.double[0];
    expect(price).toMatchObject({ value: 888800, checkThis: true });
    expect(price?.evidence).toHaveLength(1);
  });

  it("₹6,999 in one document and ₹7,499 in another are both kept", async () => {
    const { draft, model } = await agency();
    model.answer(
      answer({
        seasons: [
          {
            label: "Winter",
            fromMonth: 12,
            toMonth: 1,
            tokens: ["P1.L2"],
            prices: [
              { room: "double", printed: "6,999/-", tokens: ["P1.L2"] },
              { room: "double", printed: "7,499/-", tokens: ["P2.L1"] },
            ],
          },
        ],
      }),
    );
    const result = await draft();
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]?.prices.double.map((one) => [one.value, one.evidence[0]?.source, one.checkThis])).toEqual([
      [699900, "Knowledge: Manali", false],
      [749900, "Knowledge: Manali rates 2", false],
    ]);
  });

  it("a value cited only by lines that don't exist is not filled", async () => {
    const { draft, model } = await agency();
    model.answer(answer({ startCity: field("Mumbai", "P9.L9"), inclusions: field("Free flights", "P7.L1") }));
    const result = await draft();
    expect(result.startCity).toEqual({ value: null, evidence: [], checkThis: false });
    expect(result.inclusions.value).toBeNull();
    expect(result.name.value).toBe("Manali 5N6D");
  });

  it("never drafts payment details, even from strict rules that hold a UPI id", async () => {
    const { draft, model } = await agency();
    // The strict rules are the last piece: P3 here, with the UPI line as its first. Only the trip's pieces are sent.
    model.answer(
      answer({
        inclusions: field(`Pay to ${UPI}`, "P1.L10"),
        exclusions: field(`Advance by UPI ${UPI}`, "P1.L4"),
        summary: field("Hotel and breakfast included", "P1.L4", "P3.L1"),
      }),
    );
    const result = await draft();
    const sent =
      model.requests
        .at(-1)
        ?.messages.map((message) => message.content)
        .join("\n") ?? "";
    expect(sent).not.toContain(UPI);
    expect(JSON.stringify(result)).not.toContain(UPI);
    expect(result.inclusions.value).toBe("Pay to [payment details removed]");
    expect(result.summary.evidence.map((one) => one.token)).toEqual(["P1.L4"]);
  });

  it("keeps ordinary text, and redacts only the payment identifiers inside a line", async () => {
    const { draft, model } = await agency();
    model.answer(
      answer({
        days: [{ title: "Overnight A/C Volvo", description: "Beas river bank walk", tokens: ["P1.L7", "P1.L8"] }],
        highlights: field(["Beas river bank walk"], "P1.L8"),
        summary: field("Bookings: info@agency.com", "P1.L9"),
        advancePerPerson: [{ printed: "₹2,000", tokens: ["P1.L10"] }],
        cancellationNotes: field("Bank IFSC HDFC0001234 account no 50100123456789", "P1.L11"),
      }),
    );
    const result = await draft();
    const sent =
      model.requests
        .at(-1)
        ?.messages.map((message) => message.content)
        .join("\n") ?? "";
    expect(sent).toContain("Overnight A/C Volvo");
    expect(sent).toContain("Beas river bank walk");
    expect(sent).toContain("info@agency.com");
    expect(result.days[0]?.value).toEqual({ title: "Overnight A/C Volvo", description: "Beas river bank walk" });
    expect(result.highlights.value).toEqual(["Beas river bank walk"]);
    expect(result.summary.value).toBe("Bookings: info@agency.com");
    expect(result.advancePerPersonPaise.map((one) => [one.value, one.checkThis])).toEqual([[200000, false]]);
    expect(result.advancePerPersonPaise[0]?.evidence[0]?.excerpt).toBe(
      "Advance ₹2,000 per person, UPI [payment details removed]",
    );
    const everything = JSON.stringify(result) + sent;
    for (const secret of ["dadhich@okaxis", "HDFC0001234", "50100123456789"]) expect(everything).not.toContain(secret);
    expect(result.cancellationNotes.value).toContain("[payment details removed]");
  });

  it("matches a destination only when the documents back it", async () => {
    const { draft, model, inOrg } = await agency();
    const manali = await inOrg((tx) => tx.destination.create({ data: { name: "Manali" }, select: { id: true } }));
    model.answer(answer({ destination: field("Manali", "P9.L9") }));
    expect((await draft()).destinationId).toBeNull();
    model.answer(answer({ destination: field("Manali", "P1.L1") }));
    expect((await draft()).destinationId).toBe(manali.id);
  });

  it("flags seasons whose days overlap", async () => {
    const { draft, model } = await agency();
    const season = (label: string, fromMonth: number, toMonth: number) => ({
      label,
      fromMonth,
      toMonth,
      tokens: ["P1.L2"],
      prices: [{ room: "double", printed: "6,999/-", tokens: ["P1.L2"] }],
    });
    model.answer(answer({ seasons: [season("Winter", 12, 1), season("Late winter", 1, 2), season("Summer", 4, 6)] }));
    const result = await draft();
    expect(result.seasons.map((one) => [one.label.value, one.label.checkThis])).toEqual([
      ["Winter", true],
      ["Late winter", true],
      ["Summer", false],
    ]);
  });

  it("sends a window round the cited lines when the pieces are over one call", async () => {
    const { draft, model } = await agency({ big: true, part: "part-2", lines: ["P3.L95"] });
    model.answer(answer({ name: field("Big", "P3.L95") }));
    const result = await draft();
    expect(result.name.value).toBe("Big");
    const content = model.requests.at(-1)?.messages.at(-1)?.content ?? "";
    expect(content.length).toBeLessThanOrEqual(PACKAGE_DRAFT_CHARACTERS);
    expect(content).toContain("[P3.L95]");
    expect(content).toContain("[P3.L140]");
    expect(content).not.toContain("[P3.L170]");
  });

  it("offers the brochure of a cited knowledge piece that has a file", async () => {
    const { draft, model, inOrg } = await agency({ brochure: true, lines: ["P1.L1", "P3.L1"] });
    const brochure = await inOrg((tx) => tx.aiKnowledge.findFirst({ where: { title: "Zbrochure" } }));
    model.answer(answer());
    expect((await draft()).brochureKnowledgeId).toBe(brochure?.id);
    const without = await agency({ brochure: true });
    without.model.answer(answer());
    expect((await without.draft()).brochureKnowledgeId).toBeNull();
  });

  it("equal prices from two sources are one alternative with both lines; unreadable ones stay apart", async () => {
    const { draft, model } = await agency();
    const season = (prices: unknown[]) => [{ label: "Winter", fromMonth: 12, toMonth: 1, tokens: ["P1.L2"], prices }];
    model.answer(
      answer({
        seasons: season([
          { room: "double", printed: "6,999/-", tokens: ["P1.L2"] },
          { room: "double", printed: "6999", tokens: ["P2.L1"] },
          { room: "triple", printed: "on request", tokens: ["P1.L2"] },
          { room: "triple", printed: "call us", tokens: ["P2.L1"] },
        ]),
      }),
    );
    const { prices } = (await draft()).seasons[0] ?? {};
    expect(prices?.double).toHaveLength(1);
    expect(prices?.double[0]?.evidence.map((one) => one.token)).toEqual(["P1.L2", "P2.L1"]);
    expect(prices?.triple.map((one) => one.value)).toEqual([null, null]);
  });

  it("refuses lines the trip was not found with, and a trip whose lines all vanished, without a call", async () => {
    const { draft, model, calls, inOrg, input } = await agency();
    expect(await reasonOf(draft({ trip: { ...input.trip, tokens: ["P8.L8"] } }))).toBe("PACKAGE_DRAFT_STALE");
    expect(await reasonOf(draft({ trip: { ...input.trip, ref: "trip-9" } }))).toBe("PACKAGE_DRAFT_STALE");
    expect(model.requests).toHaveLength(1);
    expect(await calls()).toBe(1);
    // Another agency's fill, or one that is not a package draft, is not found.
    const other = await inOrg((tx) =>
      tx.aiFill.create({
        data: {
          target: "lead",
          requestedBy: input.fillId,
          inputKind: "text",
          model: "m",
          proposalHash: "h",
        },
        select: { id: true },
      }),
    );
    expect(await reasonOf(draft({ fillId: other.id }))).toBe("NOT_FOUND");
  });

  it("refuses to draft from lines that changed since the trip was found, and uses no call", async () => {
    const { draft, model, calls, inOrg } = await agency();
    // A new first line renumbers every line of the piece: the tokens now name other lines.
    const manali = await inOrg((tx) => tx.aiKnowledge.findFirst({ where: { title: "Manali" } }));
    await inOrg((tx) =>
      tx.aiKnowledge.update({
        where: { id: manali?.id ?? "" },
        data: { body: `A new first line\n${manali?.body ?? ""}` },
      }),
    );
    model.answer(answer());
    expect(await reasonOf(draft())).toBe("PACKAGE_DRAFT_STALE");
    expect(model.requests).toHaveLength(1);
    expect(await calls()).toBe(1);
  });

  it("drafts when lines after the trip's own were added", async () => {
    const { draft, model, inOrg } = await agency();
    const rates = await inOrg((tx) => tx.aiKnowledge.findFirst({ where: { title: "Manali rates 2" } }));
    await inOrg((tx) =>
      tx.aiKnowledge.update({
        where: { id: rates?.id ?? "" },
        data: { body: `${rates?.body ?? ""}\nA line added at the end` },
      }),
    );
    model.answer(answer());
    expect((await draft()).name.value).toBe("Manali 5N6D");
  });

  it("gives the call back when the answer is unusable", async () => {
    const { draft, model, calls } = await agency();
    model.answer("not json");
    expect(await reasonOf(draft())).toBe("PACKAGE_DRAFT_NOTHING");
    expect(await calls()).toBe(1);
  });
});

// The lite agent's suggestions to mark a lead Lost or Not a lead: written by the act step once, never again for a kind a
// person turned down, and moved only by a person's yes, inside their scope; erased with the customer.
import { liteFacts, type UnderstandForm } from "@travel-crm/contracts/ai";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { softDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { actOnMove } from "../../../src/ai/lite/act.js";
import { situationOf } from "../../../src/ai/lite/lookups/situation.js";
import {
  decideStageSuggestion,
  stageSuggestionOfLead,
  stageSuggestionsOf,
  suggestStage,
} from "../../../src/ai/lite/suggestions.js";
import type { CheckedForm, Decision } from "../../../src/ai/lite/types.js";
import { withdrawAiParts } from "../../../src/ai/erasure.js";
import { DomainError } from "../../../src/kernel/index.js";
import { auditOf, memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteToday, liteTurnAt } from "./support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;

const notInterested = { kind: "lost", lostReason: "other", reason: "Said they're not interested." } as const;
const closing = (on: Agency, suggest: Decision["suggest"]): Decision => ({
  move: { kind: "fixed", text: "close" },
  stage: "quoted",
  why: "test",
  facts: { ...liteFacts.parse({ agent: "lite" }), lastMove: "close" },
  stopFollowUps: true,
  note: null,
  task: null,
  stageTo: null,
  suggest,
});
const formWith = (looksFake: boolean, why: string): CheckedForm => {
  const form: UnderstandForm = {
    intents: [{ name: "package_question", proof: "" }],
    details: {
      package: null,
      place: null,
      date: null,
      adults: null,
      children: null,
      name: null,
      pickup_city: null,
      room: null,
      pay_in_full: null,
    },
    open_to_other_trips: "unknown",
    lookups: [],
    language: "english",
    summary: "",
    score: {
      chance: 3,
      label: "cold",
      reasons: [],
      looks_fake: looksFake,
      fake_why: why,
      standing: "",
      next_step: "",
    },
  };
  return { form, proofs: {}, dropped: [] };
};
const failure = (error: unknown) => (error instanceof DomainError ? error.reason : String(error));

describe("the agent's suggestion to mark a lead Lost or Not a lead", () => {
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

  /** The act step for a turn with this decision (and form), as the turn runs it. */
  function act(on: Agency, decision: Decision, checked: CheckedForm | null = null) {
    return on.inOrg(async (tx) => {
      const situation = await situationOf(
        tx,
        { index: [], answers: {}, facts: decision.facts, today: liteToday, now: liteTurnAt },
        [],
      );
      return actOnMove(
        tx,
        { files: test.files, recipients: () => Promise.resolve([]), storageLimitBytes: null, supplierStateCode: "27" },
        {
          organizationId: on.organizationId,
          conversationId: on.chat.id,
          token: on.message.id,
          kind: "reply",
          now: liteTurnAt,
          today: liteToday,
          timeZone: "Asia/Kolkata",
          decision,
          language: "english",
          reply: { text: "Okay, thank you.", filled: [] },
          situation,
          checked,
          model: null,
          agencyName: "Sharma Holidays",
        },
      );
    });
  }
  const rows = (on: Agency) => on.inOrg((tx) => tx.leadAiSuggestion.findMany({ where: { leadId: on.leadId } }));
  const owner = (on: Agency) => memberOf(on.organizationId, "org-owner");
  const suggest = (on: Agency, kind: "lost" | "not_a_lead" = "lost") =>
    on.inOrg((tx) =>
      suggestStage(tx, {
        organizationId: on.organizationId,
        leadId: on.leadId,
        conversationId: on.chat.id,
        kind,
        lostReason: kind === "lost" ? "other" : null,
        reason: "Because.",
        now: liteTurnAt,
      }),
    );

  it("not interested suggests Lost once", async () => {
    const on = await liteAgency(test);
    await act(on, closing(on, notInterested));
    expect(await rows(on)).toMatchObject([
      { kind: "lost", lostReason: "other", reason: "Said they're not interested.", state: "open" },
    ]);
    expect(await auditOf(test, on.organizationId, on.leadId).then((a) => a.map((e) => e.action))).toContain(
      "ai.stage-suggested",
    );
    // The next turn finds one open and adds none.
    expect(await suggest(on)).toBe(false);
    expect(await rows(on)).toHaveLength(1);
  });

  it("looks fake suggests Not a lead with its reason", async () => {
    const on = await liteAgency(test);
    await act(on, closing(on, null), formWith(true, "Typed a keyboard mash"));
    expect(await rows(on)).toMatchObject([
      { kind: "not_a_lead", lostReason: null, reason: "Looks fake: Typed a keyboard mash", state: "open" },
    ]);
    const clean = await liteAgency(test);
    await act(clean, closing(clean, null), formWith(false, ""));
    expect(await rows(clean)).toEqual([]);
  });

  it("cuts a long reason at 200 characters", async () => {
    const on = await liteAgency(test);
    await act(on, closing(on, null), formWith(true, "x".repeat(160)));
    const [row] = await rows(on);
    expect(row?.reason).toBe(`Looks fake: ${"x".repeat(160)}`);
    expect((row?.reason ?? "").length).toBeLessThanOrEqual(200);
  });

  it("a declined kind is not suggested again, another kind is", async () => {
    const on = await liteAgency(test);
    expect(await suggest(on)).toBe(true);
    const [first] = await rows(on);
    await on.inOrg((tx) =>
      decideStageSuggestion(tx, owner(on), { suggestionId: first?.id ?? "", accept: false }, liteTurnAt),
    );
    expect(await suggest(on)).toBe(false);
    expect(await suggest(on, "not_a_lead")).toBe(true);
    expect(await rows(on)).toHaveLength(2);
  });

  it("adds nothing for a lead that is no longer open", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: { stage: "won" } }));
    expect(await suggest(on)).toBe(false);
    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: { stage: "booking_requested" } }));
    expect(await suggest(on)).toBe(false);
    expect(await rows(on)).toEqual([]);
  });

  it("yes moves the lead and closes the suggestion", async () => {
    const on = await liteAgency(test);
    await suggest(on);
    const [row] = await rows(on);
    const member = owner(on);
    await on.inOrg((tx) =>
      decideStageSuggestion(tx, member, { suggestionId: row?.id ?? "", accept: true }, liteTurnAt),
    );
    const after = await on.inOrg(async (tx) => ({
      lead: await tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }),
      suggestion: await tx.leadAiSuggestion.findUniqueOrThrow({ where: { id: row?.id ?? "" } }),
    }));
    expect(after.lead).toMatchObject({ stage: "lost", lostReason: "other" });
    expect(after.suggestion).toMatchObject({ state: "accepted", decidedBy: member.userId, decidedAt: liteTurnAt });
    const entries = await auditOf(test, on.organizationId, on.leadId);
    expect(entries.map((entry) => entry.action)).toContain("ai.stage-suggestion-accepted");
    // The move is the member's own, not the system's.
    expect(entries.find((entry) => entry.action === "lead.stage-changed")).toMatchObject({
      actorUserId: member.userId,
    });
    // Decided once: a second tap finds nothing open.
    expect(
      await on
        .inOrg((tx) => decideStageSuggestion(tx, member, { suggestionId: row?.id ?? "", accept: true }, liteTurnAt))
        .catch(failure),
    ).toBe("NOT_FOUND");
  });

  it("no declines the suggestion and leaves the lead", async () => {
    const on = await liteAgency(test);
    await suggest(on, "not_a_lead");
    const [row] = await rows(on);
    await on.inOrg((tx) =>
      decideStageSuggestion(tx, owner(on), { suggestionId: row?.id ?? "", accept: false }, liteTurnAt),
    );
    const lead = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    expect(lead.stage).toBe("new");
    expect((await rows(on))[0]?.state).toBe("declined");
    expect((await auditOf(test, on.organizationId, on.leadId)).map((entry) => entry.action)).toContain(
      "ai.stage-suggestion-declined",
    );
    expect(await on.inOrg((tx) => stageSuggestionOfLead(tx, owner(on), on.leadId))).toBeNull();
  });

  it("yes on a lead already moved on changes nothing", async () => {
    const on = await liteAgency(test);
    await suggest(on);
    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: { stage: "booking_requested" } }));
    const [row] = await rows(on);
    await on.inOrg((tx) =>
      decideStageSuggestion(tx, owner(on), { suggestionId: row?.id ?? "", accept: true }, liteTurnAt),
    );
    const after = await on.inOrg(async (tx) => ({
      lead: await tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }),
      suggestion: await tx.leadAiSuggestion.findUniqueOrThrow({ where: { id: row?.id ?? "" } }),
    }));
    expect(after.lead.stage).toBe("booking_requested");
    expect(after.suggestion.state).toBe("declined");
  });

  it("lists the open ones in the member's scope, and a member outside it gets NOT_FOUND", async () => {
    const on = await liteAgency(test);
    await suggest(on);
    const [row] = await rows(on);
    const stranger = memberOf(on.organizationId, "sales");
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, owner(on)))).toMatchObject([
      { id: row?.id, leadId: on.leadId, kind: "lost" },
    ]);
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, stranger))).toEqual([]);
    expect(await on.inOrg((tx) => stageSuggestionOfLead(tx, stranger, on.leadId))).toBeNull();
    expect(
      await on
        .inOrg((tx) => decideStageSuggestion(tx, stranger, { suggestionId: row?.id ?? "", accept: true }, liteTurnAt))
        .catch(failure),
    ).toBe("NOT_FOUND");
    expect((await rows(on))[0]?.state).toBe("open");
  });

  it("a soft-deleted lead's suggestion is out of the list and the alert", async () => {
    const on = await liteAgency(test);
    await suggest(on);
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, owner(on)))).toHaveLength(1);
    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: softDeleted(owner(on).userId) }));
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, owner(on)))).toEqual([]);
    expect(await on.inOrg((tx) => stageSuggestionOfLead(tx, owner(on), on.leadId))).toBeNull();
  });

  it("a second decision on one suggestion is NOT_FOUND and the first stands", async () => {
    const on = await liteAgency(test);
    await suggest(on);
    const [row] = await rows(on);
    const first = owner(on);
    await on.inOrg((tx) => decideStageSuggestion(tx, first, { suggestionId: row?.id ?? "", accept: true }, liteTurnAt));
    const second = memberOf(on.organizationId, "org-owner");
    expect(
      await on
        .inOrg((tx) => decideStageSuggestion(tx, second, { suggestionId: row?.id ?? "", accept: false }, liteTurnAt))
        .catch(failure),
    ).toBe("NOT_FOUND");
    expect((await rows(on))[0]).toMatchObject({ state: "accepted", decidedBy: first.userId });
    const declined = (await auditOf(test, on.organizationId, on.leadId)).filter(
      (entry) => entry.action === "ai.stage-suggestion-declined",
    );
    expect(declined).toEqual([]);
  });

  it("two members deciding at once: one decides, the other is NOT_FOUND", async () => {
    const on = await liteAgency(test);
    await suggest(on);
    const [row] = await rows(on);
    const decide = (accept: boolean) =>
      on.inOrg((tx) =>
        decideStageSuggestion(
          tx,
          memberOf(on.organizationId, "org-owner"),
          { suggestionId: row?.id ?? "", accept },
          liteTurnAt,
        ),
      );
    const results = await Promise.allSettled([decide(true), decide(false)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [only] = await rows(on);
    const lead = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    expect(only?.state === "accepted").toBe(lead.stage === "lost");
  });

  it("an erased customer's suggestions go", async () => {
    const on = await liteAgency(test);
    await suggest(on);
    const person = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    const result = await platformDb.transaction((tx) =>
      withdrawAiParts(tx, {
        organizationId: on.organizationId,
        personId: person.personId,
        leadIds: [on.leadId],
        now: liteTurnAt,
      }),
    );
    expect(result.suggestions).toBe(1);
    expect(await rows(on)).toEqual([]);
  });
});

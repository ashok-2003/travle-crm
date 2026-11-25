// The agent's suggestions to mark a lead Lost or Not a lead: written once, never again for a kind a person turned down,
// and moved only by a person's yes, inside their scope; erased with the customer.
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { softDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  decideStageSuggestion,
  stageSuggestionOfLead,
  stageSuggestionsOf,
  suggestStage,
} from "../../../src/ai/lite/suggestions.js";
import { withdrawAiParts } from "../../../src/ai/erasure.js";
import { DomainError } from "../../../src/kernel/index.js";
import { auditOf, memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteTurnAt } from "./support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;

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

  const rows = (on: Agency) => on.inOrg((tx) => tx.leadAiSuggestion.findMany({ where: { leadId: on.leadId } }));
  const owner = (on: Agency) => memberOf(on.organizationId, "org-owner");
  const suggest = (on: Agency, kind: "lost" | "not_a_lead" = "lost", reason = "Because.") =>
    on.inOrg((tx) =>
      suggestStage(tx, {
        organizationId: on.organizationId,
        leadId: on.leadId,
        conversationId: on.chat.id,
        kind,
        lostReason: kind === "lost" ? "other" : null,
        reason,
        now: liteTurnAt,
      }),
    );

  it("suggests Lost once, audited", async () => {
    const on = await liteAgency(test);
    expect(await suggest(on)).toBe(true);
    expect(await rows(on)).toMatchObject([{ kind: "lost", lostReason: "other", reason: "Because.", state: "open" }]);
    expect(await auditOf(test, on.organizationId, on.leadId).then((a) => a.map((e) => e.action))).toContain(
      "ai.stage-suggested",
    );
    // The next turn finds one open and adds none.
    expect(await suggest(on)).toBe(false);
    expect(await rows(on)).toHaveLength(1);
  });

  it("cuts a long reason at 200 characters", async () => {
    const on = await liteAgency(test);
    expect(await suggest(on, "not_a_lead", "x".repeat(300))).toBe(true);
    const [row] = await rows(on);
    expect(row?.reason).toBe("x".repeat(200));
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
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, owner(on), { mine: false }))).toMatchObject([
      { id: row?.id, leadId: on.leadId, kind: "lost" },
    ]);
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, stranger, { mine: false }))).toEqual([]);
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
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, owner(on), { mine: false }))).toHaveLength(1);
    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: softDeleted(owner(on).userId) }));
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, owner(on), { mine: false }))).toEqual([]);
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
      withdrawAiParts(tx, createMemoryStorage(), {
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

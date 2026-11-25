// ai.packageChanges on the real router: Show the changes needs ai:suggest and quotes:edit, Apply, Undo all and latest need
// quotes:edit; a run goes propose, apply, undo; the plan's departures decide whether departure changes are allowed; and
// refusals reach the client as their status with their reason.
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import { saveAiSettings } from "@travel-crm/domain/ai";
import type { Permission } from "@travel-crm/domain/identity";
import { savePackageSeason } from "@travel-crm/domain/quotes";
import type { Context } from "../src/context.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const plan: PlanModule[] = ["crm", "quotes", "ai", "departures"];

/** A scripted AI model: answers the queued texts in order (the api package does not depend on the integrations package). */
function scriptedModel(configured = true) {
  const answers: string[] = [];
  const model: NonNullable<Context["ai"]> = {
    configured,
    complete: () =>
      Promise.resolve(
        answers.length === 0
          ? { ok: false, reason: "not_configured" }
          : { ok: true, text: answers.shift() ?? "", model: "test-model", inputTokens: 0, outputTokens: 0 },
      ),
  };
  return { model, answer: (text: string) => answers.push(text) };
}

/** The tRPC status a call is refused with, and its reason. */
async function statusOf(call: Promise<unknown>): Promise<[string, string | null]> {
  try {
    await call;
    return ["accepted", null];
  } catch (error) {
    const cause = (error as { cause?: { reason?: string } }).cause;
    return [(error as { code: string }).code, cause?.reason ?? null];
  }
}

const answer = JSON.stringify({
  changes: [
    { kind: "season_change", season: "S1", label: null, prices: [{ room: "double", printed: "6,499" }], lines: ["L1"] },
    { kind: "note_add", line: "Carry ID proof", lines: ["L2"] },
    { kind: "departures_add", dates: ["8 Jan"], weekly: null, lines: ["L3"] },
  ],
});
const text = "Regular double now 6499\nCarry ID proof\nNew departure 8 Jan";

describe("ai.packageChanges", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function setUp(modules: PlanModule[] = plan) {
    const organizationId = await anAgency(harness, { modules });
    const model = scriptedModel();
    const { caller, member } = callerOf(harness, { organizationId, context: { ai: model.model } });
    const packageId = await harness.db.forOrg(organizationId, async (tx) => {
      await saveAiSettings(tx, member, { enabled: true, scoring: true }, { providerReady: true, now: new Date() });
      const trip = await tx.quoteTemplate.create({
        data: { name: "Hill town 4N/5D", title: "Hill town", kind: "group", nights: 4, roomTypes: ["double"] },
        select: { id: true },
      });
      await savePackageSeason(tx, member, {
        packageId: trip.id,
        label: "Regular",
        startsOn: "2026-01-01",
        endsOn: "2099-12-31",
        prices: { ...none, double: 699_900 },
      });
      return trip.id;
    });
    return { organizationId, caller, model, packageId };
  }

  it("refuses each procedure without its permission", async () => {
    const organizationId = await anAgency(harness, { modules: plan });
    const runId = randomUUID();
    const packageId = randomUUID();
    const propose = { packageId, text, attachmentIds: [], answers: [] };
    const withOnly = (granted: Permission[]) => callerOf(harness, { organizationId, granted }).caller;
    expect(await refusal(withOnly(["quotes:edit"]).ai.packageChanges.propose(propose))).toBe("MISSING_PERMISSION");
    const aiOnly = withOnly(["ai:suggest"]).ai.packageChanges;
    expect(await refusal(aiOnly.propose(propose))).toBe("MISSING_PERMISSION");
    expect(await refusal(aiOnly.applyChanges({ runId, changeIds: ["c1"] }))).toBe("MISSING_PERMISSION");
    expect(await refusal(aiOnly.undo({ runId }))).toBe("MISSING_PERMISSION");
    expect(await refusal(aiOnly.latest({ packageId }))).toBe("MISSING_PERMISSION");
    expect(await refusal(aiOnly.requestInput({ contentType: "application/pdf", sizeBytes: 1000 }))).toBe(
      "MISSING_PERMISSION",
    );
  });

  it("shows the changes, applies the ticked ones, says they can be undone, and undoes them", async () => {
    const { caller, model, packageId } = await setUp();
    model.answer(answer);
    const proposal = await caller.ai.packageChanges.propose({ packageId, text, attachmentIds: [], answers: [] });
    expect(proposal.changes.map((change) => [change.id, change.kind])).toEqual([
      ["c1", "season_change"],
      ["c2", "note_add"],
      ["c3", "departures_add"],
    ]);
    expect(await caller.ai.packageChanges.latest({ packageId })).toBeNull();

    expect(await caller.ai.packageChanges.applyChanges({ runId: proposal.runId, changeIds: ["c1", "c2"] })).toEqual({
      applied: 2,
    });
    expect(await caller.ai.packageChanges.latest({ packageId })).toMatchObject({
      runId: proposal.runId,
      applied: 2,
      undoable: true,
    });
    expect(await caller.ai.packageChanges.undo({ runId: proposal.runId })).toEqual({ undone: 2, kept: [] });
    expect(await caller.ai.packageChanges.latest({ packageId })).toBeNull();
  });

  it("flags departure changes as not allowed on a plan without departures", async () => {
    const { caller, model, packageId } = await setUp(["crm", "quotes", "ai"]);
    model.answer(answer);
    const proposal = await caller.ai.packageChanges.propose({ packageId, text, attachmentIds: [], answers: [] });
    expect(proposal.changes.find((change) => change.kind === "departures_add")?.flags).toContain("not_allowed");
    expect(proposal.changes.find((change) => change.kind === "note_add")?.flags).toEqual([]);
    expect(await statusOf(caller.ai.packageChanges.applyChanges({ runId: proposal.runId, changeIds: ["c3"] }))).toEqual(
      ["FORBIDDEN", "MISSING_PERMISSION"],
    );
  });

  it("refuses with each reason's status", async () => {
    const { organizationId, caller, model, packageId } = await setUp();
    expect(
      await statusOf(caller.ai.packageChanges.propose({ packageId, text: " ", attachmentIds: [], answers: [] })),
    ).toEqual(["BAD_REQUEST", "PACKAGE_CHANGES_EMPTY"]);
    expect(await statusOf(caller.ai.packageChanges.applyChanges({ runId: randomUUID(), changeIds: ["c1"] }))).toEqual([
      "NOT_FOUND",
      "NOT_FOUND",
    ]);

    model.answer(answer);
    const changed = await caller.ai.packageChanges.propose({ packageId, text, attachmentIds: [], answers: [] });
    await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.update({ where: { id: packageId }, data: { exclusions: "Lunch" } }),
    );
    expect(await statusOf(caller.ai.packageChanges.applyChanges({ runId: changed.runId, changeIds: ["c2"] }))).toEqual([
      "CONFLICT",
      "TRIP_CHANGED_SINCE",
    ]);

    model.answer(answer);
    const used = await caller.ai.packageChanges.propose({ packageId, text, attachmentIds: [], answers: [] });
    await caller.ai.packageChanges.applyChanges({ runId: used.runId, changeIds: ["c2"] });
    expect(await statusOf(caller.ai.packageChanges.applyChanges({ runId: used.runId, changeIds: ["c1"] }))).toEqual([
      "CONFLICT",
      "PACKAGE_CHANGES_USED",
    ]);
    expect(await statusOf(caller.ai.packageChanges.undo({ runId: changed.runId }))).toEqual([
      "CONFLICT",
      "PACKAGE_CHANGES_NOT_UNDOABLE",
    ]);

    model.answer("Not JSON at all");
    expect(
      await statusOf(caller.ai.packageChanges.propose({ packageId, text, attachmentIds: [], answers: [] })),
    ).toEqual(["CONFLICT", "AI_ANSWER_UNREADABLE"]);
  });

  it("refuses with AI_NOT_READY when the model has no key", async () => {
    const organizationId = await anAgency(harness, { modules: plan });
    const { caller } = callerOf(harness, { organizationId, context: { ai: scriptedModel(false).model } });
    expect(
      await refusal(
        caller.ai.packageChanges.propose({ packageId: randomUUID(), text, attachmentIds: [], answers: [] }),
      ),
    ).toBe("AI_NOT_READY");
  });
});

// people.consent and people.withdrawConsent: the lead's person card, in scope like the lead page, on a real database.
import { randomUUID } from "node:crypto";
import { recordConsent } from "@travel-crm/domain/crm";
import { publicActor } from "@travel-crm/domain/kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, memberOf, refusal, type Harness } from "./forms-support.js";

describe("people router", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function leadWithConsent(organizationId: string, ownerUserId: string | null) {
    return harness.db.forOrg(organizationId, async (tx) => {
      const person = await tx.person.create({
        data: { name: "Meera", phoneE164: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
      });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "web_form", ownerUserId } });
      await recordConsent(tx, publicActor(organizationId), {
        personId: person.id,
        wording: "Send me travel offers and updates from Asha Travels.",
        wordingVersion: 1,
        formId: randomUUID(),
        now: new Date("2026-10-20T06:00:00Z"),
      });
      return lead.id;
    });
  }

  it("consent shows the latest state, from the form", async () => {
    const organizationId = await anAgency(harness);
    const leadId = await leadWithConsent(organizationId, null);
    const { caller } = callerOf(harness, { organizationId });
    expect(await caller.people.consent({ leadId })).toEqual({
      state: "granted",
      at: "2026-10-20T06:00:00.000Z",
      fromForm: true,
    });
  });

  it("consent hides a lead outside the caller's scope as NOT_FOUND", async () => {
    const organizationId = await anAgency(harness);
    const leadId = await leadWithConsent(organizationId, randomUUID());
    const ownScope = memberOf(organizationId, []);
    const own = {
      ...ownScope,
      permissions: (await import("@travel-crm/domain/identity")).PermissionSet.of([
        { permission: "leads:view", scope: "own" as const },
      ]),
    };
    const { caller } = callerOf(harness, { organizationId }, own);
    expect(await refusal(caller.people.consent({ leadId }))).toBe("NOT_FOUND");
    expect(await refusal(caller.people.consent({ leadId: randomUUID() }))).toBe("NOT_FOUND");
  });

  it("withdrawConsent needs leads:edit, and then the latest row decides", async () => {
    const organizationId = await anAgency(harness);
    const leadId = await leadWithConsent(organizationId, null);
    const { caller: viewer } = callerOf(harness, { organizationId, granted: ["leads:view"] });
    expect(await refusal(viewer.people.withdrawConsent({ leadId }))).toBe("MISSING_PERMISSION");
    const { caller } = callerOf(harness, { organizationId });
    const withdrawn = await caller.people.withdrawConsent({ leadId });
    expect(withdrawn).toMatchObject({ state: "withdrawn", fromForm: false });
    expect(await caller.people.consent({ leadId })).toMatchObject({ state: "withdrawn" });
    expect(await caller.people.withdrawConsent({ leadId })).toMatchObject({ state: "withdrawn" });
    expect(await harness.db.forOrg(organizationId, (tx) => tx.personConsent.count())).toBe(2);
  });
});

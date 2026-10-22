// When a form is open and why not: every closed state is one FORM_UNAVAILABLE to a visitor, the Owner's page names the
// reason, and a wrong key is not found rather than unavailable.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancel, suspend } from "../../src/subscriptions/index.js";
import {
  assertFormOpen,
  assertHasOwner,
  formKeyOf,
  formOpenState,
  newKeySecret,
  readWebsiteForm,
  setWebsiteFormEnabled,
  type WebsiteFormRow,
} from "../../src/website-forms/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { aDemoAgency, anAgency, anOpenForm, anOwnerId, createTestForms, testNow, type TestForms } from "./support.js";
import { byAdmin } from "../subscriptions/test-subscriptions.js";

const readOnlyDay = new Date("2026-11-08T06:00:00Z");

describe("the open check", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  const open = (organizationId: string, key: string, owner: string | null = anOwnerId(), now = testNow) =>
    test.db.forOrg(organizationId, (tx) => assertFormOpen(tx, { key, organizationId, ownerUserId: owner, now }));
  const stateOf = (
    organizationId: string,
    form: WebsiteFormRow | null,
    owner: string | null = anOwnerId(),
    now = testNow,
  ) => test.db.forOrg(organizationId, (tx) => formOpenState(tx, { organizationId, form, ownerUserId: owner, now }));
  const unavailable = { code: "FORBIDDEN", reason: "FORM_UNAVAILABLE" };

  it("opens for a form that is on, paid, on a plan with crm, with an Owner", async () => {
    const organizationId = await anAgency(test);
    const { form, key } = await anOpenForm(test, organizationId);
    await expect(open(organizationId, key)).resolves.toMatchObject({ id: form.id });
    expect(await stateOf(organizationId, form)).toEqual({ open: true, reason: null });
  });

  it("assertFormOpen refuses every closed state with one error", async () => {
    const closed: Record<string, () => Promise<{ organizationId: string; key: string; owner?: null; now?: Date }>> = {
      off: async () => {
        const organizationId = await anAgency(test);
        const { key } = await anOpenForm(test, organizationId);
        await test.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, systemActor(organizationId), false));
        return { organizationId, key };
      },
      read_only: async () => {
        const organizationId = await anAgency(test);
        return { organizationId, ...(await anOpenForm(test, organizationId)), now: readOnlyDay };
      },
      suspended: async () => {
        const organizationId = await anAgency(test);
        const { key } = await anOpenForm(test, organizationId);
        await test.platformDb.transaction((tx) =>
          suspend(tx, byAdmin, { organizationId, reason: "Chargeback" }, testNow),
        );
        return { organizationId, key };
      },
      cancelled: async () => {
        const organizationId = await anAgency(test);
        const { key } = await anOpenForm(test, organizationId);
        await test.platformDb.transaction((tx) => cancel(tx, byAdmin, { organizationId, reason: "Closed" }, testNow));
        return { organizationId, key };
      },
      plan: async () => {
        const organizationId = await anAgency(test, test.noCrmPlan);
        return { organizationId, ...(await anOpenForm(test, organizationId)) };
      },
      demo: async () => {
        const organizationId = await aDemoAgency(test);
        return { organizationId, ...(await anOpenForm(test, organizationId)) };
      },
      no_owner: async () => {
        const organizationId = await anAgency(test);
        return { organizationId, ...(await anOpenForm(test, organizationId)), owner: null };
      },
    };
    for (const [reason, arrange] of Object.entries(closed)) {
      const { organizationId, key, owner, now } = await arrange();
      await expect(open(organizationId, key, owner === null ? null : anOwnerId(), now), reason).rejects.toMatchObject(
        unavailable,
      );
      const form = await test.db.forOrg(organizationId, readWebsiteForm);
      expect(await stateOf(organizationId, form, owner === null ? null : anOwnerId(), now), reason).toEqual({
        open: false,
        reason,
      });
    }
  });

  it("a wrong secret is FORM_NOT_FOUND, not UNAVAILABLE, even when the form is closed", async () => {
    const organizationId = await anAgency(test);
    await anOpenForm(test, organizationId);
    await test.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, systemActor(organizationId), false));
    const wrong = formKeyOf(organizationId, newKeySecret());
    await expect(open(organizationId, wrong)).rejects.toMatchObject({ code: "NOT_FOUND", reason: "FORM_NOT_FOUND" });
  });

  it("an unparsable key, another organization's key and no form at all are FORM_NOT_FOUND", async () => {
    const organizationId = await anAgency(test);
    const { key } = await anOpenForm(test, organizationId);
    const empty = await anAgency(test);
    const notFound = { code: "NOT_FOUND", reason: "FORM_NOT_FOUND" };
    await expect(open(organizationId, "short")).rejects.toMatchObject(notFound);
    await expect(open(empty, key)).rejects.toMatchObject(notFound);
    await expect(open(empty, formKeyOf(empty, newKeySecret()))).rejects.toMatchObject(notFound);
    await expect(open(organizationId, formKeyOf(randomUUID(), newKeySecret()))).rejects.toMatchObject(notFound);
  });

  it("names the demo before any other reason, and off for a new agency's form that is not made yet", async () => {
    const demo = await aDemoAgency(test);
    expect(await stateOf(demo, null)).toEqual({ open: false, reason: "demo" });
    const fresh = await anAgency(test);
    expect(await stateOf(fresh, null)).toEqual({ open: false, reason: "off" });
  });

  it("FORM_NEEDS_OWNER is for the Owner's page only", () => {
    expect(assertHasOwner("0199e7a0-0000-7000-8000-0000000000b1")).toBe("0199e7a0-0000-7000-8000-0000000000b1");
    expect(() => assertHasOwner(null)).toThrow(expect.objectContaining({ reason: "FORM_NEEDS_OWNER" }));
  });
});

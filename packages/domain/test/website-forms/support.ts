// What the website-forms tests need: subscribed agencies (open, on the demo plan, without crm), the module's form saved
// and switched on through its own functions, and a form row for tests that need no database.
import { randomUUID } from "node:crypto";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { SaveWebsiteFormInput } from "@travel-crm/contracts/website-forms";
import { createTestOrganization } from "@travel-crm/db/testing";
import { demoPlan, startSubscription } from "../../src/subscriptions/index.js";
import { publicActor } from "../../src/kernel/index.js";
import {
  formKeyOf,
  readWebsiteForm,
  saveWebsiteForm,
  setWebsiteFormEnabled,
  type WebsiteFormRow,
} from "../../src/website-forms/index.js";
import {
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  testNow,
  type TestSubscriptions,
} from "../subscriptions/test-subscriptions.js";

export { testNow };

export interface TestForms extends TestSubscriptions {
  crmPlan: PlanSummary;
  noCrmPlan: PlanSummary;
}

/** Connections and the two plans: one with crm, one without. Call in beforeAll; close in afterAll. */
export async function createTestForms(): Promise<TestForms> {
  const test = createTestSubscriptions();
  return {
    ...test,
    crmPlan: await createTestPlan(test, { name: "With crm", modules: ["crm"] }),
    noCrmPlan: await createTestPlan(test, { name: "Without crm", modules: ["quotes"] }),
  };
}

/** An agency paid through the end of October 2026, so it is open on the tests' clock and read-only from 8 November. */
export const anAgency = (test: TestForms, plan: PlanSummary = test.crmPlan) =>
  createSubscribedOrganization(test, plan, { paidThrough: "2026-10-31" });

/** An organization on the demo's own plan, which only the platform's job (no admin) may subscribe it to. */
export async function aDemoAgency(test: TestForms): Promise<string> {
  const organizationId = await createTestOrganization(test.platform, "Demo agency");
  await test.platformDb.transaction(async (tx) => {
    const plan = await demoPlan(tx);
    await startSubscription(
      tx,
      { userId: null },
      { organizationId, planId: plan.id, billingCycle: "monthly", trialEndsOn: null, paidThrough: "2026-10-31" },
      testNow,
    );
  });
  return organizationId;
}

export const anOwnerId = () => randomUUID();

export const defaultSettings: SaveWebsiteFormInput = {
  allowEmbed: true,
  emailMode: "optional",
  destinationMode: "optional",
  destinationInput: "list",
  travelMonthMode: "optional",
  travellersMode: "optional",
  budgetMode: "off",
  messageMode: "optional",
  offersTickbox: false,
  heading: null,
  introduction: null,
  thankYouMessage: null,
  websiteUrl: null,
  websiteButtonText: null,
  privacyUrl: null,
};

/** The agency's form, saved with these settings and turned on, by the module's own functions. */
export async function anOpenForm(
  test: TestForms,
  organizationId: string,
  settings: Partial<SaveWebsiteFormInput> = {},
): Promise<{ form: WebsiteFormRow; key: string }> {
  const actor = { ...publicActor(organizationId), source: "web" as const, userId: randomUUID() };
  await test.db.forOrg(organizationId, (tx) => saveWebsiteForm(tx, actor, { ...defaultSettings, ...settings }));
  await test.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, actor, true));
  const form = await test.db.forOrg(organizationId, readWebsiteForm);
  if (form === null) throw new Error("The form was not made");
  return { form, key: formKeyOf(organizationId, form.keySecret) };
}

/** A form row for tests that never touch the database. */
export function aFormRow(overrides: Partial<WebsiteFormRow> = {}): WebsiteFormRow {
  return {
    organizationId: randomUUID(),
    id: randomUUID(),
    keySecret: "AbCdEfGh01234567",
    enabled: true,
    allowEmbed: true,
    emailMode: "optional",
    destinationMode: "optional",
    destinationInput: "list",
    travelMonthMode: "optional",
    travellersMode: "optional",
    budgetMode: "off",
    messageMode: "optional",
    offersTickbox: false,
    heading: null,
    introduction: null,
    thankYouMessage: null,
    websiteUrl: null,
    websiteButtonText: null,
    privacyUrl: null,
    keyChangedAt: null,
    ...overrides,
  };
}

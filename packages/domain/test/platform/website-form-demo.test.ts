// The demo's website form is built off, with the defaults and a sample thank-you; two sample leads came through it, one
// with a consent row; and the demo is never open to the public, even if someone switched its form on (F14).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDemoOrganization, type DemoSettings } from "../../src/platform/index.js";
import { formOpenState, readWebsiteForm } from "../../src/website-forms/index.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

describe("the demo's website form", () => {
  let test: TestPlatform;

  beforeAll(() => {
    test = createTestPlatform();
  });

  afterAll(async () => {
    await test.close();
  });

  const demoSettings = (): DemoSettings => ({
    code: `D${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`,
    password: "demo-password-123",
  });
  const now = new Date("2026-10-17T20:30:00Z");

  it("has an off form with default fields and a sample thank-you", async () => {
    const { organizationId } = await resetDemoOrganization(test.services, demoSettings(), now);
    const form = await test.services.db.forOrg(organizationId, (tx) => readWebsiteForm(tx));
    expect(form).toMatchObject({
      enabled: false,
      allowEmbed: true,
      emailMode: "optional",
      destinationMode: "optional",
      travelMonthMode: "optional",
      travellersMode: "optional",
      budgetMode: "off",
      messageMode: "optional",
      offersTickbox: false,
    });
    expect(form?.thankYouMessage).toMatch(/thank you/i);
  });

  it("has two web_form leads and no consent row, after a reset", async () => {
    const { organizationId } = await resetDemoOrganization(test.services, demoSettings(), now);
    const { leads, consents } = await test.services.db.forOrg(organizationId, async (tx) => ({
      leads: await tx.lead.findMany({
        where: { source: "web_form" },
        select: { sourceDetail: true },
        orderBy: { sourceDetail: "asc" },
      }),
      consents: await tx.personConsent.count(),
    }));
    expect(leads.map((lead) => lead.sourceDetail)).toEqual(["Hosted link", "sharmatravels.in"]);
    // The demo's form has no offers tickbox, so no sample person agreed to offers.
    expect(consents).toBe(0);
  });

  it("is refused by formOpenState even if the form were enabled", async () => {
    const { organizationId } = await resetDemoOrganization(test.services, demoSettings(), now);
    const state = await test.services.db.forOrg(organizationId, async (tx) => {
      const form = await readWebsiteForm(tx);
      if (form === null) throw new Error("the demo has no form");
      return formOpenState(tx, {
        organizationId,
        form: { ...form, enabled: true },
        ownerUserId: randomUUID(),
        now,
      });
    });
    expect(state).toEqual({ open: false, reason: "demo" });
  });

  it("leaves exactly one form row after a second reset", async () => {
    const demo = demoSettings();
    await resetDemoOrganization(test.services, demo, now);
    const { organizationId } = await resetDemoOrganization(test.services, demo, new Date(now.getTime() + 864e5));
    expect(await test.services.db.forOrg(organizationId, (tx) => tx.websiteForm.count())).toBe(1);
  });
});

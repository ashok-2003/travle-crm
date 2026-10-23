// websiteForm.*: the settings procedures on a real database and subscription. Opening the page writes nothing; saving,
// turning on and changing the link are checked against the agency's state; the preview is the visitor's payload.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertFormOpen, parseFormKey } from "@travel-crm/domain/website-forms";
import { publicFormOf } from "../src/public-form.js";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

vi.mock("@travel-crm/contracts/features", () => ({
  features: { marketingConsent: false },
}));

const settings = {
  allowEmbed: true,
  emailMode: "optional",
  destinationMode: "optional",
  destinationInput: "list",
  travelMonthMode: "optional",
  travellersMode: "optional",
  budgetMode: "off",
  messageMode: "optional",
  offersTickbox: false,
  heading: "Plan your trip",
  introduction: null,
  thankYouMessage: null,
  websiteUrl: "https://asha.example.test",
  websiteButtonText: "Our website",
  privacyUrl: null,
} as const;

describe("websiteForm router", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  const rowsOf = (organizationId: string) => harness.db.forOrg(organizationId, (tx) => tx.websiteForm.count());

  it("get on an agency with no row returns defaults and writes nothing", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId });
    const view = await caller.websiteForm.get();
    expect(view).toMatchObject({
      key: null,
      link: null,
      embedLink: null,
      state: { open: false, reason: "off" },
      settings: { enabled: false, budgetMode: "off", emailMode: "optional" },
    });
    expect(await rowsOf(organizationId)).toBe(0);
    expect(
      await harness.db.forOrg(organizationId, (tx) => tx.auditEntry.count({ where: { entityType: "website_form" } })),
    ).toBe(0);
  });

  it("a salesperson without settings:manage is FORBIDDEN", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId, granted: ["leads:create", "leads:view"] });
    expect(await refusal(caller.websiteForm.get())).toBe("MISSING_PERMISSION");
    expect(await refusal(caller.websiteForm.save(settings))).toBe("MISSING_PERMISSION");
    const { caller: noCreate } = callerOf(harness, { organizationId, granted: ["settings:manage"] });
    expect(await refusal(noCreate.websiteForm.turnOn())).toBe("MISSING_PERMISSION");
  });

  it("save makes the form, off, and turnOn then opens it, with links under the app's address", async () => {
    const organizationId = await anAgency(harness);
    const { caller, owner } = callerOf(harness, { organizationId });
    const saved = await caller.websiteForm.save(settings);
    expect(saved.settings).toMatchObject({ enabled: false, heading: "Plan your trip" });
    expect(saved.state).toEqual({ open: false, reason: "off" });
    const on = await caller.websiteForm.turnOn();
    expect(on.state).toEqual({ open: true, reason: null });
    expect(on.ownerName).toBe(owner === null ? null : "Asha Rao");
    expect(on.link).toBe(`https://app.example.test/f/${on.key ?? ""}`);
    expect(on.embedLink).toBe(`https://app.example.test/embed/${on.key ?? ""}`);
    expect(parseFormKey(on.key ?? "")?.organizationId).toBe(organizationId);
    expect((await caller.websiteForm.turnOff()).state).toEqual({ open: false, reason: "off" });
  });

  it("turnOn with no Owner is FORM_NEEDS_OWNER, and on the demo FORM_UNAVAILABLE", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId, owner: null });
    expect(await refusal(caller.websiteForm.turnOn())).toBe("FORM_NEEDS_OWNER");
    const demo = await anAgency(harness, { demo: true });
    const { caller: demoCaller } = callerOf(harness, { organizationId: demo });
    expect(await refusal(demoCaller.websiteForm.turnOn())).toBe("FORM_UNAVAILABLE");
    expect((await demoCaller.websiteForm.get()).state.reason).toBe("demo");
  });

  it("turnOff and changeLink work while the agency is read-only, turnOn and save do not", async () => {
    const organizationId = await anAgency(harness);
    const active = callerOf(harness, { organizationId });
    await active.caller.websiteForm.save(settings);
    await active.caller.websiteForm.turnOn();
    // 8 November 2026: eight days past October 31, so the agency is read-only.
    const { caller } = callerOf(harness, { organizationId, now: new Date("2026-11-08T06:00:00Z") }, active.member);
    expect(await refusal(caller.websiteForm.save(settings))).toBe("ORGANIZATION_READ_ONLY");
    expect(await refusal(caller.websiteForm.turnOn())).toBe("ORGANIZATION_READ_ONLY");
    await expect(caller.websiteForm.changeLink()).resolves.toMatchObject({ settings: { enabled: true } });
    await expect(caller.websiteForm.turnOff()).resolves.toMatchObject({ settings: { enabled: false } });
  });

  it("changeLink returns a new link, and the old key is FORM_NOT_FOUND", async () => {
    const organizationId = await anAgency(harness);
    const { caller, owner } = callerOf(harness, { organizationId });
    await caller.websiteForm.save(settings);
    const first = await caller.websiteForm.turnOn();
    const second = await caller.websiteForm.changeLink();
    expect(second.link).not.toBe(first.link);
    const open = (key: string) =>
      harness.db.forOrg(organizationId, (tx) =>
        assertFormOpen(tx, {
          key,
          organizationId,
          ownerUserId: owner,
          via: "hosted",
          now: new Date("2026-10-22T06:00:00Z"),
        }),
      );
    await expect(open(first.key ?? "")).rejects.toMatchObject({ reason: "FORM_NOT_FOUND" });
    await expect(open(second.key ?? "")).resolves.toBeDefined();
    expect(JSON.stringify(await harness.db.forOrg(organizationId, (tx) => tx.auditEntry.findMany()))).not.toContain(
      second.key?.slice(22) ?? "x",
    );
  });

  it("changeLink before the first save is FORM_NOT_FOUND", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId });
    expect(await refusal(caller.websiteForm.changeLink())).toBe("FORM_NOT_FOUND");
  });

  it("preview returns what the public form would, with the sample token", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId });
    await harness.db.forOrg(organizationId, (tx) => tx.destination.create({ data: { name: "Goa" } }));
    const preview = await caller.websiteForm.preview(settings);
    expect(preview).toMatchObject({
      organizationName: "Asha Travels",
      heading: "Plan your trip",
      thankYouMessage: "Thank you! Asha Travels will get in touch with you soon.",
      openedToken: "preview",
      turnstileSiteKey: null,
      logoUrl: null,
      colour: null,
      offersTickbox: false,
      offersWording: null,
      destinations: [{ name: "Goa" }],
      fields: { email: "optional", budget: "off" },
    });
    expect(preview.months).toHaveLength(12);
    expect(preview.months[0]).toBe("2026-10");
    expect(preview.months[11]).toBe("2027-09");
    const direct = await publicFormOf(
      {
        db: harness.db,
        identity: {
          organizationProfile: () =>
            Promise.resolve({
              id: organizationId,
              name: "Asha Travels",
              code: "A",
              timeZone: "Asia/Kolkata",
              contactEmail: null,
            }),
        },
        profiles: { get: () => Promise.resolve(null) },
        files: { list: () => Promise.resolve([]), systemDownloadLink: () => Promise.reject(new Error("none")) },
      },
      { organizationId, settings, openedToken: "preview", turnstileSiteKey: null, now: new Date() },
    );
    expect({ ...direct, months: [] }).toEqual({ ...preview, months: [] });
  });

  it("offersTickbox true is refused while the switch is off, in save and preview", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId });
    expect(await refusal(caller.websiteForm.save({ ...settings, offersTickbox: true }))).toBe(
      "FORM_OFFERS_NOT_AVAILABLE",
    );
    expect(await refusal(caller.websiteForm.preview({ ...settings, offersTickbox: true }))).toBe(
      "FORM_OFFERS_NOT_AVAILABLE",
    );
    expect(await rowsOf(organizationId)).toBe(0);
  });

  it("counts are zero before the first save", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId });
    expect(await caller.websiteForm.counts()).toEqual({ enquiries: 0, newLeads: 0, repeatEnquiries: 0, stopped: 0 });
  });
});

// The form's settings: opening the page writes nothing, the first save makes the row off, turning on is one audit entry,
// and changing the link writes a new secret that appears in no log.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import {
  assertFormOpen,
  changeWebsiteFormLink,
  formKeyOf,
  readWebsiteForm,
  saveWebsiteForm,
  setWebsiteFormEnabled,
} from "../../src/website-forms/index.js";
import { anAgency, anOwnerId, createTestForms, defaultSettings, testNow, type TestForms } from "./support.js";

describe("website form settings", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  const staff = (organizationId: string) => ({
    ...systemActor(organizationId),
    source: "web" as const,
    userId: randomUUID(),
  });
  const auditOf = (organizationId: string) =>
    test.db.forOrg(organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityType: "website_form" }, orderBy: { id: "asc" } }),
    );

  it("opening the page writes nothing: no row until the first save", async () => {
    const organizationId = await anAgency(test);
    expect(await test.db.forOrg(organizationId, readWebsiteForm)).toBeNull();
    expect(await test.db.forOrg(organizationId, (tx) => tx.websiteForm.count())).toBe(0);
    expect(await auditOf(organizationId)).toEqual([]);
  });

  it("the first save creates the row off, with the saved settings", async () => {
    const organizationId = await anAgency(test);
    const actor = staff(organizationId);
    const saved = await test.db.forOrg(organizationId, (tx) =>
      saveWebsiteForm(tx, actor, { ...defaultSettings, budgetMode: "required", heading: "Plan your trip" }),
    );
    expect(saved).toMatchObject({
      enabled: false,
      budgetMode: "required",
      heading: "Plan your trip",
      createdBy: actor.userId,
    });
    expect(saved.keySecret).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(await test.db.forOrg(organizationId, (tx) => tx.websiteForm.count())).toBe(1);
  });

  it("audits fields, words and embedding apart, by modes, flags and lengths, and nothing when nothing changed", async () => {
    const organizationId = await anAgency(test);
    const actor = staff(organizationId);
    const save = (settings: Partial<typeof defaultSettings>) =>
      test.db.forOrg(organizationId, (tx) => saveWebsiteForm(tx, actor, { ...defaultSettings, ...settings }));
    await save({});
    expect(await auditOf(organizationId)).toEqual([]);
    await save({ budgetMode: "optional", heading: "Hello there", allowEmbed: false });
    await save({ budgetMode: "optional", heading: "Hello there", allowEmbed: false });
    const entries = await auditOf(organizationId);
    expect(entries.map((entry) => entry.action)).toEqual([
      "website-form.fields-changed",
      "website-form.words-changed",
      "website-form.embed-changed",
    ]);
    expect(entries.map((entry) => entry.source)).toEqual(["web", "web", "web"]);
    expect(entries[0]).toMatchObject({ before: { budgetMode: "off" }, after: { budgetMode: "optional" } });
    expect(entries[1]?.after).toMatchObject({ headingLength: 11 });
    expect(JSON.stringify(entries)).not.toContain("Hello there");
  });

  it("refuses a website or privacy address that is not https", async () => {
    const organizationId = await anAgency(test);
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        saveWebsiteForm(tx, staff(organizationId), { ...defaultSettings, websiteUrl: "http://agency.example" }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "FORM_LINK_INVALID" });
  });

  it("turn on writes one audit entry, and turning on again writes none", async () => {
    const organizationId = await anAgency(test);
    const actor = staff(organizationId);
    const turn = (enabled: boolean) =>
      test.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, actor, enabled));
    expect((await turn(true)).enabled).toBe(true);
    await turn(true);
    expect((await auditOf(organizationId)).map((entry) => entry.action)).toEqual(["website-form.turned-on"]);
    expect((await turn(false)).enabled).toBe(false);
    expect((await auditOf(organizationId)).map((entry) => entry.action)).toEqual([
      "website-form.turned-on",
      "website-form.turned-off",
    ]);
  });

  it("turning on with no form makes it, with the defaults of W2", async () => {
    const organizationId = await anAgency(test);
    const form = await test.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, staff(organizationId), true));
    expect(form).toMatchObject({
      enabled: true,
      allowEmbed: true,
      emailMode: "optional",
      budgetMode: "off",
      offersTickbox: false,
    });
  });

  it("two people making the first form at once make one", async () => {
    const organizationId = await anAgency(test);
    await Promise.all([
      test.db.forOrg(organizationId, (tx) => saveWebsiteForm(tx, staff(organizationId), defaultSettings)),
      test.db.forOrg(organizationId, (tx) => saveWebsiteForm(tx, staff(organizationId), defaultSettings)),
    ]);
    expect(await test.db.forOrg(organizationId, (tx) => tx.websiteForm.count())).toBe(1);
  });

  it("change the link writes a new secret, and no audit entry holds a key", async () => {
    const organizationId = await anAgency(test);
    const actor = staff(organizationId);
    const first = await test.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, actor, true));
    const second = await test.db.forOrg(organizationId, (tx) => changeWebsiteFormLink(tx, actor, testNow));
    expect(second.keySecret).not.toBe(first.keySecret);
    expect(second.keyChangedAt).toEqual(testNow);
    const entries = await auditOf(organizationId);
    expect(entries.map((entry) => entry.action)).toContain("website-form.link-changed");
    const logged = JSON.stringify(entries);
    for (const secret of [first.keySecret, second.keySecret, formKeyOf(organizationId, second.keySecret)]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("the old key stops working", async () => {
    const organizationId = await anAgency(test);
    const actor = staff(organizationId);
    const first = await test.db.forOrg(organizationId, (tx) => setWebsiteFormEnabled(tx, actor, true));
    const oldKey = formKeyOf(organizationId, first.keySecret);
    const ownerUserId = anOwnerId();
    const open = (key: string) =>
      test.db.forOrg(organizationId, (tx) => assertFormOpen(tx, { key, organizationId, ownerUserId, now: testNow }));
    await expect(open(oldKey)).resolves.toBeDefined();
    const second = await test.db.forOrg(organizationId, (tx) => changeWebsiteFormLink(tx, actor, testNow));
    await expect(open(oldKey)).rejects.toMatchObject({ code: "NOT_FOUND", reason: "FORM_NOT_FOUND" });
    await expect(open(formKeyOf(organizationId, second.keySecret))).resolves.toBeDefined();
  });

  it("has no link to change before the first save", async () => {
    const organizationId = await anAgency(test);
    await expect(
      test.db.forOrg(organizationId, (tx) => changeWebsiteFormLink(tx, staff(organizationId), testNow)),
    ).rejects.toMatchObject({ reason: "FORM_NOT_FOUND" });
  });
});

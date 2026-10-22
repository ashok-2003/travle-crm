// Consent to offers (spec 13, journey 10; spec 0.1.2). While the switch (`features.marketingConsent`) is off nothing
// shows or takes it: no switch on the settings page, no tickbox on the form, and an `offers` answer sent straight to the api
// is refused. The cases with the switch on run when the constant is true: the tick records the exact words, no tick records
// nothing and never withdraws, staff record that the person stopped, and a later tick grants again.
import { features } from "@travel-crm/contracts/features";
import { offersWording, type WebsiteFormPublic } from "@travel-crm/contracts/website-forms";
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { expect, signInByEmail, test } from "./support/fixtures";
import { callApi } from "./support/leads";
import {
  fillVisitor,
  getForm,
  keyOf,
  leadsOfPhone,
  newAddress,
  newPhone,
  openForm,
  openHosted,
  postEnquiry,
  turnOnForm,
  viaProxy,
  visitorsDevice,
} from "./support/website-form";

const offersSentence = offersWording("Sharma Travels");

test.describe("while the consent switch is off", () => {
  test.skip(features.marketingConsent, "the switch is on: the cases below are for the off state");

  test("no switch, no tickbox, and an offers answer is refused", async ({ page, request, browser, agency }) => {
    await signInByEmail(page, agency.owner);
    const key = keyOf(await turnOnForm(page));
    await page.goto("/settings/lead-sources/website-form");
    await expect(page.getByRole("heading", { level: 1, name: "Website form" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Ask for permission to send offers" })).toHaveCount(0);

    const visitor = await visitorsDevice(browser);
    const form = await openHosted(visitor, key);
    await expect(form.getByLabel("Your name", { exact: true })).toBeVisible();
    await expect(form.getByRole("checkbox")).toHaveCount(0);
    await visitor.close();

    const headers = viaProxy(newAddress());
    const opened = (await (await getForm(request, key, { headers })).json()) as WebsiteFormPublic;
    expect(opened).toMatchObject({ available: true, form: { offersTickbox: false } });
    const { openedToken } = await openForm(request, key, { headers });
    const refused = await postEnquiry(request, key, { openedToken, offers: true }, headers);
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({ reason: "FORM_OFFERS_NOT_AVAILABLE" });
  });
});

test.describe("with the consent switch on", () => {
  test.skip(!features.marketingConsent, "the switch is off (spec 0.1.2): the unit tests prove these with it mocked on");

  test("a tick records the exact words, no tick records nothing, staff record a stop, a later tick grants again", async ({
    page,
    browser,
    agency,
    database,
  }) => {
    test.slow();
    await signInByEmail(page, agency.owner);
    const key = keyOf(await turnOnForm(page, { offersTickbox: true }));
    const visitor = await visitorsDevice(browser);
    const send = async (name: string, phone: string, tick: boolean) => {
      const form = await openHosted(visitor, key);
      await fillVisitor(form, { name, phone });
      if (tick) await form.getByRole("checkbox", { name: offersSentence }).check();
      await form.waitForTimeout(2_200);
      await form.getByRole("button", { name: "Send enquiry" }).click();
      await expect(form.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
    };

    const ticked = newPhone();
    await send("Meera Pillai", ticked, true);
    const unticked = newPhone();
    await send("Ishaan Rao", unticked, false);

    const [yes] = await leadsOfPhone(page, ticked);
    await page.goto(`/leads/${yes?.id ?? ""}`);
    await expect(page.getByText(/Agreed to offers on .*, from the website form/)).toBeVisible();
    const [no] = await leadsOfPhone(page, unticked);
    await page.goto(`/leads/${no?.id ?? ""}`);
    await expect(page.getByRole("heading", { level: 1, name: "Ishaan Rao" })).toBeVisible();
    await expect(page.getByText(/offers on/)).toHaveCount(0);

    // Staff record that the person stopped, as they might on WhatsApp.
    await page.goto(`/leads/${yes?.id ?? ""}`);
    await page.getByRole("button", { name: "Record that they stopped" }).click();
    await page
      .getByRole("alertdialog", { name: "Record that they stopped?" })
      .getByRole("button", { name: "Record that they stopped" })
      .click();
    await expect(page.getByText(/Asked to stop offers on/)).toBeVisible();

    // A later tick grants again, and the exact words are kept.
    await send("Meera Pillai", ticked, true);
    await page.goto(`/leads/${yes?.id ?? ""}`);
    await expect(page.getByText(/Agreed to offers on .*, from the website form/)).toBeVisible();
    // The ledger keeps the words shown, each row; the person who never ticked has none.
    const personId = (await callApi<LeadDetail>(page, "leads.get", { leadId: yes?.id })).person.id;
    const rows = await database.platform.personConsent.findMany({
      where: { organizationId: agency.organizationId },
      orderBy: { recordedAt: "asc" },
    });
    expect(rows.map((row) => [row.personId === personId, row.action, row.source])).toEqual([
      [true, "granted", "web_form"],
      [true, "withdrawn", "staff"],
      [true, "granted", "web_form"],
    ]);
    expect(rows.filter((row) => row.action === "granted").map((row) => row.wording)).toEqual([
      offersSentence,
      offersSentence,
    ]);
  });
});
